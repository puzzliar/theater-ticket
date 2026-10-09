import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { accessTokenFrom, deleteEvent, freeBusy, googleConfigured, upsertEvent, GoogleApiError } from "@/lib/google-calendar";
import { ts } from "./time";
import { SESSION_KIND_LABEL, RESPONSE_LABEL, type SessionKind, type SessionStatus, type Response } from "./types";
import type { Mode } from "@/lib/core/types";

// 召集(rh_session_members)を本人の Google カレンダーへ同期する(要件 5.7 方式B)。
// 連携情報は core_identities(provider=google_calendar, mode)、カレンダー設定は rh_profile_settings。
// 出演者モードの連携: 自分が召集された予定を同期(イベント ID は rh_session_members.google_event_id)。
// 主催者モードの連携: 自分が管理者の座組の全予定を同期(イベント ID は rh_calendar_events)。別の Google アカウントを使える。
// 失敗しても本体の処理は止めない(ログのみ)。iCal フィードが常にフォールバック。

interface Cal {
  profileId: string;
  mode: Mode;
  secretEnc: string;
  calendarId: string;
}

interface SessionForSync {
  id: string;
  org_id: string;
  kind: SessionKind;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  note: string;
  status: SessionStatus;
  rh_productions: { name: string; core_organizations: { name: string } | null } | null;
  rh_session_scenes: { rh_scenes: { code: string; name: string } | null }[];
}

function eventInput(s: SessionForSync, response: Response | null) {
  const scenes = s.rh_session_scenes.map((x) => x.rh_scenes).filter(Boolean) as { code: string; name: string }[];
  return {
    summary: `[${SESSION_KIND_LABEL[s.kind]}] ${s.rh_productions?.core_organizations?.name ?? ""} ${s.rh_productions?.name ?? ""}${s.title ? ` ${s.title}` : ""}`,
    description: [scenes.length ? `シーン: ${scenes.map((x) => `${x.code} ${x.name}`).join(" / ")}` : "", response ? `出欠: ${RESPONSE_LABEL[response]}` : "主催者用カレンダー(座組の予定)", s.note, response ? `${SITE_URL}/me` : `${SITE_URL}/manage`].filter(Boolean).join("\n"),
    location: s.location,
    start: s.starts_at,
    end: s.ends_at,
  };
}

