import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { notifyProfile } from "./notify";
import { checkAvailability } from "./schedule";
import { syncSession } from "./google-sync";
import { fmtRange } from "./time";
import { SESSION_KIND_LABEL, type Response, type SessionRow } from "./types";

// 画面(Server Action)と LINE Webhook の両方から使う業務ロジック。
// 呼び出し側で本人確認・権限確認を済ませてから呼ぶこと。

export class RehearsalError extends Error {}

interface SessionWithNames extends SessionRow {
  production_name: string;
  org_name: string;
  org_slug: string;
}

export async function loadSession(sessionId: string): Promise<SessionWithNames> {
  const { data } = await supabaseAdmin()
    .from("rh_sessions")
    .select("*, rh_productions(name, core_organizations(name, slug))")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) throw new RehearsalError("稽古枠が見つかりません");
  const { rh_productions, ...rest } = data as SessionRow & { rh_productions: { name: string; core_organizations: { name: string; slug: string } | null } | null };
  return { ...rest, production_name: rh_productions?.name ?? "", org_name: rh_productions?.core_organizations?.name ?? "", org_slug: rh_productions?.core_organizations?.slug ?? "" };
}

export function sessionSummary(s: Pick<SessionWithNames, "kind" | "title" | "starts_at" | "ends_at" | "location" | "production_name" | "org_name">): string {
  return `${s.org_name}／${s.production_name}(${SESSION_KIND_LABEL[s.kind]})${s.title ? ` ${s.title}` : ""}\n${fmtRange(s.starts_at, s.ends_at)}${s.location ? `\n場所: ${s.location}` : ""}`;
}

// 召集への出欠回答(本人)
export async function respondToSession(profileId: string, sessionId: string, response: Response): Promise<void> {
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("rh_session_members")
    .select("participant_id, rh_participants!inner(profile_id)")
    .eq("session_id", sessionId)
    .eq("rh_participants.profile_id", profileId)
    .maybeSingle();
  if (!row) throw new RehearsalError("この稽古枠には召集されていません");
  const { error } = await admin.from("rh_session_members").update({ response }).eq("session_id", sessionId).eq("participant_id", row.participant_id);
  if (error) throw new RehearsalError(error.message);
  await syncSession(sessionId, [row.participant_id]);
}

// 召集メンバーへ通知(新規召集・変更・中止)。仮メンバーには届かない
export async function notifySessionMembers(sessionId: string, kind: "invite" | "update" | "cancel", onlyParticipantIds?: string[]): Promise<number> {
  const admin = supabaseAdmin();
  const session = await loadSession(sessionId);
  let q = admin.from("rh_session_members").select("participant_id, rh_participants!inner(id, profile_id)").eq("session_id", sessionId);
  if (onlyParticipantIds?.length) q = q.in("participant_id", onlyParticipantIds);
  const { data: rows } = await q;

  const title = kind === "invite" ? "稽古の召集" : kind === "update" ? "予定変更" : "中止";
  const tail = kind === "cancel" ? "この予定は中止になりました。" : "出欠の回答をお願いします。";
  const text = `${sessionSummary(session)}\n${session.note ? `${session.note}\n` : ""}${tail}`;
  const stamp = kind === "invite" ? "" : `:${session.updated_at}`;

  let sent = 0;
  for (const r of (rows ?? []) as unknown as { participant_id: string; rh_participants: { id: string; profile_id: string | null } }[]) {
    const pid = r.rh_participants.profile_id;
    if (!pid) continue;
    const ch = await notifyProfile(pid, "invite", `session:${kind}:${sessionId}:${r.participant_id}${stamp}`, { title, text, url: `${SITE_URL}/me` });
    if (ch !== "duplicate" && ch !== "none") sent++;
    if (kind === "invite") {
      await admin.from("rh_session_members").update({ notified_at: new Date().toISOString() }).eq("session_id", sessionId).eq("participant_id", r.participant_id);
    }
  }
  return sent;
}

