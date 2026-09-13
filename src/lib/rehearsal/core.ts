import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID, SITE_URL } from "@/lib/constants";
import { notifyMember } from "./notify";
import { checkAvailability } from "./schedule";
import { fmtRange } from "./time";
import { SESSION_KIND_LABEL, type MemberRow, type Response, type SessionRow } from "./types";

// 画面(Server Action)と LINE Webhook の両方から使う業務ロジック。
// 呼び出し側で本人確認・権限確認を済ませてから呼ぶこと。

export class RehearsalError extends Error {}

async function loadSession(sessionId: string): Promise<SessionRow & { production_name: string }> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("rh_sessions").select("*, rh_productions(name)").eq("id", sessionId).maybeSingle();
  if (!data) throw new RehearsalError("稽古枠が見つかりません");
  const { rh_productions, ...rest } = data as SessionRow & { rh_productions: { name: string } | null };
  return { ...rest, production_name: rh_productions?.name ?? "" };
}

export function sessionSummary(s: { kind: SessionRow["kind"]; title: string; starts_at: string; ends_at: string; location: string; production_name: string }): string {
  return `${s.production_name}(${SESSION_KIND_LABEL[s.kind]})${s.title ? ` ${s.title}` : ""}\n${fmtRange(s.starts_at, s.ends_at)}${s.location ? `\n場所: ${s.location}` : ""}`;
}

// 召集への出欠回答
export async function respondToSession(memberId: string, sessionId: string, response: Response): Promise<void> {
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("rh_session_members").select("session_id").eq("session_id", sessionId).eq("member_id", memberId).maybeSingle();
  if (!row) throw new RehearsalError("この稽古枠には召集されていません");
  const { error } = await admin.from("rh_session_members").update({ response }).eq("session_id", sessionId).eq("member_id", memberId);
  if (error) throw new RehearsalError(error.message);
}

// 召集メンバーへ通知(新規召集・変更・中止)
export async function notifySessionMembers(sessionId: string, kind: "invite" | "update" | "cancel", onlyMemberIds?: string[]): Promise<number> {
  const admin = supabaseAdmin();
  const session = await loadSession(sessionId);
  let q = admin.from("rh_session_members").select("member_id, rh_members(id, name, line_user_id, email)").eq("session_id", sessionId);
  if (onlyMemberIds && onlyMemberIds.length > 0) q = q.in("member_id", onlyMemberIds);
  const { data: rows } = await q;

  const head = kind === "invite" ? "【稽古の召集】" : kind === "update" ? "【予定変更】" : "【中止】";
  const tail =
    kind === "cancel"
      ? "この予定は中止になりました。"
      : `出欠は LINE で「参加」「不参加」と返信するか、${SITE_URL}/me から回答してください。`;
  const text = `${head}\n${sessionSummary(session)}\n${session.note ? `${session.note}\n` : ""}\n${tail}`;
  // 変更・中止は updated_at を鍵にして毎回送る。召集は1回のみ
  const stamp = kind === "invite" ? "" : `:${session.updated_at}`;

  let sent = 0;
  for (const r of rows ?? []) {
    const m = r.rh_members as unknown as Pick<MemberRow, "id" | "name" | "line_user_id" | "email"> | null;
    if (!m) continue;
    const ch = await notifyMember(m, `session:${kind}:${sessionId}:${m.id}${stamp}`, text);
    if (ch !== "duplicate" && ch !== "none") sent++;
    if (kind === "invite") {
      await admin.from("rh_session_members").update({ notified_at: new Date().toISOString() }).eq("session_id", sessionId).eq("member_id", m.id);
    }
  }
  return sent;
}

// 代役募集の発行(要件 5.5): 欠ける人が担当するシーンを演じられる & 空いているメンバーへ一斉通知
export async function openSubstitution(sessionId: string, absentMemberId: string, reason: string): Promise<{ requestId: string; candidates: number }> {
  const admin = supabaseAdmin();
  const session = await loadSession(sessionId);

  // 欠ける人が出るシーン(この稽古枠内)
  const { data: sceneRows } = await admin.from("rh_session_scenes").select("scene_id").eq("session_id", sessionId);
  const sceneIds = (sceneRows ?? []).map((s) => s.scene_id);
  const { data: absentScenes } = sceneIds.length
    ? await admin.from("rh_scene_members").select("scene_id").eq("member_id", absentMemberId).in("scene_id", sceneIds)
    : { data: [] };
  const targetSceneIds = (absentScenes ?? []).map((s) => s.scene_id);

  // 候補: 同プロダクションの参加メンバー(キャスト)のうち、対象シーンに紐づく人。対象シーンがなければ同プロダクション全キャスト
  const { data: pm } = await admin.from("rh_production_members").select("member_id").eq("production_id", session.production_id).eq("part", "cast");
  let candidateIds = (pm ?? []).map((p) => p.member_id).filter((id) => id !== absentMemberId);
  if (targetSceneIds.length > 0) {
    const { data: sm } = await admin.from("rh_scene_members").select("member_id").in("scene_id", targetSceneIds);
    const set = new Set((sm ?? []).map((s) => s.member_id));
    const filtered = candidateIds.filter((id) => set.has(id));
    if (filtered.length > 0) candidateIds = filtered;
  }
  // すでにこの枠に召集済みの人は除外
  const { data: already } = await admin.from("rh_session_members").select("member_id").eq("session_id", sessionId);
  const alreadySet = new Set((already ?? []).map((a) => a.member_id));
  candidateIds = candidateIds.filter((id) => !alreadySet.has(id));

  // 空き判定: 不可・他現場の人は除く(未回答は含める)
  const verdicts = await checkAvailability(candidateIds, session.starts_at, session.ends_at, sessionId);
  candidateIds = candidateIds.filter((id) => {
    const v = verdicts.get(id);
    return !v || (v.status !== "unavailable" && v.status !== "conflict");
  });

  const { data: req, error } = await admin
    .from("rh_substitution_requests")
    .insert({ org_id: ORG_ID, session_id: sessionId, absent_member_id: absentMemberId, reason })
    .select()
    .single();
  if (error) throw new RehearsalError(error.message);

  if (candidateIds.length > 0) {
    await admin.from("rh_substitution_candidates").insert(candidateIds.map((id) => ({ request_id: req.id, member_id: id, org_id: ORG_ID })));
    const { data: members } = await admin.from("rh_members").select("id, name, line_user_id, email").in("id", candidateIds);
    const { data: absent } = await admin.from("rh_members").select("name").eq("id", absentMemberId).maybeSingle();
    const text = `【代役募集】\n${sessionSummary(session)}\n${absent?.name ?? ""} さんの代わりに入れる方を募集しています。${reason ? `\n理由: ${reason}` : ""}\n\n入れる方は LINE で「入れます」と返信するか、${SITE_URL}/me から応募してください(先着で確定します)。`;
    for (const m of members ?? []) {
      await notifyMember(m as MemberRow, `subreq:${req.id}:${m.id}`, text, "【稽古管理】代役募集");
    }
  }
  return { requestId: req.id, candidates: candidateIds.length };
}

