import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { requireCurrentMember } from "@/lib/rehearsal/members";
import { listMemberSessions, type MemberSession } from "@/lib/rehearsal/schedule";
import { openSubstitutionsFor } from "@/lib/rehearsal/core";
import { addDays, fmtDateLabel, fmtRange, fmtTime, jstDateString, jstDayRange, nowMs } from "@/lib/rehearsal/time";
import { RESPONSE_LABEL, SESSION_KIND_LABEL, type AvailabilityRow } from "@/lib/rehearsal/types";
import { lineAddFriendUrl, lineConfigured } from "@/lib/line";
import { googleConfigured } from "@/lib/google-calendar";
import { respond, apply, addAvailability, deleteAvailability, newLineCode, unlinkLine, importGoogleBusy, setFreebusyImport, disconnectGoogle } from "./actions";

export const dynamic = "force-dynamic";

// メンバー個人ビュー(要件 5.6)。「今日どこへ行くか」を全プロダクション横断で表示する。
const GOOGLE_MSG: Record<string, { cls: string; text: string }> = {
  connected: { cls: "text-emerald-400", text: "Google カレンダーと連携しました。今後の召集をカレンダーに登録し、カレンダーの予定を「不可」として取り込みました。" },
  denied: { cls: "text-yellow-500", text: "Google の認可がキャンセルされました。" },
  error: { cls: "text-red-400", text: "Google 連携に失敗しました。時間をおいて再度お試しください。" },
  state_mismatch: { cls: "text-red-400", text: "連携の確認に失敗しました。もう一度「Google と連携」からやり直してください。" },
  not_configured: { cls: "text-yellow-500", text: "Google 連携はこの環境では設定されていません。" },
};

