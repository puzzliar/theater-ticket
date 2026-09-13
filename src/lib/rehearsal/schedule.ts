import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate, fmtTime, overlaps, ts } from "./time";
import { SESSION_KIND_LABEL, type SessionKind, type SessionStatus, type Response, type SceneProgressRow } from "./types";

// 個人の予定(全組織横断)と、稽古枠に対する参加可否判定。
// ここは service role で動く。他組織の予定は「他現場」という判定結果にだけ変換して返し、内容は返さない。

export interface MemberSession {
  id: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  participantId: string;
  productionId: string;
  productionName: string;
  kind: SessionKind;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  note: string;
  status: SessionStatus;
  response: Response;
  required: boolean;
  scenes: { code: string; name: string }[];
}

type Row = {
  participant_id: string;
  required: boolean;
  response: Response;
  rh_participants: { profile_id: string | null } | null;
  rh_sessions: {
    id: string;
    org_id: string;
    production_id: string;
    kind: SessionKind;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    note: string;
    status: SessionStatus;
    rh_productions: { name: string; core_organizations: { slug: string; name: string } | null } | null;
    rh_session_scenes: { rh_scenes: { code: string; name: string; sort_order: number } | null }[];
  };
};

const SELECT =
  "participant_id, required, response, rh_participants!inner(profile_id), rh_sessions!inner(id, org_id, production_id, kind, title, starts_at, ends_at, location, note, status, rh_productions(name, core_organizations(slug, name)), rh_session_scenes(rh_scenes(code, name, sort_order)))";

function toMemberSession(r: Row): MemberSession {
  return {
    id: r.rh_sessions.id,
    orgId: r.rh_sessions.org_id,
    orgSlug: r.rh_sessions.rh_productions?.core_organizations?.slug ?? "",
    orgName: r.rh_sessions.rh_productions?.core_organizations?.name ?? "",
    participantId: r.participant_id,
    productionId: r.rh_sessions.production_id,
    productionName: r.rh_sessions.rh_productions?.name ?? "",
    kind: r.rh_sessions.kind,
    title: r.rh_sessions.title,
    startsAt: r.rh_sessions.starts_at,
    endsAt: r.rh_sessions.ends_at,
    location: r.rh_sessions.location,
    note: r.rh_sessions.note,
    status: r.rh_sessions.status,
    response: r.response,
    required: r.required,
    scenes: r.rh_sessions.rh_session_scenes
      .map((s) => s.rh_scenes)
      .filter((s): s is { code: string; name: string; sort_order: number } => Boolean(s))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ code: s.code, name: s.name })),
  };
}

// 本人の召集予定(全組織)
export async function listProfileSessions(profileId: string, fromIso: string, toIso: string, includeCancelled = false): Promise<MemberSession[]> {
  const { data } = await supabaseAdmin()
    .from("rh_session_members")
    .select(SELECT)
    .eq("rh_participants.profile_id", profileId)
    .gte("rh_sessions.starts_at", fromIso)
    .lt("rh_sessions.starts_at", toIso);
  return ((data ?? []) as unknown as Row[])
    .filter((r) => includeCancelled || r.rh_sessions.status !== "cancelled")
    .map(toMemberSession)
    .sort((a, b) => ts(a.startsAt) - ts(b.startsAt));
}

export function sessionLine(s: MemberSession, withDate = true): string {
  const when = `${withDate ? fmtDate(s.startsAt) + " " : ""}${fmtTime(s.startsAt)}〜${fmtTime(s.endsAt)}`;
  const title = s.title ? ` ${s.title}` : "";
  const scenes = s.scenes.length ? ` [${s.scenes.map((x) => x.code).join(", ")}]` : "";
  const place = s.location ? ` @${s.location}` : "";
  return `${when} ${s.orgName}/${s.productionName}(${SESSION_KIND_LABEL[s.kind]})${title}${scenes}${place}`;
}

export type AvailabilityVerdict =
  | { status: "available"; detail: string }
  | { status: "unavailable"; detail: string }
  | { status: "conflict"; detail: string }
  | { status: "unknown"; detail: string };