// 代役への応募(先着確定 = Q3 暫定)。確定時に召集へ追加し、他候補へ「埋まりました」通知
export async function applySubstitution(memberId: string, requestId: string): Promise<"filled" | "already_filled"> {
  const admin = supabaseAdmin();
  const { data: cand } = await admin.from("rh_substitution_candidates").select("request_id").eq("request_id", requestId).eq("member_id", memberId).maybeSingle();
  if (!cand) throw new RehearsalError("この募集の対象ではありません");
  await admin.from("rh_substitution_candidates").update({ applied_at: new Date().toISOString() }).eq("request_id", requestId).eq("member_id", memberId);
  return fillSubstitution(requestId, memberId);
}

// 確定処理(先着 or admin 手動)。status=open の行だけを更新することで同時応募の競合を防ぐ
export async function fillSubstitution(requestId: string, memberId: string): Promise<"filled" | "already_filled"> {
  const admin = supabaseAdmin();
  const { data: updated, error } = await admin
    .from("rh_substitution_requests")
    .update({ status: "filled", filled_by_member_id: memberId, filled_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id, session_id, absent_member_id")
    .maybeSingle();
  if (error) throw new RehearsalError(error.message);
  if (!updated) return "already_filled";

  // 召集へ追加(参加確定)。欠ける人は不参加に
  await admin.from("rh_session_members").upsert(
    { session_id: updated.session_id, member_id: memberId, org_id: ORG_ID, required: true, response: "yes" },
    { onConflict: "session_id,member_id" },
  );
  await admin.from("rh_session_members").update({ response: "no" }).eq("session_id", updated.session_id).eq("member_id", updated.absent_member_id);

  const session = await loadSession(updated.session_id);
  const { data: cands } = await admin.from("rh_substitution_candidates").select("member_id, rh_members(id, name, line_user_id, email)").eq("request_id", requestId);
  const { data: filler } = await admin.from("rh_members").select("id, name, line_user_id, email").eq("id", memberId).maybeSingle();
  for (const c of cands ?? []) {
    const m = c.rh_members as unknown as MemberRow | null;
    if (!m) continue;
    const text =
      m.id === memberId
        ? `【代役確定】\n${sessionSummary(session)}\nあなたの出演で確定しました。よろしくお願いします。`
        : `【募集終了】\n${sessionSummary(session)}\nこの募集は ${filler?.name ?? ""} さんで埋まりました。ありがとうございました。`;
    await notifyMember(m, `subreq:${requestId}:result:${m.id}`, text, "【稽古管理】代役募集の結果");
  }
  if (filler && !(cands ?? []).some((c) => c.member_id === memberId)) {
    await notifyMember(filler as MemberRow, `subreq:${requestId}:result:${memberId}`, `【代役確定】\n${sessionSummary(session)}\nあなたの出演で確定しました。`, "【稽古管理】代役確定");
  }
  return "filled";
}

// メンバーが応募可能な募集中の代役依頼
export async function openSubstitutionsFor(memberId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("rh_substitution_candidates")
    .select("request_id, applied_at, rh_substitution_requests!inner(id, status, reason, session_id, rh_sessions(kind, title, starts_at, ends_at, location, rh_productions(name)), rh_members!rh_substitution_requests_absent_member_id_fkey(name))")
    .eq("member_id", memberId)
    .eq("rh_substitution_requests.status", "open");
  type Row = {
    request_id: string;
    applied_at: string | null;
    rh_substitution_requests: {
      id: string;
      reason: string;
      session_id: string;
      rh_sessions: { kind: SessionRow["kind"]; title: string; starts_at: string; ends_at: string; location: string; rh_productions: { name: string } | null } | null;
      rh_members: { name: string } | null;
    };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    requestId: r.request_id,
    reason: r.rh_substitution_requests.reason,
    absentName: r.rh_substitution_requests.rh_members?.name ?? "",
    session: r.rh_substitution_requests.rh_sessions
      ? { ...r.rh_substitution_requests.rh_sessions, production_name: r.rh_substitution_requests.rh_sessions.rh_productions?.name ?? "" }
      : null,
  }));
}