export default async function MePage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { user, member } = await requireCurrentMember();
  const sp = await searchParams;
  const googleMsg = sp.google ? GOOGLE_MSG[sp.google] : undefined;

  if (!member) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">稽古予定</h1>
        <p className="text-neutral-400">
          {user.displayName} さんはまだ稽古メンバーとして登録されていません。主催者にアカウント({user.email})の紐づけを依頼してください。
        </p>
        {user.role === "admin" && (
          <p className="text-sm">
            <Link href="/admin/rehearsal" className="text-amber-400 hover:underline">稽古管理(主催)へ</Link>
          </p>
        )}
      </div>
    );
  }

  const today = jstDateString();
  const { start: todayStart } = jstDayRange(today);
  const { end: weekEnd } = jstDayRange(addDays(today, 13));
  const [sessions, openRequests, { data: availability }] = await Promise.all([
    listMemberSessions(member.id, todayStart, weekEnd),
    openSubstitutionsFor(member.id),
    supabaseAdmin().from("rh_availability").select("*").eq("member_id", member.id).gte("ends_at", todayStart).order("starts_at").limit(50),
  ]);

  const pending = sessions.filter((s) => s.response === "pending");
  const byDay = new Map<string, MemberSession[]>();
  for (const s of sessions) {
    const d = jstDateString(new Date(s.startsAt));
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const icalUrl = `${SITE_URL}/api/ical/${member.ical_token}`;
  const lineCodeValid = member.line_link_code && member.line_link_expires_at && new Date(member.line_link_expires_at).getTime() > nowMs();

  const btn = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">稽古予定</h1>
        <p className="text-sm text-neutral-400">
          {member.name} さん ／ 今週 {sessions.filter((s) => jstDateString(new Date(s.startsAt)) < addDays(today, 7)).length} 件
          {user.role === "cast" && (
            <>
              {" "}／ <Link href="/cast" className="text-amber-400 hover:underline">チケット扱い</Link>
            </>
          )}
          {user.role === "admin" && (
            <>
              {" "}／ <Link href="/admin/rehearsal" className="text-amber-400 hover:underline">稽古管理(主催)</Link>
            </>
          )}
        </p>
      </div>

      {/* 要対応 */}
      {(pending.length > 0 || openRequests.length > 0) && (
        <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="font-semibold text-amber-300">要対応</h2>
          {openRequests.map((r) => (
            <div key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div>
                <p className="font-medium">代役募集: {r.absentName} さんの代わり</p>
                {r.session && (
                  <p className="text-neutral-300">
                    {fmtRange(r.session.starts_at, r.session.ends_at)} {r.session.production_name}({SESSION_KIND_LABEL[r.session.kind]}){r.session.location && ` @${r.session.location}`}
                  </p>
                )}
                {r.reason && <p className="text-xs text-neutral-500">{r.reason}</p>}
              </div>
              <form action={apply.bind(null, r.requestId)}>
                <button className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>入れます</button>
              </form>
            </div>
          ))}
          {pending.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div>
                <p className="font-medium">
                  {fmtRange(s.startsAt, s.endsAt)} {s.productionName}({SESSION_KIND_LABEL[s.kind]}){s.title && ` ${s.title}`}
                </p>
                <p className="text-xs text-neutral-400">
                  {s.location && `@${s.location} `}
                  {s.scenes.length > 0 && `シーン: ${s.scenes.map((x) => x.code).join(", ")}`}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={respond.bind(null, s.id, "yes")}><button className={`${btn} bg-emerald-500 text-black hover:bg-emerald-400`}>参加</button></form>
                <form action={respond.bind(null, s.id, "maybe")}><button className={`${btn} bg-neutral-700 hover:bg-neutral-600`}>未定</button></form>
                <form action={respond.bind(null, s.id, "no")}><button className={`${btn} bg-neutral-700 text-red-300 hover:bg-neutral-600`}>不参加</button></form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 今日〜2週間 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">今日からの予定(2週間)</h2>
        {sessions.length === 0 && <p className="text-neutral-400">予定はありません。</p>}
        {days.map((d) => {
          const list = byDay.get(d);
          if (!list) return null;
          return (
            <div key={d} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
              <p className={`mb-2 text-sm font-semibold ${d === today ? "text-amber-300" : "text-neutral-300"}`}>
                {d === today ? "今日 " : d === addDays(today, 1) ? "明日 " : ""}{fmtDateLabel(d)}
              </p>
              <div className="space-y-2">
                {list.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div>
                      <p>
                        <span className="font-mono text-neutral-200">{fmtTime(s.startsAt)}〜{fmtTime(s.endsAt)}</span>{" "}
                        <span className={`rounded px-1.5 py-0.5 text-xs ${s.kind === "performance" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`}>{SESSION_KIND_LABEL[s.kind]}</span>{" "}
                        <span className="font-medium">{s.productionName}</span>
                        {s.title && <span className="text-neutral-300"> {s.title}</span>}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {s.location ? `📍 ${s.location}` : "📍 場所未定"}
                        {s.scenes.length > 0 && ` ／ シーン: ${s.scenes.map((x) => `${x.code} ${x.name}`).join(", ")}`}
                      </p>
                      {s.note && <p className="text-xs text-neutral-500">{s.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${s.response === "yes" ? "text-emerald-400" : s.response === "no" ? "text-red-400" : "text-yellow-400"}`}>{RESPONSE_LABEL[s.response]}</span>
                      {s.response !== "pending" && s.status === "scheduled" && (
                        <form action={respond.bind(null, s.id, s.response === "yes" ? "no" : "yes")}>
                          <button className="text-xs text-neutral-500 hover:text-neutral-300 hover:underline">{s.response === "yes" ? "不参加にする" : "参加にする"}</button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* 空き時間 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">空き時間の登録</h2>
        <p className="text-sm text-neutral-400">主催者が稽古日程を組むときに参照します。参加できる時間帯、または参加できない時間帯を登録してください。</p>
        <form action={addAvailability} className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-6">
          <input name="date" type="date" required defaultValue={today} className={inputCls} />
          <select name="status" className={inputCls}>
            <option value="available">参加できる</option>
            <option value="unavailable">参加できない</option>
          </select>
          <input name="from" type="time" defaultValue="13:00" className={inputCls} />
          <input name="to" type="time" defaultValue="22:00" className={inputCls} />
          <label className="flex items-center gap-2 text-sm text-neutral-300"><input name="all_day" type="checkbox" /> 終日</label>
          <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">登録</button>
          <input name="note" placeholder="メモ(例: 別公演の本番)" className={`${inputCls} sm:col-span-6`} />
        </form>
        <div className="space-y-1 text-sm">
          {((availability ?? []) as AvailabilityRow[]).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded border border-neutral-800 px-3 py-1.5">
              <span>
                <span className={a.status === "available" ? "text-emerald-400" : "text-red-400"}>{a.status === "available" ? "可" : "不可"}</span>{" "}
                {fmtRange(a.starts_at, a.ends_at)} {a.note && <span className="text-neutral-500">({a.note})</span>}
              </span>
              <form action={deleteAvailability.bind(null, a.id)}><button className="text-xs text-neutral-500 hover:text-red-400">削除</button></form>
            </div>
          ))}
        </div>
      </section>

      {/* 連携 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">LINE 連携</h2>
          {!lineConfigured() && <p className="text-xs text-yellow-500">(LINE 公式アカウントが未設定のため、通知はメール({member.email ?? "未登録"})に送られます)</p>}
          {member.line_user_id ? (
            <>
              <p className="text-sm text-emerald-400">連携済み。召集・変更・毎朝の予定が LINE に届きます。</p>
              <p className="text-xs text-neutral-400">LINE で「今日」「今週」「参加」「不参加」「入れます」と送ると応答します。</p>
              <form action={unlinkLine}><button className="text-xs text-neutral-500 hover:text-red-400">連携を解除</button></form>
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
                <li>
                  公式アカウントを友だち追加{" "}
                  {lineAddFriendUrl() && <a href={lineAddFriendUrl()!} className="text-amber-400 hover:underline" target="_blank" rel="noreferrer">(追加リンク)</a>}
                </li>
                <li>下のコードを「連携 123456」の形式で LINE に送信</li>
              </ol>
              {lineCodeValid ? (
                <p className="text-2xl font-mono tracking-widest text-amber-300">{member.line_link_code}</p>
              ) : (
                <form action={newLineCode}><button className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>連携コードを発行(10分有効)</button></form>
              )}
            </>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">Google カレンダー連携</h2>
          {googleMsg && <p className={`text-sm ${googleMsg.cls}`}>{googleMsg.text}</p>}
          {googleConfigured() ? (
            member.google_refresh_token_enc ? (
              <>
                <p className="text-sm text-emerald-400">連携済み{member.google_email && `(${member.google_email})`}。召集された予定は即時にあなたのカレンダーへ登録・更新・削除されます。</p>
                <div className="flex items-center gap-2 text-sm text-neutral-300">
                  <form action={setFreebusyImport.bind(null, !member.google_freebusy_import)}>
                    <button className={`rounded px-2 py-0.5 text-xs ${member.google_freebusy_import ? "bg-emerald-500 text-black" : "bg-neutral-700"}`}>{member.google_freebusy_import ? "ON" : "OFF"}</button>
                  </form>
                  <span>カレンダーの「予定あり」を空き時間の「不可」として自動取り込み(毎朝更新。予定の内容は取得しません)</span>
                </div>
                <div className="flex gap-3 text-xs">
                  {member.google_freebusy_import && <form action={importGoogleBusy}><button className="text-amber-400 hover:underline">今すぐ取り込む</button></form>}
                  <form action={disconnectGoogle}><button className="text-neutral-500 hover:text-red-400">連携を解除(登録した予定も削除)</button></form>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-300">Google アカウントで認可すると、召集された予定が即時にあなたの Google カレンダーに登録され、変更・中止もすぐ反映されます。カレンダーの「予定あり」を空き時間として自動で取り込むこともできます。</p>
                <a href="/api/google/connect" className={`inline-block ${btn} bg-amber-500 text-black hover:bg-amber-400`}>Google と連携する</a>
              </>
            )
          ) : (
            <p className="text-xs text-yellow-500">(Google API 連携はこの環境では未設定です。下の購読 URL をご利用ください)</p>
          )}
          <details className="pt-2">
            <summary className="cursor-pointer text-sm text-neutral-300">購読 URL で表示する(Google / Apple / Outlook)</summary>
            <p className="mt-1 text-xs text-neutral-400">カレンダーの「URL で追加」に次の URL を貼り付けると、あなたの召集予定が表示されます。</p>
            <p className="mt-1 break-all rounded bg-neutral-800 p-2 font-mono text-xs text-amber-300">{icalUrl}</p>
            <p className="text-xs text-neutral-500">※ URL は本人専用です。Google 側の更新は数時間遅れることがあります。急な変更は LINE でお知らせします。</p>
          </details>
        </div>
      </section>
    </div>
  );
}