// 参加者ごとの参加可否。仮メンバー(profile なし)は常に unknown。
// 他組織の召集は「他現場」とだけ返す(要件 4.3)。同一組織の重複は組織名を出す。
export async function checkAvailability(
  participantIds: string[],
  startIso: string,
  endIso: string,
  excludeSessionId?: string,
): Promise<Map<string, AvailabilityVerdict>> {
  const result = new Map<string, AvailabilityVerdict>();
  if (participantIds.length === 0) return result;
  const admin = supabaseAdmin();

  const { data: parts } = await admin.from("rh_participants").select("id, org_id, profile_id").in("id", participantIds);
  const participants = (parts ?? []) as { id: string; org_id: string; profile_id: string | null }[];
  const profileIds = [...new Set(participants.map((p) => p.profile_id).filter((x): x is string => Boolean(x)))];

  const [{ data: avail }, { data: booked }] = profileIds.length
    ? await Promise.all([
        admin.from("rh_availability").select("profile_id, starts_at, ends_at, status, note").in("profile_id", profileIds).lt("starts_at", endIso).gt("ends_at", startIso),
        admin
          .from("rh_session_members")
          .select("participant_id, response, rh_participants!inner(profile_id, org_id), rh_sessions!inner(id, org_id, starts_at, ends_at, status, rh_productions(name))")
          .in("rh_participants.profile_id", profileIds)
          .neq("response", "no")
          .lt("rh_sessions.starts_at", endIso)
          .gt("rh_sessions.ends_at", startIso),
      ])
    : [{ data: [] }, { data: [] }];

  type Booked = {
    participant_id: string;
    response: Response;
    rh_participants: { profile_id: string; org_id: string };
    rh_sessions: { id: string; org_id: string; starts_at: string; ends_at: string; status: SessionStatus; rh_productions: { name: string } | null };
  };

  for (const p of participants) {
    if (!p.profile_id) {
      result.set(p.id, { status: "unknown", detail: "未登録(仮メンバー)" });
      continue;
    }
    const conflicts = ((booked ?? []) as unknown as Booked[]).filter(
      (b) =>
        b.rh_participants.profile_id === p.profile_id &&
        b.rh_sessions.status !== "cancelled" &&
        b.rh_sessions.id !== excludeSessionId &&
        overlaps(b.rh_sessions.starts_at, b.rh_sessions.ends_at, startIso, endIso),
    );
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const sameOrg = c.rh_sessions.org_id === p.org_id;
      result.set(p.id, {
        status: "conflict",
        detail: sameOrg
          ? `重複: ${c.rh_sessions.rh_productions?.name ?? ""} ${fmtTime(c.rh_sessions.starts_at)}〜${fmtTime(c.rh_sessions.ends_at)}`
          : `他現場 ${fmtTime(c.rh_sessions.starts_at)}〜${fmtTime(c.rh_sessions.ends_at)}`,
      });
      continue;
    }
    const mine = (avail ?? []).filter((a) => a.profile_id === p.profile_id && overlaps(a.starts_at, a.ends_at, startIso, endIso));
    const ng = mine.find((a) => a.status === "unavailable");
    if (ng) {
      result.set(p.id, { status: "unavailable", detail: `不可 ${fmtTime(ng.starts_at)}〜${fmtTime(ng.ends_at)}${ng.note ? ` (${ng.note})` : ""}` });
      continue;
    }
    const ok = mine.find((a) => a.status === "available" && ts(a.starts_at) <= ts(startIso) && ts(a.ends_at) >= ts(endIso));
    if (ok) {
      result.set(p.id, { status: "available", detail: `可 ${fmtTime(ok.starts_at)}〜${fmtTime(ok.ends_at)}` });
      continue;
    }
    const partial = mine.find((a) => a.status === "available");
    result.set(p.id, { status: "unknown", detail: partial ? `一部のみ可 ${fmtTime(partial.starts_at)}〜${fmtTime(partial.ends_at)}` : "未回答" });
  }
  return result;
}

export async function sceneProgress(productionId: string): Promise<SceneProgressRow[]> {
  const { data } = await supabaseAdmin().from("rh_scene_progress_v1").select("*").eq("production_id", productionId).order("sort_order");
  return (data ?? []) as SceneProgressRow[];
}
