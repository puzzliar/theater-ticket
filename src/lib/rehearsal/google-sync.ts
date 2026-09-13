import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID, SITE_URL } from "@/lib/constants";
import { accessTokenFrom, deleteEvent, freeBusy, googleConfigured, upsertEvent, GoogleApiError } from "@/lib/google-calendar";
import { ts } from "./time";
import { SESSION_KIND_LABEL, RESPONSE_LABEL, type SessionKind, type SessionStatus, type Response } from "./types";

// 召集(rh_session_members)を Google カレンダーへ同期する(要件 5.7 方式B)。
// 同期先は「メンバー本人のカレンダー」。中止・不参加・召集解除はイベント削除。
// 失敗しても本体の処理は止めない(ログのみ)。iCal フィードが常にフォールバックとして存在する。

interface MemberTok {
  id: string;
  google_refresh_token_enc: string | null;
  google_calendar_id: string;
}

interface SessionForSync {
  id: string;
  kind: SessionKind;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  note: string;
  status: SessionStatus;
  rh_productions: { name: string } | null;
  rh_session_scenes: { rh_scenes: { code: string; name: string } | null }[];
}

function eventInput(s: SessionForSync, response: Response) {
  const scenes = s.rh_session_scenes.map((x) => x.rh_scenes).filter(Boolean) as { code: string; name: string }[];
  return {
    summary: `[${SESSION_KIND_LABEL[s.kind]}] ${s.rh_productions?.name ?? ""}${s.title ? ` ${s.title}` : ""}`,
    description: [scenes.length ? `シーン: ${scenes.map((x) => `${x.code} ${x.name}`).join(" / ")}` : "", `出欠: ${RESPONSE_LABEL[response]}`, s.note, `${SITE_URL}/me`]
      .filter(Boolean)
      .join("\n"),
    location: s.location,
    start: s.starts_at,
    end: s.ends_at,
  };
}

// アクセストークンをメンバー単位でキャッシュ(1回の同期処理内)
async function tokenFor(m: MemberTok, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(m.id)) return cache.get(m.id)!;
  let token: string | null = null;
  if (m.google_refresh_token_enc) {
    try {
      token = await accessTokenFrom(m.google_refresh_token_enc);
    } catch (e) {
      console.error("google token refresh failed", m.id, e);
      // 認可が取り消された(invalid_grant)場合は連携を解除して再連携を促す
      if (e instanceof GoogleApiError && e.status === 400) {
        await supabaseAdmin().from("rh_members").update({ google_refresh_token_enc: null, google_connected_at: null }).eq("id", m.id);
      }
    }
  }
  cache.set(m.id, token);
  return token;
}

async function loadSession(sessionId: string): Promise<SessionForSync | null> {
  const { data } = await supabaseAdmin()
    .from("rh_sessions")
    .select("id, kind, title, starts_at, ends_at, location, note, status, rh_productions(name), rh_session_scenes(rh_scenes(code, name))")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as unknown as SessionForSync | null) ?? null;
}

async function syncOne(session: SessionForSync, member: MemberTok, response: Response, eventId: string | null, cache: Map<string, string | null>): Promise<void> {
  const admin = supabaseAdmin();
  const token = await tokenFor(member, cache);
  if (!token) return;
  const shouldExist = session.status !== "cancelled" && response !== "no";
  try {
    if (!shouldExist) {
      if (eventId) {
        await deleteEvent(token, member.google_calendar_id, eventId);
        await admin.from("rh_session_members").update({ google_event_id: null }).eq("session_id", session.id).eq("member_id", member.id);
      }
      return;
    }
    const newId = await upsertEvent(token, member.google_calendar_id, eventId, eventInput(session, response));
    if (newId !== eventId) {
      await admin.from("rh_session_members").update({ google_event_id: newId }).eq("session_id", session.id).eq("member_id", member.id);
    }
  } catch (e) {
    console.error("google sync failed", session.id, member.id, e);
  }
}

// 稽古枠の全召集メンバーを同期(作成・変更・中止・復活時)
export async function syncSession(sessionId: string, onlyMemberIds?: string[]): Promise<void> {
  if (!googleConfigured()) return;
  const session = await loadSession(sessionId);
  if (!session) return;
  let q = supabaseAdmin()
    .from("rh_session_members")
    .select("member_id, response, google_event_id, rh_members!inner(id, google_refresh_token_enc, google_calendar_id)")
    .eq("session_id", sessionId)
    .not("rh_members.google_refresh_token_enc", "is", null);
  if (onlyMemberIds?.length) q = q.in("member_id", onlyMemberIds);
  const { data } = await q;
  const cache = new Map<string, string | null>();
  for (const r of (data ?? []) as unknown as { member_id: string; response: Response; google_event_id: string | null; rh_members: MemberTok }[]) {
    await syncOne(session, r.rh_members, r.response, r.google_event_id, cache);
  }
}

