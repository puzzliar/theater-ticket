import { loadShiftBoard, listShiftRoles, tally } from "@/lib/rehearsal/shifts";
import { fmtDateLabel, fmtTime, jstDateString, jstDayRange } from "@/lib/rehearsal/time";
import type { ShiftRoleRow } from "@/lib/rehearsal/types";
import { addShiftRole, updateShiftRole, deleteShiftRole, generateSlots, openRequests, assignShiftAction, unassignShiftAction, autoAssignAction, notifyAssignedAction } from "../../actions";

// シフト制の公演の管理ボード: 役割 → 回の一括生成 → 希望の受付 → 確定(手動/自動) → 一斉通知
export default async function ShiftBoard({ orgId, productionId, isAdmin, defaultLocation, flash }: { orgId: string; productionId: string; isAdmin: boolean; defaultLocation: string; flash: { slots?: string; assigned?: string; notified?: string } }) {
  const today = jstDateString();
  const [roles, board] = await Promise.all([listShiftRoles(productionId), loadShiftBoard(productionId, jstDayRange(today).start)]);
  const input = "rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm";
  const small = "rounded border border-line-strong bg-surface-2 px-2 py-1 text-xs";
  const counts = tally(board);
  const totalNeed = board.length * roles.reduce((m, role) => m + role.required_count, 0);
  const totalFilled = board.reduce((n, r) => n + r.members.filter((m) => m.assignment === "assigned").length, 0);
  const byDate = new Map<string, typeof board>();
  for (const r of board) {
    const d = jstDateString(new Date(r.session.starts_at));
    byDate.set(d, [...(byDate.get(d) ?? []), r]);
  }
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <section id="shifts" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">シフト表</h3>
        <p className="text-sm text-muted">今後 {board.length} 回 ／ 役割の枠 {totalNeed} のうち確定 <span className={totalFilled >= totalNeed && totalNeed > 0 ? "text-emerald-600" : "text-accent-text"}>{totalFilled}</span></p>
      </div>
      {flash.slots && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">{flash.slots} 回を作成しました。</p>}
      {flash.assigned && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">希望から {flash.assigned} 枠を確定しました。内容を確認して「確定を一斉通知」を押してください。</p>}
      {flash.notified && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">{flash.notified} 名に召集を送りました。</p>}

      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <p className="font-medium">1. 役割と 1 回あたりの人数</p>
            {roles.length === 0 && <p className="text-xs text-muted">例: 案内人 3 名、受付 1 名、制御 1 名</p>}
            {roles.map((r: ShiftRoleRow) => (
              <form key={r.id} action={updateShiftRole.bind(null, orgId, productionId, r.id)} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.name}</span>
                <span className="flex items-center gap-1">
                  <input name="required_count" type="number" min={0} defaultValue={r.required_count} className={`${small} w-14`} /> 名
                  <button className="rounded bg-surface-3 px-2 py-0.5 text-xs hover:bg-line-strong">保存</button>
                  <button formAction={deleteShiftRole.bind(null, orgId, productionId, r.id)} className="text-xs text-dim hover:text-red-600">削除</button>
                </span>
              </form>
            ))}
            <form action={addShiftRole.bind(null, orgId, productionId)} className="flex flex-wrap items-center gap-2 pt-1">
              <input name="name" required placeholder="役割名(例: 案内人)" className={input} />
              <input name="required_count" type="number" min={0} defaultValue={1} className={`${input} w-20`} />
              <button className="rounded-lg bg-surface-3 px-3 py-2 text-sm hover:bg-line-strong">追加</button>
            </form>
          </div>
          <form action={generateSlots.bind(null, orgId, productionId)} className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <p className="font-medium">2. 回を一括で作る</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted">開始日<input name="from" type="date" required defaultValue={today} className={`${input} mt-1 w-full`} /></label>
              <label className="text-xs text-muted">終了日<input name="to" type="date" required defaultValue={today} className={`${input} mt-1 w-full`} /></label>
              <label className="text-xs text-muted sm:col-span-2">各日の開始時刻(カンマ区切り)<input name="times" required placeholder="11:00, 13:00, 15:00, 17:00" className={`${input} mt-1 w-full`} /></label>
              <label className="text-xs text-muted">1 回の長さ(分)<input name="duration" type="number" min={15} defaultValue={90} className={`${input} mt-1 w-full`} /></label>
              <label className="text-xs text-muted">タイトル({"{n}"}=その日の何回目)<input name="title_pattern" defaultValue="{n}回目" className={`${input} mt-1 w-full`} /></label>
              <input name="location" defaultValue={defaultLocation} placeholder="場所" className={`${input} sm:col-span-2`} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-fg-2">
              <span className="text-muted">曜日(未選択なら毎日):</span>
              {weekdays.map((w, i) => <label key={i} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={i} />{w}</label>)}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-fg-2">
              <label className="flex items-center gap-1"><input type="checkbox" name="open_requests" defaultChecked /> 公演メンバー全員に「入れる回」を聞く</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="notify" defaultChecked /> 通知する</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="tentative" /> 仮押さえとして作る</label>
            </div>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">回を作成</button>
          </form>
        </div>
      )}

      {isAdmin && board.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <span className="font-medium">3. 埋める</span>
          <form action={openRequests.bind(null, orgId, productionId)} className="flex items-center gap-2">
            <input type="hidden" name="notify" value="on" />
            <button className="rounded-lg border border-line-strong px-3 py-1.5 text-xs hover:bg-surface-2">まだ聞いていないメンバーに希望を聞く</button>
          </form>
          <form action={autoAssignAction.bind(null, orgId, productionId)}><button className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent-text hover:bg-accent/10">希望から自動で埋める(未充足分)</button></form>
          <form action={notifyAssignedAction.bind(null, orgId, productionId)}><button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover">確定を一斉通知</button></form>
          <span className="text-xs text-dim">自動割り当ては「入れる」と答えた人を、確定回数の少ない順に、同じ時間帯の重複を避けて入れます。</span>
        </div>
      )}

      {board.length === 0 && <p className="text-sm text-muted">回がまだありません。{isAdmin && "上の「回を一括で作る」から作成してください。"}</p>}
      {[...byDate.entries()].map(([date, rows]) => (
        <div key={date} className="space-y-2">
          <p className="text-sm font-semibold text-fg-2">{fmtDateLabel(date)}</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="p-2">回</th>
                  {roles.map((r) => <th key={r.id} className="p-2">{r.name} <span className="font-normal">({r.required_count})</span></th>)}
                  {roles.length === 0 && <th className="p-2">確定</th>}
                  <th className="p-2">入れる人(未確定)</th>
                  <th className="p-2">未回答／入れない</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session, members }) => {
                  const assigned = members.filter((m) => m.assignment === "assigned");
                  const yes = members.filter((m) => m.assignment === "candidate" && m.response === "yes");
                  const maybe = members.filter((m) => m.assignment === "candidate" && m.response === "maybe");
                  const pending = members.filter((m) => m.assignment === "candidate" && m.response === "pending").length;
                  const no = members.filter((m) => m.assignment === "candidate" && m.response === "no").length;
                  const cell = (roleId: string | null) => {
                    const list = assigned.filter((m) => (roleId ? m.shift_role_id === roleId : true));
                    const role = roles.find((r) => r.id === roleId);
                    const short = role ? list.length < role.required_count : false;
                    return (
                      <td key={roleId ?? "all"} className={`p-2 align-top ${short ? "bg-accent/5" : ""}`}>
                        <div className="flex flex-wrap gap-1">
                          {list.map((m) => (
                            <span key={m.participant_id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${m.response === "no" ? "bg-red-500/10 text-red-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                              {m.name}
                              {isAdmin && <form action={unassignShiftAction.bind(null, orgId, productionId, session.id, m.participant_id)}><button className="text-dim hover:text-red-600" title="確定を取り消す">×</button></form>}
                            </span>
                          ))}
                          {short && <span className="text-xs text-accent-text">あと {role!.required_count - list.length}</span>}
                        </div>
                      </td>
                    );
                  };
                  return (
                    <tr key={session.id} className="border-t border-line align-top">
                      <td className="p-2 whitespace-nowrap">
                        <a href={`./${productionId}/s/${session.id}`} className="font-mono text-fg hover:underline">{fmtTime(session.starts_at)}〜{fmtTime(session.ends_at)}</a>
                        <span className="block text-xs text-muted">{session.title}{session.tentative && " ／ 仮"}</span>
                      </td>
                      {roles.length ? roles.map((r) => cell(r.id)) : cell(null)}
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {[...yes, ...maybe].map((m) => (
                            isAdmin ? (
                              <form key={m.participant_id} action={assignShiftAction.bind(null, orgId, productionId, session.id)} className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-xs">
                                <input type="hidden" name="participant_id" value={m.participant_id} />
                                <span className={m.response === "maybe" ? "text-muted" : ""}>{m.name}{m.response === "maybe" && "?"}</span>
                                {roles.length > 0 && <select name="role_id" className="rounded border border-line bg-surface px-1 text-[11px]">{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
                                <button className="rounded bg-surface-3 px-1.5 text-[11px] hover:bg-line-strong">確定</button>
                              </form>
                            ) : (
                              <span key={m.participant_id} className="rounded-full border border-line px-2 py-0.5 text-xs">{m.name}{m.response === "maybe" && "?"}</span>
                            )
                          ))}
                          {yes.length + maybe.length === 0 && <span className="text-xs text-dim">-</span>}
                        </div>
                      </td>
                      <td className="p-2 text-xs text-muted">{pending} ／ {no}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {counts.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">メンバー別の回数(確定 ／ 入れる ／ 未回答)</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {counts.map((t) => (
              <div key={t.participant_id} className="flex items-center justify-between rounded border border-line px-3 py-1.5">
                <span>{t.name}</span>
                <span className="text-xs text-muted"><span className="font-semibold text-fg">{t.assigned}</span> ／ {t.yes} ／ {t.pending}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-dim">確定回数は精算(ZAGUMI精算)の出演回数の元になります。</p>
        </details>
      )}
    </section>
  );
}