async function calFor(profileId: string, mode: Mode = "cast"): Promise<Cal | null> {
  const admin = supabaseAdmin();
  const [{ data: ident }, { data: settings }] = await Promise.all([
    admin.from("core_identities").select("secret_enc").eq("profile_id", profileId).eq("provider", "google_calendar").eq("mode", mode).maybeSingle(),
    admin.from("rh_profile_settings").select("google_calendar_id").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (!ident?.secret_enc) return null;
  // カレンダー ID の設定は出演者用。主催者用は常に primary(連携した Google アカウントのメインカレンダー)
  return { profileId, mode, secretEnc: ident.secret_enc, calendarId: mode === "cast" ? settings?.google_calendar_id ?? "primary" : "primary" };
}

async function tokenFor(cal: Cal, cache: Map<string, string | null>): Promise<string | null> {
  const key = `${cal.profileId}:${cal.mode}`;
  if (cache.has(key)) return cache.get(key)!;
  let token: string | null = null;
  try {
    token = await accessTokenFrom(cal.secretEnc);
  } catch (e) {
    console.error("google token refresh failed", cal.profileId, cal.mode, e);
    if (e instanceof GoogleApiError && e.status === 400) {
      // 認可取り消し(invalid_grant): 連携を解除して再連携を促す
      await supabaseAdmin().from("core_identities").delete().eq("profile_id", cal.profileId).eq("provider", "google_calendar").eq("mode", cal.mode);
    }
  }
  cache.set(key, token);
  return token;
}

async function loadSession(sessionId: string): Promise<SessionForSync | null> {
  const { data } = await supabaseAdmin()
    .from("rh_sessions")
    .select("id, org_id, kind, title, starts_at, ends_at, location, note, status, rh_productions(name, core_organizations(name)), rh_session_scenes(rh_scenes(code, name))")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as unknown as SessionForSync | null) ?? null;
}

async function syncOne(session: SessionForSync, participantId: string, cal: Cal, response: Response, eventId: string | null, cache: Map<string, string | null>): Promise<void> {
  const admin = supabaseAdmin();
  const token = await tokenFor(cal, cache);
  if (!token) return;
  const shouldExist = session.status !== "cancelled" && response !== "no";
  try {
    if (!shouldExist) {
      if (eventId) {
        await deleteEvent(token, cal.calendarId, eventId);
        await admin.from("rh_session_members").update({ google_event_id: null }).eq("session_id", session.id).eq("participant_id", participantId);
      }
      return;
    }
    const newId = await upsertEvent(token, cal.calendarId, eventId, eventInput(session, response));
    if (newId !== eventId) {
      await admin.from("rh_session_members").update({ google_event_id: newId }).eq("session_id", session.id).eq("participant_id", participantId);
    }
  } catch (e) {
    console.error("google sync failed", session.id, participantId, e);
  }
}

// 主催者モードのカレンダー: 座組の管理者で主催者用の連携がある人に、座組の全予定を同期する
async function organizerCalsFor(orgId: string): Promise<Cal[]> {
  const admin = supabaseAdmin();
  const { data: admins } = await admin.from("core_org_members").select("profile_id").eq("org_id", orgId).eq("status", "active").in("role", ["owner", "admin"]);
  const cals: Cal[] = [];
  for (const a of admins ?? []) {
    const cal = await calFor(a.profile_id, "organizer");
    if (cal) cals.push(cal);
  }
  return cals;
}

async function syncOrganizerOne(session: SessionForSync, cal: Cal, cache: Map<string, string | null>): Promise<void> {
  const admin = supabaseAdmin();
  const token = await tokenFor(cal, cache);
  if (!token) return;
  const { data: row } = await admin.from("rh_calendar_events").select("event_id").eq("session_id", session.id).eq("profile_id", cal.profileId).maybeSingle();
  const eventId = row?.event_id ?? null;
  try {
    if (session.status === "cancelled") {
      if (eventId) {
        await deleteEvent(token, cal.calendarId, eventId);
        await admin.from("rh_calendar_events").delete().eq("session_id", session.id).eq("profile_id", cal.profileId);
      }
      return;
    }
    const newId = await upsertEvent(token, cal.calendarId, eventId, eventInput(session, null));
    if (newId !== eventId) await admin.from("rh_calendar_events").upsert({ session_id: session.id, profile_id: cal.profileId, event_id: newId }, { onConflict: "session_id,profile_id" });
  } catch (e) {
    console.error("google organizer sync failed", session.id, cal.profileId, e);
  }
}

// 予定の召集メンバー(連携済みの人)と、座組の管理者(主催者用連携)を同期
export async function syncSession(sessionId: string, onlyParticipantIds?: string[]): Promise<void> {
  if (!googleConfigured()) return;
  const session = await loadSession(sessionId);
  if (!session) return;
  const orgCache = new Map<string, string | null>();
  for (const cal of await organizerCalsFor(session.org_id)) await syncOrganizerOne(session, cal, orgCache);
  let q = supabaseAdmin()
    .from("rh_session_members")
    .select("participant_id, response, google_event_id, rh_participants!inner(profile_id)")
    .eq("session_id", sessionId)
    .not("rh_participants.profile_id", "is", null);
  if (onlyParticipantIds?.length) q = q.in("participant_id", onlyParticipantIds);
  const { data } = await q;
  const cache = new Map<string, string | null>();
  const cals = new Map<string, Cal | null>();
  for (const r of (data ?? []) as unknown as { participant_id: string; response: Response; google_event_id: string | null; rh_participants: { profile_id: string } }[]) {
    const pid = r.rh_participants.profile_id;
    if (!cals.has(pid)) cals.set(pid, await calFor(pid));
    const cal = cals.get(pid);
    if (!cal) continue;
    await syncOne(session, r.participant_id, cal, r.response, r.google_event_id, cache);
  }
}

// 召集から外す前に呼ぶ(行が消えるとイベントIDが失われるため)
export async function removeEventForParticipant(sessionId: string, participantId: string): Promise<void> {
  if (!googleConfigured()) return;
  const { data } = await supabaseAdmin()
    .from("rh_session_members")
    .select("google_event_id, rh_participants!inner(profile_id)")
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .maybeSingle();
  const row = data as unknown as { google_event_id: string | null; rh_participants: { profile_id: string | null } } | null;
  if (!row?.google_event_id || !row.rh_participants.profile_id) return;
  const cal = await calFor(row.rh_participants.profile_id);
  if (!cal) return;
  const token = await tokenFor(cal, new Map());
  if (!token) return;
  try {
    await deleteEvent(token, cal.calendarId, row.google_event_id);
  } catch (e) {
    console.error("google delete failed", sessionId, participantId, e);
  }
}

// 連携直後: 今後の予定をまとめて同期(出演者: 召集された予定 / 主催者: 管理者である座組の全予定)
export async function syncProfileUpcoming(profileId: string, mode: Mode = "cast"): Promise<number> {
  if (!googleConfigured()) return 0;
  const cal = await calFor(profileId, mode);
  if (!cal) return 0;
  if (mode === "organizer") {
    const admin = supabaseAdmin();
    const { data: orgs } = await admin.from("core_org_members").select("org_id").eq("profile_id", profileId).eq("status", "active").in("role", ["owner", "admin"]);
    const orgIds = (orgs ?? []).map((o) => o.org_id);
    if (orgIds.length === 0) return 0;
    const { data: sessions } = await admin.from("rh_sessions").select("id").in("org_id", orgIds).neq("status", "cancelled").gte("starts_at", new Date().toISOString());
    const cache = new Map<string, string | null>();
    let n = 0;
    for (const s of sessions ?? []) {
      const session = await loadSession(s.id);
      if (!session) continue;
      await syncOrganizerOne(session, cal, cache);
      n++;
    }
    return n;
  }
  const { data: rows } = await supabaseAdmin()
    .from("rh_session_members")
    .select("session_id, participant_id, response, google_event_id, rh_participants!inner(profile_id), rh_sessions!inner(starts_at)")
    .eq("rh_participants.profile_id", profileId)
    .gte("rh_sessions.starts_at", new Date().toISOString());
  const cache = new Map<string, string | null>();
  let n = 0;
  for (const r of (rows ?? []) as unknown as { session_id: string; participant_id: string; response: Response; google_event_id: string | null }[]) {
    const session = await loadSession(r.session_id);
    if (!session) continue;
    await syncOne(session, r.participant_id, cal, r.response, r.google_event_id, cache);
    n++;
  }
  return n;
}

// 連携解除前: 作成したイベントを本人のカレンダーから削除
export async function deleteAllEventsForProfile(profileId: string, mode: Mode = "cast"): Promise<void> {
  if (!googleConfigured()) return;
  const admin = supabaseAdmin();
  const cal = await calFor(profileId, mode);
  if (!cal) return;
  const token = await tokenFor(cal, new Map());
  if (mode === "organizer") {
    const { data: rows } = await admin.from("rh_calendar_events").select("session_id, event_id").eq("profile_id", profileId);
    for (const r of rows ?? []) {
      if (token) {
        try {
          await deleteEvent(token, cal.calendarId, r.event_id);
        } catch (e) {
          console.error("google delete failed", r.session_id, e);
        }
      }
    }
    await admin.from("rh_calendar_events").delete().eq("profile_id", profileId);
    return;
  }
  const { data: rows } = await admin
    .from("rh_session_members")
    .select("session_id, participant_id, google_event_id, rh_participants!inner(profile_id)")
    .eq("rh_participants.profile_id", profileId)
    .not("google_event_id", "is", null);
  for (const r of (rows ?? []) as unknown as { session_id: string; participant_id: string; google_event_id: string }[]) {
    if (token) {
      try {
        await deleteEvent(token, cal.calendarId, r.google_event_id);
      } catch (e) {
        console.error("google delete failed", r.session_id, e);
      }
    }
    await admin.from("rh_session_members").update({ google_event_id: null }).eq("session_id", r.session_id).eq("participant_id", r.participant_id);
  }
}

// FreeBusy 取り込み: 今後 N 週間の「予定あり」を source=calendar の「不可」として登録(calendar 由来の既存行は入れ替え)
export async function importBusyAsUnavailable(profileId: string, weeks = 6): Promise<number> {
  if (!googleConfigured()) return 0;
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("rh_profile_settings").select("google_freebusy_import").eq("profile_id", profileId).maybeSingle();
  if (settings && !settings.google_freebusy_import) return 0;
  const cal = await calFor(profileId);
  if (!cal) return 0;
  const token = await tokenFor(cal, new Map());
  if (!token) return 0;

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + weeks * 7 * 24 * 3600 * 1000).toISOString();
  let busy: { start: string; end: string }[];
  try {
    busy = await freeBusy(token, cal.calendarId, timeMin, timeMax);
  } catch (e) {
    console.error("google freebusy failed", profileId, e);
    return 0;
  }

  // 本システムの召集と一致する時間帯は除外(transparent で登録しているが念のため)
  const { data: mine } = await admin
    .from("rh_session_members")
    .select("rh_participants!inner(profile_id), rh_sessions!inner(starts_at, ends_at)")
    .eq("rh_participants.profile_id", profileId)
    .gte("rh_sessions.starts_at", timeMin);
  const own = ((mine ?? []) as unknown as { rh_sessions: { starts_at: string; ends_at: string } }[]).map((r) => r.rh_sessions);
  const rows = busy
    .filter((b) => !own.some((o) => Math.abs(ts(o.starts_at) - ts(b.start)) < 60_000 && Math.abs(ts(o.ends_at) - ts(b.end)) < 60_000))
    .filter((b) => ts(b.end) > ts(b.start))
    .map((b) => ({ profile_id: profileId, starts_at: b.start, ends_at: b.end, status: "unavailable", note: "Googleカレンダーの予定", source: "calendar" }));

  await admin.from("rh_availability").delete().eq("profile_id", profileId).eq("source", "calendar").gte("ends_at", timeMin);
  if (rows.length) {
    const { error } = await admin.from("rh_availability").insert(rows);
    if (error) console.error("availability import failed", profileId, error.message);
  }
  return rows.length;
}
