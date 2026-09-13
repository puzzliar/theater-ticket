import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkAvailability } from "@/lib/rehearsal/schedule";
import { fmtRange, isoToJstLocal } from "@/lib/rehearsal/time";
import {
  ATTENDANCE_LABEL,
  RESPONSE_LABEL,
  SESSION_KIND_LABEL,
  SESSION_STATUS_LABEL,
  type Attendance,
  type MemberRow,
  type Response,
  type SceneRow,
  type SceneStatus,
  type SessionRow,
  type SubstitutionRequestRow,
} from "@/lib/rehearsal/types";
import {
  updateSession,
  cancelSession,
  reopenSession,
  saveSessionRecord,
  addSessionScene,
  removeSessionScene,
  addSessionMember,
  removeSessionMember,
  sendInvites,
  requestSubstitution,
  fillSubstitutionManually,
  cancelSubstitution,
} from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ productionId: string; sessionId: string }> }) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { productionId, sessionId } = await params;
  const admin = supabaseAdmin();

  const { data: sessionRow } = await admin.from("rh_sessions").select("*, rh_productions(name)").eq("id", sessionId).eq("production_id", productionId).maybeSingle();
  if (!sessionRow) notFound();
  const session = sessionRow as SessionRow & { rh_productions: { name: string } | null };

  const [{ data: sScenes }, { data: sMembers }, { data: scenes }, { data: participants }, { data: requests }] = await Promise.all([
    admin.from("rh_session_scenes").select("scene_id, status, rh_scenes(code, name, sort_order)").eq("session_id", sessionId),
    admin.from("rh_session_members").select("member_id, required, response, attendance, note, notified_at, rh_members(id, name, line_user_id, email)").eq("session_id", sessionId),
    admin.from("rh_scenes").select("*").eq("production_id", productionId).order("sort_order"),
    admin.from("rh_production_members").select("member_id, rh_members(id, name)").eq("production_id", productionId),
    admin
      .from("rh_substitution_requests")
      .select("*, rh_substitution_candidates(member_id, applied_at, rh_members(name))")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);

  type SS = { scene_id: string; status: SceneStatus; rh_scenes: { code: string; name: string; sort_order: number } | null };
  type SM = { member_id: string; required: boolean; response: Response; attendance: Attendance; note: string; notified_at: string | null; rh_members: Pick<MemberRow, "id" | "name" | "line_user_id" | "email"> | null };
  const sessionScenes = ((sScenes ?? []) as unknown as SS[]).sort((a, b) => (a.rh_scenes?.sort_order ?? 0) - (b.rh_scenes?.sort_order ?? 0));
  const sessionMembers = ((sMembers ?? []) as unknown as SM[]).filter((m) => m.rh_members).sort((a, b) => a.rh_members!.name.localeCompare(b.rh_members!.name, "ja"));
  const memberIds = new Set(sessionMembers.map((m) => m.member_id));
  const sceneIds = new Set(sessionScenes.map((s) => s.scene_id));
  const nameOf = new Map(((participants ?? []) as unknown as { member_id: string; rh_members: { name: string } | null }[]).map((p) => [p.member_id, p.rh_members?.name ?? "?"]));
  const verdicts = session.status === "scheduled" ? await checkAvailability([...memberIds], session.starts_at, session.ends_at, sessionId) : new Map();

  type Req = SubstitutionRequestRow & { rh_substitution_candidates: { member_id: string; applied_at: string | null; rh_members: { name: string } | null }[] };
  const subRequests = (requests ?? []) as unknown as Req[];

  const local = isoToJstLocal(session.starts_at);
  const localEnd = isoToJstLocal(session.ends_at);
  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";
  const selectCls = "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs";
  const editable = session.status !== "cancelled";

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-neutral-500">
          <Link href={`/admin/rehearsal/p/${productionId}`} className="hover:text-neutral-300">← {session.rh_productions?.name}</Link>
        </p>
        <h1 className="text-2xl font-bold">
          <span className={`mr-2 rounded px-2 py-0.5 text-sm ${session.kind === "performance" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`}>{SESSION_KIND_LABEL[session.kind]}</span>
          {fmtRange(session.starts_at, session.ends_at)} {session.title}
        </h1>
        <p className="text-sm text-neutral-400">
          状態: <span className={session.status === "done" ? "text-emerald-400" : session.status === "cancelled" ? "text-red-400" : "text-neutral-200"}>{SESSION_STATUS_LABEL[session.status]}</span>
          {session.location && ` ／ 📍${session.location}`}
        </p>
      </div>

      {/* 基本情報の編集 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">日時・場所</h2>
        <form action={updateSession.bind(null, productionId, sessionId)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="title" defaultValue={session.title} placeholder="タイトル" className={`${inputCls} sm:col-span-4`} />
            <input name="date" type="date" required defaultValue={local.slice(0, 10)} className={inputCls} />
            <input name="from" type="time" required defaultValue={local.slice(11, 16)} className={inputCls} />
            <input name="to" type="time" required defaultValue={localEnd.slice(11, 16)} className={inputCls} />
            <input name="location" defaultValue={session.location} placeholder="場所" className={inputCls} />
            <textarea name="note" defaultValue={session.note} placeholder="メモ" rows={2} className={`${inputCls} sm:col-span-4`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button disabled={!editable} className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600 disabled:opacity-40">保存</button>
            <label className="flex items-center gap-1 text-xs text-neutral-300"><input type="checkbox" name="notify" defaultChecked /> 変更を召集メンバーに通知</label>
          </div>
        </form>
        <div className="flex gap-3 text-xs">
          {session.status === "cancelled" ? (
            <form action={reopenSession.bind(null, productionId, sessionId)}><button className="text-neutral-400 hover:underline">中止を取り消す</button></form>
          ) : (
            <form action={cancelSession.bind(null, productionId, sessionId)}><button className="text-red-400 hover:underline">この予定を中止する(召集メンバーに通知)</button></form>
          )}
        </div>
      </section>

      {/* 記録: シーン + 出欠 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">召集メンバーと実施シーン</h2>
        <form action={saveSessionRecord.bind(null, productionId, sessionId)} className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <p className="mb-1 text-sm font-medium">シーン</p>
            {sessionScenes.length === 0 && <p className="text-xs text-neutral-500">シーン未設定</p>}
            <div className="grid gap-1 sm:grid-cols-2">
              {sessionScenes.map((s) => (
                <div key={s.scene_id} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1 text-sm">
                  <span><span className="font-mono">{s.rh_scenes?.code}</span> {s.rh_scenes?.name}</span>
                  <span className="flex items-center gap-2">
                    <select name={`scene_${s.scene_id}`} defaultValue={s.status} className={selectCls}>
                      <option value="planned">予定</option>
                      <option value="done">実施</option>
                      <option value="skipped">未実施</option>
                    </select>
                    <button formAction={removeSessionScene.bind(null, productionId, sessionId, s.scene_id)} className="text-xs text-neutral-600 hover:text-red-400">外す</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">メンバー</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-400">
                  <tr><th className="p-1">氏名</th><th className="p-1">必須</th><th className="p-1">回答</th><th className="p-1">空き状況</th><th className="p-1">出席</th><th className="p-1">通知</th><th className="p-1"></th></tr>
                </thead>
                <tbody>
                  {sessionMembers.map((m) => {
                    const v = verdicts.get(m.member_id);
                    return (
                      <tr key={m.member_id} className="border-t border-neutral-800">
                        <td className="p-1">{m.rh_members!.name}</td>
                        <td className="p-1"><input type="checkbox" name={`req_${m.member_id}`} defaultChecked={m.required} /></td>
                        <td className={`p-1 text-xs ${m.response === "yes" ? "text-emerald-400" : m.response === "no" ? "text-red-400" : "text-yellow-400"}`}>{RESPONSE_LABEL[m.response]}</td>
                        <td className={`p-1 text-xs ${v?.status === "conflict" ? "text-orange-400" : v?.status === "unavailable" ? "text-red-400" : "text-neutral-500"}`}>{v?.status === "conflict" || v?.status === "unavailable" ? v.detail : ""}</td>
                        <td className="p-1">
                          <select name={`att_${m.member_id}`} defaultValue={m.attendance} className={selectCls}>
                            {(Object.keys(ATTENDANCE_LABEL) as Attendance[]).map((a) => <option key={a} value={a}>{ATTENDANCE_LABEL[a]}</option>)}
                          </select>
                        </td>
                        <td className="p-1 text-xs text-neutral-500">{m.notified_at ? "送信済" : m.rh_members!.line_user_id || m.rh_members!.email ? "未送信" : "連絡先なし"}</td>
                        <td className="p-1"><button formAction={removeSessionMember.bind(null, productionId, sessionId, m.member_id)} className="text-xs text-neutral-600 hover:text-red-400">外す</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600">記録を保存</button>
            {session.status === "scheduled" && (
              <label className="flex items-center gap-1 text-xs text-amber-300"><input type="checkbox" name="finish" /> 保存と同時に「完了」にする(未記録の予定シーンは実施扱い・進捗に反映)</label>
            )}
            {session.status === "done" && <span className="text-xs text-emerald-400">完了済み(記録の修正は可能)</span>}
          </div>
        </form>

        <div className="grid gap-2 sm:grid-cols-2">
          <form action={addSessionScene.bind(null, productionId, sessionId)} className="flex items-center gap-2 rounded-lg border border-neutral-800 p-3">
            <select name="scene_id" className={inputCls}>
              <option value="">シーンを追加</option>
              {((scenes ?? []) as SceneRow[]).filter((s) => !sceneIds.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
            </select>
            <button className="rounded-md bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600">追加</button>
          </form>
          <form action={addSessionMember.bind(null, productionId, sessionId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 p-3">
            <select name="member_id" className={inputCls}>
              <option value="">メンバーを追加召集</option>
              {[...nameOf.entries()].filter(([id]) => !memberIds.has(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="notify" defaultChecked /> 通知</label>
            <button className="rounded-md bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600">追加</button>
          </form>
        </div>
        <form action={sendInvites.bind(null, productionId, sessionId)}>
          <button className="text-xs text-amber-400 hover:underline">未送信のメンバーに召集通知を送る</button>
        </form>
      </section>

      {/* 代役募集 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">代役募集</h2>
        <p className="text-sm text-neutral-400">欠ける人のシーンを演じられ、同時刻に不可・他現場でないメンバーへ LINE/メールで一斉に募集します。先着で確定します(Q3 暫定)。</p>
        {subRequests.map((r) => (
          <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <p>
              <span className={r.status === "open" ? "text-amber-300" : r.status === "filled" ? "text-emerald-400" : "text-neutral-500"}>[{r.status === "open" ? "募集中" : r.status === "filled" ? "確定" : "取消"}]</span>{" "}
              {nameOf.get(r.absent_member_id) ?? "?"} さんの代役 {r.reason && <span className="text-neutral-400">({r.reason})</span>}
              {r.filled_by_member_id && <span className="ml-2 text-emerald-400">→ {nameOf.get(r.filled_by_member_id) ?? "?"} さん</span>}
            </p>
            <p className="text-xs text-neutral-400">
              候補 {r.rh_substitution_candidates.length}名: {r.rh_substitution_candidates.map((c) => `${c.rh_members?.name ?? "?"}${c.applied_at ? "(応募)" : ""}`).join(", ") || "なし"}
            </p>
            {r.status === "open" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={fillSubstitutionManually.bind(null, productionId, sessionId, r.id)} className="flex items-center gap-2">
                  <select name="member_id" className={selectCls}>
                    <option value="">手動で確定するメンバー</option>
                    {[...nameOf.entries()].filter(([id]) => id !== r.absent_member_id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <button className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600">確定</button>
                </form>
                <form action={cancelSubstitution.bind(null, productionId, sessionId, r.id)}><button className="text-xs text-neutral-500 hover:text-red-400">募集を取り消す</button></form>
              </div>
            )}
          </div>
        ))}
        {editable && (
          <form action={requestSubstitution.bind(null, productionId, sessionId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <select name="absent_member_id" required className={inputCls}>
              <option value="">欠ける人</option>
              {sessionMembers.map((m) => <option key={m.member_id} value={m.member_id}>{m.rh_members!.name}</option>)}
            </select>
            <input name="reason" placeholder="理由(例: 体調不良)" className={inputCls} />
            <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">代役を募集する</button>
          </form>
        )}
      </section>
    </div>
  );
}