// 代役募集の発行(要件 5.5)
export async function openSubstitution(sessionId: string, absentParticipantId: string, reason: string): Promise<{ requestId: string; candidates: number }> {
  const admin = supabaseAdmin();
  const session = await loadSession(sessionId);

  const { data: sceneRows } = await admin.from("rh_session_scenes").select("scene_id").eq("session_id", sessionId);
  const sceneIds = (sceneRows ?? []).map((s) => s.scene_id);
  const { data: absentScenes } = sceneIds.length
    ? await admin.from("rh_scene_members").select("scene_id").eq("participant_id", absentParticipantId).in("scene_id", sceneIds)
    : { data: [] };
  const targetSceneIds = (absentScenes ?? []).map((s) => s.scene_id);

  // 候補: 同プロダクションのキャストのうち対象シーンを演じられる人(対象シーンがなければ全キャスト)。本人登録済みのみ
  const { data: pm } = await admin
    .from("rh_production_members")
    .select("participant_id, rh_participants!inner(part, profile_id, is_active)")
    .eq("production_id", session.production_id)
    .eq("rh_participants.part", "cast")
    .eq("rh_participants.is_active", true)
    .not("rh_participants.profile_id", "is", null);
  let candidateIds = (pm ?? []).map((p) => p.participant_id).filter((id) => id !== absentParticipantId);
  if (targetSceneIds.length > 0) {
    const { data: sm } = await admin.from("rh_scene_members").select("participant_id").in("scene_id", targetSceneIds);
    const set = new Set((sm ?? []).map((s) => s.participant_id));
    const filtered = candidateIds.filter((id) => set.has(id));
    if (filtered.length > 0) candidateIds = filtered;
  }
  const { data: already } = await admin.from("rh_session_members").select("participant_id").eq("session_id", sessionId);
  const alreadySet = new Set((already ?? []).map((a) => a.participant_id));
  candidateIds = candidateIds.filter((id) => !alreadySet.has(id));

  const verdicts = await checkAvailability(candidateIds, session.starts_at, session.ends_at, sessionId);
  candidateIds = candidateIds.filter((id) => {
    const v = verdicts.get(id);
    return !v || (v.status !== "unavailable" && v.status !== "conflict");
  });

  const { data: req, error } = await admin
    .from("rh_substitution_requests")
    .insert({ org_id: session.org_id, session_id: sessionId, absent_participant_id: absentParticipantId, reason })
    .select()
    .single();
  if (error) throw new RehearsalError(error.message);

  if (candidateIds.length > 0) {
    await admin.from("rh_substitution_candidates").insert(candidateIds.map((id) => ({ request_id: req.id, participant_id: id, org_id: session.org_id })));
    const { data: cands } = await admin.from("rh_participants").select("id, profile_id").in("id", candidateIds);
    const { data: absent } = await admin.from("rh_participants").select("display_name").eq("id", absentParticipantId).maybeSingle();
    const text = `${sessionSummary(session)}\n${absent?.display_name ?? ""} さんの代わりに入れる方を募集しています。${reason ? `\n理由: ${reason}` : ""}\n入れる方は「入れます」と返信するか、Web から応募してください(先着で確定します)。`;
    for (const c of cands ?? []) {
      if (c.profile_id) await notifyProfile(c.profile_id, "substitution", `subreq:${req.id}:${c.id}`, { title: "代役募集", text, url: `${SITE_URL}/me` });
    }
  }
  return { requestId: req.id, candidates: candidateIds.length };
}

// 代役への応募(本人)。先着確定
export async function applySubstitution(profileId: string, requestId: string): Promise<"filled" | "already_filled"> {
  const admin = supabaseAdmin();
  const { data: cand } = await admin
    .from("rh_substitution_candidates")
    .select("participant_id, rh_participants!inner(profile_id)")
    .eq("request_id", requestId)
    .eq("rh_participants.profile_id", profileId)
    .maybeSingle();
  if (!cand) throw new RehearsalError("この募集の対象ではありません");
  await admin.from("rh_substitution_candidates").update({ applied_at: new Date().toISOString() }).eq("request_id", requestId).eq("participant_id", cand.participant_id);
  return fillSubstitution(requestId, cand.participant_id);
}