// 召集から外す前に呼ぶ(行が消えるとイベントIDが失われるため)
export async function removeEventForMember(sessionId: string, memberId: string): Promise<void> {
  if (!googleConfigured()) return;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("rh_session_members")
    .select("google_event_id, rh_members!inner(id, google_refresh_token_enc, google_calendar_id)")
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .maybeSingle();
  const row = data as unknown as { google_event_id: string | null; rh_members: MemberTok } | null;
  if (!row?.google_event_id) return;
  const token = await tokenFor(row.rh_members, new Map());
  if (!token) return;
  try {
    await deleteEvent(token, row.rh_members.google_calendar_id, row.google_event_id);
  } catch (e) {
    console.error("google delete failed", sessionId, memberId, e);
  }
}

// 連携直後: 今後の召集をまとめて同期
export async function syncMemberUpcoming(memberId: string): Promise<number> {
  if (!googleConfigured()) return 0;
  const admin = supabaseAdmin();
  const { data: member } = await admin.from("rh_members").select("id, google_refresh_token_enc, google_calendar_id").eq("id", memberId).maybeSingle();
  if (!member?.google_refresh_token_enc) return 0;
  const { data: rows } = await admin
    .from("rh_session_members")
    .select("session_id, response, google_event_id, rh_sessions!inner(starts_at, status)")
    .eq("member_id", memberId)
    .gte("rh_sessions.starts_at", new Date().toISOString());
  const cache = new Map<string, string | null>();
  let n = 0;
  for (const r of (rows ?? []) as unknown as { session_id: string; response: Response; google_event_id: string | null }[]) {
    const session = await loadSession(r.session_id);
    if (!session) continue;
    await syncOne(session, member as MemberTok, r.response, r.google_event_id, cache);
    n++;
  }
  return n;
}

// 連携解除前: 作成したイベントを本人のカレンダーから削除
export async function deleteAllEventsForMember(memberId: string): Promise<void> {
  if (!googleConfigured()) return;
  const admin = supabaseAdmin();
  const { data: member } = await admin.from("rh_members").select("id, google_refresh_token_enc, google_calendar_id").eq("id", memberId).maybeSingle();
  if (!member?.google_refresh_token_enc) return;
  const token = await tokenFor(member as MemberTok, new Map());
  if (!token) return;
  const { data: rows } = await admin.from("rh_session_members").select("session_id, google_event_id").eq("member_id", memberId).not("google_event_id", "is", null);
  for (const r of rows ?? []) {
    try {
      await deleteEvent(token, member.google_calendar_id, r.google_event_id!);
    } catch (e) {
      console.error("google delete failed", r.session_id, memberId, e);
    }
  }
  await admin.from("rh_session_members").update({ google_event_id: null }).eq("member_id", memberId);
}

// FreeBusy 取り込み: 今後 N 週間の「予定あり」を source=calendar の「不可」として登録(既存の calendar 由来行は入れ替え)
export async function importBusyAsUnavailable(memberId: string, weeks = 6): Promise<number> {
  if (!googleConfigured()) return 0;
  const admin = supabaseAdmin();
  const { data: member } = await admin
    .from("rh_members")
    .select("id, google_refresh_token_enc, google_calendar_id, google_freebusy_import")
    .eq("id", memberId)
    .maybeSingle();
  if (!member?.google_refresh_token_enc || !member.google_freebusy_import) return 0;
  const token = await tokenFor(member as MemberTok, new Map());
  if (!token) return 0;

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + weeks * 7 * 24 * 3600 * 1000).toISOString();
  let busy: { start: string; end: string }[];
  try {
    busy = await freeBusy(token, member.google_calendar_id, timeMin, timeMax);
  } catch (e) {
    console.error("google freebusy failed", memberId, e);
    return 0;
  }

  // 本システムの召集と一致する時間帯は除外(transparent で登録しているが念のため)
  const { data: mine } = await admin
    .from("rh_session_members")
    .select("rh_sessions!inner(starts_at, ends_at)")
    .eq("member_id", memberId)
    .gte("rh_sessions.starts_at", timeMin);
  const own = ((mine ?? []) as unknown as { rh_sessions: { starts_at: string; ends_at: string } }[]).map((r) => r.rh_sessions);
  const rows = busy
    .filter((b) => !own.some((o) => Math.abs(ts(o.starts_at) - ts(b.start)) < 60_000 && Math.abs(ts(o.ends_at) - ts(b.end)) < 60_000))
    .filter((b) => ts(b.end) > ts(b.start))
    .map((b) => ({ org_id: ORG_ID, member_id: memberId, starts_at: b.start, ends_at: b.end, status: "unavailable", note: "Googleカレンダーの予定", source: "calendar" }));

  await admin.from("rh_availability").delete().eq("member_id", memberId).eq("source", "calendar").gte("ends_at", timeMin);
  if (rows.length) {
    const { error } = await admin.from("rh_availability").insert(rows);
    if (error) console.error("availability import failed", memberId, error.message);
  }
  return rows.length;
}
