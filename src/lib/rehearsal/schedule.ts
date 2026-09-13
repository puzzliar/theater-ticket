import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate, fmtTime, overlaps, ts } from "./time";
import { SESSION_KIND_LABEL, type SessionKind, type SessionStatus, type Response, type SceneProgressRow } from "./types";

// メンバー個人の予定(全プロダクション横断)
export interface MemberSession {
  id: string;
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

export async function listMemberSessions(memberId: string, fromIso: string, toIso: string, includeCancelled = false): Promise<MemberSession[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("rh_session_members")
    .select(
      "required, response, rh_sessions!inner(id, production_id, kind, title, starts_at, ends_at, location, note, status, rh_productions(name), rh_session_scenes(rh_scenes(code, name, sort_order)))",
    )
    .eq("member_id", memberId)
    .gte("rh_sessions.starts_at", fromIso)
    .lt("rh_sessions.starts_at", toIso);

  type Row = {
    required: boolean;
    response: Response;
    rh_sessions: {
      id: string;
      production_id: string;
      kind: SessionKind;
      title: string;
      starts_at: string;
      ends_at: string;
      location: string;
      note: string;
      status: SessionStatus;
      rh_productions: { name: string } | null;
      rh_session_scenes: { rh_scenes: { code: string; name: string; sort_order: number } | null }[];
    };
  };
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => includeCancelled || r.rh_sessions.status !== "cancelled")
    .map((r) => ({
      id: r.rh_sessions.id,
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
    }));
  return rows.sort((a, b) => ts(a.startsAt) - ts(b.startsAt));
}

// LINE/メール用の1行表示
export function sessionLine(s: MemberSession, withDate = true): string {
  const when = `${withDate ? fmtDate(s.startsAt) + " " : ""}${fmtTime(s.startsAt)}〜${fmtTime(s.endsAt)}`;
  const kind = SESSION_KIND_LABEL[s.kind];
  const title = s.title ? ` ${s.title}` : "";
  const scenes = s.scenes.length ? ` [${s.scenes.map((x) => x.code).join(", ")}]` : "";
  const place = s.location ? ` @${s.location}` : "";
  return `${when} ${s.productionName}(${kind})${title}${scenes}${place}`;
}

// 指定時間帯における各メンバーの参加可否判定(要件 5.3)
export type AvailabilityVerdict =
  | { status: "available"; detail: string }
  | { status: "unavailable"; detail: string }
  | { status: "conflict"; detail: string }
  | { status: "unknown"; detail: string };

export async function checkAvailability(
  memberIds: string[],
  startIso: string,
  endIso: string,
  excludeSessionId?: string,
): Promise<Map<string, AvailabilityVerdict>> {
  const result = new Map<string, AvailabilityVerdict>();
  if (memberIds.length === 0) return result;
  const admin = supabaseAdmin();

  const [{ data: avail }, { data: booked }] = await Promise.all([
    admin
      .from("rh_availability")
      .select("member_id, starts_at, ends_at, status, note")
      .in("member_id", memberIds)
      .lt("starts_at", endIso)
      .gt("ends_at", startIso),
    admin
      .from("rh_session_members")
      .select("member_id, response, rh_sessions!inner(id, starts_at, ends_at, status, rh_productions(name))")
      .in("member_id", memberIds)
      .neq("response", "no")
      .lt("rh_sessions.starts_at", endIso)
      .gt("rh_sessions.ends_at", startIso),
  ]);

  type Booked = {
    member_id: string;
    response: Response;
    rh_sessions: { id: string; starts_at: string; ends_at: string; status: SessionStatus; rh_productions: { name: string } | null };
  };

  for (const id of memberIds) {
    const conflicts = ((booked ?? []) as unknown as Booked[]).filter(
      (b) =>
        b.member_id === id &&
        b.rh_sessions.status !== "cancelled" &&
        b.rh_sessions.id !== excludeSessionId &&
        overlaps(b.rh_sessions.starts_at, b.rh_sessions.ends_at, startIso, endIso),
    );
    if (conflicts.length > 0) {
      const c = conflicts[0];
      result.set(id, {
        status: "conflict",
        detail: `他現場: ${c.rh_sessions.rh_productions?.name ?? ""} ${fmtTime(c.rh_sessions.starts_at)}〜${fmtTime(c.rh_sessions.ends_at)}`,
      });
      continue;
    }
    const mine = (avail ?? []).filter((a) => a.member_id === id && overlaps(a.starts_at, a.ends_at, startIso, endIso));
    const ng = mine.find((a) => a.status === "unavailable");
    if (ng) {
      result.set(id, { status: "unavailable", detail: `不可 ${fmtTime(ng.starts_at)}〜${fmtTime(ng.ends_at)}${ng.note ? ` (${ng.note})` : ""}` });
      continue;
    }
    const ok = mine.find((a) => a.status === "available" && ts(a.starts_at) <= ts(startIso) && ts(a.ends_at) >= ts(endIso));
    if (ok) {
      result.set(id, { status: "available", detail: `可 ${fmtTime(ok.starts_at)}〜${fmtTime(ok.ends_at)}` });
      continue;
    }
    const partial = mine.find((a) => a.status === "available");
    result.set(id, {
      status: "unknown",
      detail: partial ? `一部のみ可 ${fmtTime(partial.starts_at)}〜${fmtTime(partial.ends_at)}` : "未回答",
    });
  }
  return result;
}

export async function sceneProgress(productionId: string): Promise<SceneProgressRow[]> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("rh_scene_progress_v1").select("*").eq("production_id", productionId).order("sort_order");
  return (data ?? []) as SceneProgressRow[];
}