// 確定処理(先着 or admin 手動)。status=open の行だけを更新して競合を防ぐ
export async function fillSubstitution(requestId: string, participantId: string): Promise<"filled" | "already_filled"> {
  const admin = supabaseAdmin();
  const { data: updated, error } = await admin
    .from("rh_substitution_requests")
    .update({ status: "filled", filled_by_participant_id: participantId, filled_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id, org_id, session_id, absent_participant_id")
    .maybeSingle();
  if (error) throw new RehearsalError(error.message);
  if (!updated) return "already_filled";

  await admin.from("rh_session_members").upsert(
    { session_id: updated.session_id, participant_id: participantId, org_id: updated.org_id, required: true, response: "yes" },
    { onConflict: "session_id,participant_id" },
  );
  await admin.from("rh_session_members").update({ response: "no" }).eq("session_id", updated.session_id).eq("participant_id", updated.absent_participant_id);
  await syncSession(updated.session_id, [participantId, updated.absent_participant_id]);

  const session = await loadSession(updated.session_id);
  const { data: cands } = await admin.from("rh_substitution_candidates").select("participant_id, rh_participants(profile_id, display_name)").eq("request_id", requestId);
  const { data: filler } = await admin.from("rh_participants").select("profile_id, display_name").eq("id", participantId).maybeSingle();
  const rows = (cands ?? []) as unknown as { participant_id: string; rh_participants: { profile_id: string | null; display_name: string } | null }[];
  for (const c of rows) {
    const pid = c.rh_participants?.profile_id;
    if (!pid) continue;
    const mine = c.participant_id === participantId;
    await notifyProfile(pid, "substitution", `subreq:${requestId}:result:${c.participant_id}`, {
      title: mine ? "代役確定" : "募集終了",
      text: mine ? `${sessionSummary(session)}\nあなたの出演で確定しました。` : `${sessionSummary(session)}\nこの募集は ${filler?.display_name ?? ""} さんで埋まりました。`,
      url: `${SITE_URL}/me`,
    });
  }
  if (filler?.profile_id && !rows.some((c) => c.participant_id === participantId)) {
    await notifyProfile(filler.profile_id, "substitution", `subreq:${requestId}:result:${participantId}`, { title: "代役確定", text: `${sessionSummary(session)}\nあなたの出演で確定しました。`, url: `${SITE_URL}/me` });
  }
  return "filled";
}

// 本人が応募できる募集中の代役依頼(全組織)
export async function openSubstitutionsFor(profileId: string) {
  const { data } = await supabaseAdmin()
    .from("rh_substitution_candidates")
    .select(
      "request_id, applied_at, rh_participants!inner(profile_id), rh_substitution_requests!inner(id, status, reason, session_id, rh_sessions(kind, title, starts_at, ends_at, location, rh_productions(name, core_organizations(name))), absent:rh_participants!rh_substitution_requests_absent_participant_id_fkey(display_name))",
    )
    .eq("rh_participants.profile_id", profileId)
    .eq("rh_substitution_requests.status", "open");
  type Row = {
    request_id: string;
    rh_substitution_requests: {
      reason: string;
      session_id: string;
      rh_sessions: { kind: SessionRow["kind"]; title: string; starts_at: string; ends_at: string; location: string; rh_productions: { name: string; core_organizations: { name: string } | null } | null } | null;
      absent: { display_name: string } | null;
    };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    requestId: r.request_id,
    reason: r.rh_substitution_requests.reason,
    absentName: r.rh_substitution_requests.absent?.display_name ?? "",
    session: r.rh_substitution_requests.rh_sessions
      ? {
          ...r.rh_substitution_requests.rh_sessions,
          production_name: r.rh_substitution_requests.rh_sessions.rh_productions?.name ?? "",
          org_name: r.rh_substitution_requests.rh_sessions.rh_productions?.core_organizations?.name ?? "",
        }
      : null,
  }));
}
