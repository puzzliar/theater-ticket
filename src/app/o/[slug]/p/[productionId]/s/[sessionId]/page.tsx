import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/core/session";
import { checkAvailability } from "@/lib/rehearsal/schedule";
import { fmtRange, isoToJstLocal } from "@/lib/rehearsal/time";
import { ATTENDANCE_LABEL, RESPONSE_LABEL, SESSION_KIND_LABEL, SESSION_STATUS_LABEL, type Attendance, type ParticipantRow, type Response, type SceneRow, type SceneStatus, type SessionRow, type SubstitutionRequestRow } from "@/lib/rehearsal/types";
import { updateSession, cancelSession, reopenSession, saveSessionRecord, addSessionScene, removeSessionScene, addSessionMember, removeSessionMember, sendInvites, requestSubstitution, fillSubstitutionManually, cancelSubstitution } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ slug: string; productionId: string; sessionId: string }> }) {
  const { slug, productionId, sessionId } = await params;
  const { org, isAdmin } = await requireOrg(slug);
  const db = await supabaseServer();

  const { data: sessionRow } = await db.from("rh_sessions").select("*, rh_productions(name)").eq("id", sessionId).eq("production_id", productionId).eq("org_id", org.id).maybeSingle();
  if (!sessionRow) notFound();
  const session = sessionRow as SessionRow & { rh_productions: { name: string } | null };

  const [{ data: sScenes }, { data: sMembers }, { data: scenes }, { data: pm }, { data: requests }] = await Promise.all([
    db.from("rh_session_scenes").select("scene_id, status, rh_scenes(code, name, sort_order)").eq("session_id", sessionId),
    db.from("rh_session_members").select("participant_id, required, response, attendance, note, notified_at, rh_participants(id, display_name, profile_id)").eq("session_id", sessionId),
    db.from("rh_scenes").select("*").eq("production_id", productionId).order("sort_order"),
    db.from("rh_production_members").select("participant_id, rh_participants(id, display_name, is_active)").eq("production_id", productionId),
    db.from("rh_substitution_requests").select("*, rh_substitution_candidates(participant_id, applied_at, rh_participants(display_name))").eq("session_id", sessionId).order("created_at", { ascending: false }),
  ]);

  type SS = { scene_id: string; status: SceneStatus; rh_scenes: { code: string; name: string; sort_order: number } | null };
  type SM = { participant_id: string; required: boolean; response: Response; attendance: Attendance; note: string; notified_at: string | null; rh_participants: Pick<ParticipantRow, "id" | "display_name" | "profile_id"> | null };
  const sessionScenes = ((sScenes ?? []) as unknown as SS[]).sort((a, b) => (a.rh_scenes?.sort_order ?? 0) - (b.rh_scenes?.sort_order ?? 0));
  const sessionMembers = ((sMembers ?? []) as unknown as SM[]).filter((m) => m.rh_participants).sort((a, b) => a.rh_participants!.display_name.localeCompare(b.rh_participants!.display_name, "ja"));
  const memberIds = new Set(sessionMembers.map((m) => m.participant_id));
  const sceneIds = new Set(sessionScenes.map((s) => s.scene_id));
  const participants = ((pm ?? []) as unknown as { participant_id: string; rh_participants: { id: string; display_name: string; is_active: boolean } | null }[]).filter((p) => p.rh_participants?.is_active);
  const nameOf = new Map(participants.map((p) => [p.participant_id, p.rh_participants!.display_name]));
  for (const m of sessionMembers) nameOf.set(m.participant_id, m.rh_participants!.display_name);
  const verdicts = isAdmin && session.status === "scheduled" ? await checkAvailability([...memberIds], session.starts_at, session.ends_at, sessionId) : new Map();

  type Req = SubstitutionRequestRow & { rh_substitution_candidates: { participant_id: string; applied_at: string | null; rh_participants: { display_name: string } | null }[] };
  const subRequests = (requests ?? []) as unknown as Req[];
  const local = isoToJstLocal(session.starts_at);
  const localEnd = isoToJstLocal(session.ends_at);
  const input = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";
  const selectCls = "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs";
  const editable = session.status !== "cancelled";
  const a = [org.id, productionId, sessionId] as const;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-neutral-500"><Link href={`/o/${slug}/p/${productionId}`} className="hover:text-neutral-300">← {session.rh_productions?.name}</Link></p>
        <h2 className="text-2xl font-bold">
          <span className={`mr-2 rounded px-2 py-0.5 text-sm ${session.kind === "performance" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`}>{SESSION_KIND_LABEL[session.kind]}</span>
          {fmtRange(session.starts_at, session.ends_at)} {session.title}
        </h2>
        <p className="text-sm text-neutral-400">
          状態: <span className={session.status === "done" ? "text-emerald-400" : session.status === "cancelled" ? "text-red-400" : "text-neutral-200"}>{SESSION_STATUS_LABEL[session.status]}</span>
          {session.location && ` ／ 📍${session.location}`}
        </p>
        {session.note && <p className="mt-1 text-sm text-neutral-300">{session.note}</p>}
      </div>

      {!isAdmin && (
        <section className="space-y-2 text-sm">
          <h3 className="font-semibold">召集メンバー</h3>
          <div className="grid gap-1 sm:grid-cols-2">
            {sessionMembers.map((m) => (
              <div key={m.participant_id} className="flex justify-between rounded border border-neutral-800 px-3 py-1.5">
                <span>{m.rh_participants!.display_name}</span>
                <span className={`text-xs ${m.response === "yes" ? "text-emerald-400" : m.response === "no" ? "text-red-400" : "text-yellow-400"}`}>{RESPONSE_LABEL[m.response]}</span>
              </div>
            ))}
          </div>
          {sessionScenes.length > 0 && <p className="text-neutral-400">シーン: {sessionScenes.map((s) => `${s.rh_scenes?.code} ${s.rh_scenes?.name}`).join(" / ")}</p>}
          <p className="text-xs text-neutral-500">出欠の回答は <Link href="/me" className="underline">自分の予定</Link> から。</p>
        </section>
      )}

      {isAdmin && (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold">日時・場所</h3>
            <form action={updateSession.bind(null, ...a)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="grid gap-2 sm:grid-cols-4">
                <input name="title" defaultValue={session.title} placeholder="タイトル" className={`${input} sm:col-span-4`} />
                <input name="date" type="date" required defaultValue={local.slice(0, 10)} className={input} />
                <input name="from" type="time" required defaultValue={local.slice(11, 16)} className={input} />
                <input name="to" type="time" required defaultValue={localEnd.slice(11, 16)} className={input} />
                <input name="location" defaultValue={session.location} placeholder="場所" className={input} />
                <textarea name="note" defaultValue={session.note} placeholder="メモ" rows={2} className={`${input} sm:col-span-4`} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button disabled={!editable} className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600 disabled:opacity-40">保存</button>
                <label className="flex items-center gap-1 text-xs text-neutral-300"><input type="checkbox" name="notify" defaultChecked /> 変更を召集メンバーに通知</label>
              </div>
            </form>
            <div className="text-xs">
              {session.status === "cancelled" ? (
                <form action={reopenSession.bind(null, ...a)}><button className="text-neutral-400 hover:underline">中止を取り消す</button></form>
              ) : (
                <form action={cancelSession.bind(null, ...a)}><button className="text-red-400 hover:underline">この予定を中止する(召集メンバーに通知)</button></form>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">召集メンバーと実施シーン</h3>
            <form action={saveSessionRecord.bind(null, ...a)} className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div>
                <p className="mb-1 text-sm font-medium">シーン</p>
                {sessionScenes.length === 0 && <p className="text-xs text-neutral-500">シーン未設定</p>}
                <div className="grid gap-1 sm:grid-cols-2">
                  {sessionScenes.map((s) => (
                    <div key={s.scene_id} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1 text-sm">
                      <span><span className="font-mono">{s.rh_scenes?.code}</span> {s.rh_scenes?.name}</span>
                      <span className="flex items-center gap-2">
                        <select name={`scene_${s.scene_id}`} defaultValue={s.status} className={selectCls}><option value="planned">予定</option><option value="done">実施</option><option value="skipped">未実施</option></select>
                        <button formAction={removeSessionScene.bind(null, ...a, s.scene_id)} className="text-xs text-neutral-600 hover:text-red-400">外す</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">メンバー</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-neutral-400"><tr><th className="p-1">氏名</th><th className="p-1">必須</th><th className="p-1">回答</th><th className="p-1">空き状況</th><th className="p-1">出席</th><th className="p-1">通知</th><th className="p-1"></th></tr></thead>
                    <tbody>
                      {sessionMembers.map((m) => {
                        const v = verdicts.get(m.participant_id);
                        return (
                          <tr key={m.participant_id} className="border-t border-neutral-800">
                            <td className="p-1">{m.rh_participants!.display_name}{!m.rh_participants!.profile_id && <span className="ml-1 text-xs text-neutral-500">(未登録)</span>}</td>
                            <td className="p-1"><input type="checkbox" name={`req_${m.participant_id}`} defaultChecked={m.required} /></td>
                            <td className={`p-1 text-xs ${m.response === "yes" ? "text-emerald-400" : m.response === "no" ? "text-red-400" : "text-yellow-400"}`}>{RESPONSE_LABEL[m.response]}</td>
                            <td className={`p-1 text-xs ${v?.status === "conflict" ? "text-orange-400" : v?.status === "unavailable" ? "text-red-400" : "text-neutral-500"}`}>{v?.status === "conflict" || v?.status === "unavailable" ? v.detail : ""}</td>
                            <td className="p-1"><select name={`att_${m.participant_id}`} defaultValue={m.attendance} className={selectCls}>{(Object.keys(ATTENDANCE_LABEL) as Attendance[]).map((x) => <option key={x} value={x}>{ATTENDANCE_LABEL[x]}</option>)}</select></td>
                            <td className="p-1 text-xs text-neutral-500">{m.notified_at ? "送信済" : m.rh_participants!.profile_id ? "未送信" : "-"}</td>
                            <td className="p-1"><button formAction={removeSessionMember.bind(null, ...a, m.participant_id)} className="text-xs text-neutral-600 hover:text-red-400">外す</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600">記録を保存</button>
                {session.status === "scheduled" && <label className="flex items-center gap-1 text-xs text-amber-300"><input type="checkbox" name="finish" /> 保存と同時に「完了」にする(未記録の予定シーンは実施扱い)</label>}
                {session.status === "done" && <span className="text-xs text-emerald-400">完了済み(記録の修正は可能)</span>}
              </div>
            </form>
            <div className="grid gap-2 sm:grid-cols-2">
              <form action={addSessionScene.bind(null, ...a)} className="flex items-center gap-2 rounded-lg border border-neutral-800 p-3">
                <select name="scene_id" className={input}><option value="">シーンを追加</option>{((scenes ?? []) as SceneRow[]).filter((s) => !sceneIds.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select>
                <button className="rounded-md bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600">追加</button>
              </form>
              <form action={addSessionMember.bind(null, ...a)} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 p-3">
                <select name="participant_id" className={input}><option value="">メンバーを追加召集</option>{participants.filter((p) => !memberIds.has(p.participant_id)).map((p) => <option key={p.participant_id} value={p.participant_id}>{p.rh_participants!.display_name}</option>)}</select>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="notify" defaultChecked /> 通知</label>
                <button className="rounded-md bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600">追加</button>
              </form>
            </div>
            <form action={sendInvites.bind(null, ...a)}><button className="text-xs text-amber-400 hover:underline">未送信のメンバーに召集通知を送る</button></form>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">代役募集</h3>
            <p className="text-sm text-neutral-400">欠ける人のシーンを演じられ、同時刻に不可・重複でない登録済みメンバーへ一斉に募集します。先着で確定します。</p>
            {subRequests.map((r) => (
              <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
                <p>
                  <span className={r.status === "open" ? "text-amber-300" : r.status === "filled" ? "text-emerald-400" : "text-neutral-500"}>[{r.status === "open" ? "募集中" : r.status === "filled" ? "確定" : "取消"}]</span>{" "}
                  {nameOf.get(r.absent_participant_id) ?? "?"} さんの代役 {r.reason && <span className="text-neutral-400">({r.reason})</span>}
                  {r.filled_by_participant_id && <span className="ml-2 text-emerald-400">→ {nameOf.get(r.filled_by_participant_id) ?? "?"} さん</span>}
                </p>
                <p className="text-xs text-neutral-400">候補 {r.rh_substitution_candidates.length}名: {r.rh_substitution_candidates.map((c) => `${c.rh_participants?.display_name ?? "?"}${c.applied_at ? "(応募)" : ""}`).join(", ") || "なし"}</p>
                {r.status === "open" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={fillSubstitutionManually.bind(null, ...a, r.id)} className="flex items-center gap-2">
                      <select name="participant_id" className={selectCls}><option value="">手動で確定する参加者</option>{participants.filter((p) => p.participant_id !== r.absent_participant_id).map((p) => <option key={p.participant_id} value={p.participant_id}>{p.rh_participants!.display_name}</option>)}</select>
                      <button className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600">確定</button>
                    </form>
                    <form action={cancelSubstitution.bind(null, ...a, r.id)}><button className="text-xs text-neutral-500 hover:text-red-400">募集を取り消す</button></form>
                  </div>
                )}
              </div>
            ))}
            {editable && (
              <form action={requestSubstitution.bind(null, ...a)} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <select name="absent_participant_id" required className={input}><option value="">欠ける人</option>{sessionMembers.map((m) => <option key={m.participant_id} value={m.participant_id}>{m.rh_participants!.display_name}</option>)}</select>
                <input name="reason" placeholder="理由(例: 体調不良)" className={input} />
                <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">代役を募集する</button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
