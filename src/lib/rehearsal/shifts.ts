import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifySessionMembers } from "./core";
import { removeEventForParticipant, syncSession } from "./google-sync";
import { jstToIso, overlaps } from "./time";
import type { Response, ShiftRoleRow } from "./types";

// シフト制の公演(要件 5.17): 回(= rh_sessions kind=performance)ごとに役割(rh_shift_roles)を埋める。
// 1) 回を一括生成 → 2) 公演メンバーを候補(assignment=candidate)として登録し「入れる回」を聞く
// → 3) 入れる人から確定(assignment=assigned + 役割)。確定した人だけに召集・カレンダー同期・リマインドが届く。

export class ShiftError extends Error {}

export async function listShiftRoles(productionId: string): Promise<ShiftRoleRow[]> {
  const { data } = await supabaseAdmin().from("rh_shift_roles").select("*").eq("production_id", productionId).order("sort_order").order("created_at");
  return (data ?? []) as ShiftRoleRow[];
}

export interface SlotSpec {
  from: string; // YYYY-MM-DD
  to: string;
  times: string[]; // HH:MM 開始時刻の一覧
  durationMin: number;
  weekdays: number[]; // 0=日 … 6=土。空なら毎日
  titlePattern: string; // "{n}回目" など。{n}=その日の通し番号 {time}=開始時刻
  location: string;
  tentative: boolean;
}

// 日付範囲 × 開始時刻で回を一括生成(同じ日時の回が既にあれば作らない)
export async function generateShiftSlots(orgId: string, productionId: string, spec: SlotSpec): Promise<string[]> {
  const admin = supabaseAdmin();
  if (!spec.from || !spec.to || spec.to < spec.from) throw new ShiftError("期間を正しく指定してください");
  if (spec.times.length === 0) throw new ShiftError("開始時刻を 1 つ以上入力してください");
  const dur = Math.max(15, Math.min(12 * 60, spec.durationMin || 60));
  const { data: existing } = await admin.from("rh_sessions").select("starts_at").eq("production_id", productionId).neq("status", "cancelled");
  const have = new Set((existing ?? []).map((s) => new Date(s.starts_at).toISOString()));
  const rows: { org_id: string; production_id: string; kind: "performance"; title: string; starts_at: string; ends_at: string; location: string; tentative: boolean }[] = [];
  const start = new Date(`${spec.from}T00:00:00+09:00`);
  const end = new Date(`${spec.to}T00:00:00+09:00`);
  for (let d = new Date(start); d <= end && rows.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const wd = new Date(`${date}T00:00:00+09:00`).getUTCDay(); // JST 0:00 は UTC 前日 15:00 だが曜日計算は日付文字列から
    const jstWeekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    void wd;
    if (spec.weekdays.length && !spec.weekdays.includes(jstWeekday)) continue;
    let n = 0;
    for (const t of [...spec.times].sort()) {
      n++;
      const startsAt = jstToIso(`${date}T${t}`);
      if (have.has(new Date(startsAt).toISOString())) continue;
      const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString();
      rows.push({ org_id: orgId, production_id: productionId, kind: "performance", title: spec.titlePattern.replace("{n}", String(n)).replace("{time}", t), starts_at: startsAt, ends_at: endsAt, location: spec.location, tentative: spec.tentative });
    }
  }
  if (rows.length === 0) return [];
  const { data, error } = await admin.from("rh_sessions").insert(rows).select("id");
  if (error) throw new ShiftError(error.message);
  return (data ?? []).map((r) => r.id);
}

// 公演メンバー全員(または指定)を候補として登録し、希望を聞く通知を送る。既に行がある人はそのまま
export async function openShiftRequests(orgId: string, productionId: string, opts: { sessionIds?: string[]; participantIds?: string[]; notify: boolean }): Promise<{ sessions: number; rows: number }> {
  const admin = supabaseAdmin();
  let sq = admin.from("rh_sessions").select("id").eq("production_id", productionId).eq("status", "scheduled").gte("starts_at", new Date().toISOString());
  if (opts.sessionIds?.length) sq = sq.in("id", opts.sessionIds);
  const { data: sessions } = await sq;
  const { data: pm } = await admin.from("rh_production_members").select("participant_id, rh_participants!inner(is_active)").eq("production_id", productionId).eq("rh_participants.is_active", true);
  let participantIds = (pm ?? []).map((m) => m.participant_id);
  if (opts.participantIds?.length) participantIds = participantIds.filter((id) => opts.participantIds!.includes(id));
  let rows = 0;
  for (const s of sessions ?? []) {
    const { data: existing } = await admin.from("rh_session_members").select("participant_id").eq("session_id", s.id);
    const have = new Set((existing ?? []).map((e) => e.participant_id));
    const toInsert = participantIds.filter((p) => !have.has(p)).map((p) => ({ session_id: s.id, participant_id: p, org_id: orgId, assignment: "candidate", required: false }));
    if (toInsert.length) {
      const { error } = await admin.from("rh_session_members").insert(toInsert);
      if (error) throw new ShiftError(error.message);
      rows += toInsert.length;
      if (opts.notify) await notifySessionMembers(s.id, "shift_request", toInsert.map((r) => r.participant_id));
    }
  }
  return { sessions: (sessions ?? []).length, rows };
}

// 確定: 候補(または未登録)の人を役割つきで召集にする。本人には召集として通知し、カレンダーに同期する
export async function assignShift(orgId: string, sessionId: string, participantId: string, roleId: string | null, notify = true): Promise<void> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("rh_session_members").select("response").eq("session_id", sessionId).eq("participant_id", participantId).maybeSingle();
  const response: Response = existing?.response === "no" ? "pending" : (existing?.response as Response | undefined) ?? "pending";
  const { error } = await admin
    .from("rh_session_members")
    .upsert({ session_id: sessionId, participant_id: participantId, org_id: orgId, assignment: "assigned", shift_role_id: roleId, required: true, response, notified_at: null }, { onConflict: "session_id,participant_id" });
  if (error) throw new ShiftError(error.message);
  if (notify) await notifySessionMembers(sessionId, "invite", [participantId]);
  await syncSession(sessionId, [participantId]);
}

// 確定を取り消して候補に戻す(カレンダーからも消す)
export async function unassignShift(sessionId: string, participantId: string): Promise<void> {
  await removeEventForParticipant(sessionId, participantId);
  const { error } = await supabaseAdmin()
    .from("rh_session_members")
    .update({ assignment: "candidate", shift_role_id: null, required: false, google_event_id: null })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);
  if (error) throw new ShiftError(error.message);
}

export interface ShiftBoardRow {
  session: { id: string; title: string; starts_at: string; ends_at: string; location: string; status: string; tentative: boolean; respond_by: string | null };
  members: { participant_id: string; name: string; response: Response; assignment: "candidate" | "assigned"; shift_role_id: string | null; profile_id: string | null }[];
}

export async function loadShiftBoard(productionId: string, fromIso: string): Promise<ShiftBoardRow[]> {
  const { data } = await supabaseAdmin()
    .from("rh_sessions")
    .select("id, title, starts_at, ends_at, location, status, tentative, respond_by, rh_session_members(participant_id, response, assignment, shift_role_id, rh_participants(display_name, profile_id))")
    .eq("production_id", productionId)
    .eq("kind", "performance")
    .neq("status", "cancelled")
    .gte("starts_at", fromIso)
    .order("starts_at");
  type R = ShiftBoardRow["session"] & { rh_session_members: { participant_id: string; response: Response; assignment: "candidate" | "assigned"; shift_role_id: string | null; rh_participants: { display_name: string; profile_id: string | null } | null }[] };
  return ((data ?? []) as unknown as R[]).map(({ rh_session_members, ...session }) => ({
    session,
    members: rh_session_members
      .map((m) => ({ participant_id: m.participant_id, name: m.rh_participants?.display_name ?? "?", response: m.response, assignment: m.assignment, shift_role_id: m.shift_role_id, profile_id: m.rh_participants?.profile_id ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")),
  }));
}

// 希望(入れる)から未充足の役割を自動で埋める。確定済みの回数が少ない人から順に、同じ時間帯に確定済みの人は避ける
export async function autoAssign(orgId: string, productionId: string): Promise<number> {
  const [roles, board] = await Promise.all([listShiftRoles(productionId), loadShiftBoard(productionId, new Date().toISOString())]);
  if (roles.length === 0) throw new ShiftError("先に役割(案内人・受付など)を登録してください");
  const assignedCount = new Map<string, number>();
  const assignedTimes = new Map<string, { s: string; e: string }[]>();
  for (const row of board) {
    for (const m of row.members.filter((x) => x.assignment === "assigned")) {
      assignedCount.set(m.participant_id, (assignedCount.get(m.participant_id) ?? 0) + 1);
      assignedTimes.set(m.participant_id, [...(assignedTimes.get(m.participant_id) ?? []), { s: row.session.starts_at, e: row.session.ends_at }]);
    }
  }
  let made = 0;
  for (const row of board) {
    if (row.session.status !== "scheduled") continue;
    for (const role of roles) {
      const filled = row.members.filter((m) => m.assignment === "assigned" && m.shift_role_id === role.id).length;
      let need = role.required_count - filled;
      if (need <= 0) continue;
      const candidates = row.members
        .filter((m) => m.assignment === "candidate" && m.response === "yes")
        .filter((m) => !(assignedTimes.get(m.participant_id) ?? []).some((t) => overlaps(t.s, t.e, row.session.starts_at, row.session.ends_at)))
        .sort((a, b) => (assignedCount.get(a.participant_id) ?? 0) - (assignedCount.get(b.participant_id) ?? 0) || a.name.localeCompare(b.name, "ja"));
      for (const c of candidates) {
        if (need <= 0) break;
        await assignShift(orgId, row.session.id, c.participant_id, role.id, false);
        c.assignment = "assigned";
        c.shift_role_id = role.id;
        assignedCount.set(c.participant_id, (assignedCount.get(c.participant_id) ?? 0) + 1);
        assignedTimes.set(c.participant_id, [...(assignedTimes.get(c.participant_id) ?? []), { s: row.session.starts_at, e: row.session.ends_at }]);
        need--;
        made++;
      }
    }
  }
  return made;
}

// 確定したが未通知の人にまとめて召集を送る(自動割り当ての後など)
export async function notifyAssigned(productionId: string): Promise<number> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("rh_session_members")
    .select("session_id, participant_id, rh_sessions!inner(production_id, status, starts_at)")
    .eq("rh_sessions.production_id", productionId)
    .eq("rh_sessions.status", "scheduled")
    .gte("rh_sessions.starts_at", new Date().toISOString())
    .eq("assignment", "assigned")
    .is("notified_at", null);
  const bySession = new Map<string, string[]>();
  for (const r of (data ?? []) as { session_id: string; participant_id: string }[]) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r.participant_id]);
  let sent = 0;
  for (const [sid, ids] of bySession) sent += await notifySessionMembers(sid, "invite", ids);
  return sent;
}

export interface ShiftTally {
  participant_id: string;
  name: string;
  assigned: number;
  yes: number;
  pending: number;
}

export function tally(board: ShiftBoardRow[]): ShiftTally[] {
  const map = new Map<string, ShiftTally>();
  for (const row of board) {
    for (const m of row.members) {
      const t = map.get(m.participant_id) ?? { participant_id: m.participant_id, name: m.name, assigned: 0, yes: 0, pending: 0 };
      if (m.assignment === "assigned") t.assigned++;
      else if (m.response === "yes") t.yes++;
      else if (m.response === "pending") t.pending++;
      map.set(m.participant_id, t);
    }
  }
  return [...map.values()].sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name, "ja"));
}
