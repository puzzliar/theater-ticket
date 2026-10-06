import Link from "next/link";
import { requireSessionUser } from "@/lib/core/session";
import { computeDayStatuses, formatAvailabilityText, lineShareUrl, listShares, normalizeOptions, shareOptions, MAX_RANGE_DAYS } from "@/lib/rehearsal/availability-text";
import { fmtDate, fmtDateLabel, jstDateString } from "@/lib/rehearsal/time";
import { SITE_URL } from "@/lib/constants";
import CopyButton from "@/components/CopyButton";
import { newShare, removeShare } from "./actions";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// 空き状況を ○×△ のテキストにして、コピー／LINE で送る／共有リンクにする
export default async function AvailabilityTextPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireSessionUser("/me/availability");
  const sp = await searchParams;
  const today = jstDateString();
  const opts = normalizeOptions({ fromDate: one(sp.from), toDate: one(sp.to), windowFrom: one(sp.window_from), windowTo: one(sp.window_to), emptyMark: one(sp.empty) === "−" ? "−" : "○" }, today);
  const [statuses, shares] = await Promise.all([computeDayStatuses(me.id, opts), listShares(me.id)]);
  const text = formatAvailabilityText(me.profile.display_name, statuses, opts);
  const input = "rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm";
  const markCls: Record<string, string> = { "○": "text-emerald-400", "×": "text-red-400", "△": "text-yellow-400", "−": "text-dim" };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-dim"><Link href="/me" className="hover:text-fg">← マイスケジュール</Link></p>
        <h1 className="text-2xl font-bold">空き状況を伝える</h1>
        <p className="mt-1 text-sm text-muted">期間を指定すると、登録済みの予定(すべての座組)と空き時間から ○×△ の一覧を作ります。予定の内容は含まれず、記号と可能な時間帯だけが出ます。</p>
      </div>

      <form method="get" className="grid gap-2 rounded-xl border border-line bg-surface p-4 sm:grid-cols-6">
        <label className="text-xs text-muted">開始日<input name="from" type="date" defaultValue={opts.fromDate} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-muted">終了日<input name="to" type="date" defaultValue={opts.toDate} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-muted">対象時間帯(から)<input name="window_from" type="time" defaultValue={opts.windowFrom} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-muted">(まで)<input name="window_to" type="time" defaultValue={opts.windowTo} className={`${input} mt-1 w-full`} /></label>
        <label className="text-xs text-muted">予定が何もない日
          <select name="empty" defaultValue={opts.emptyMark} className={`${input} mt-1 w-full`}><option value="○">○ として出す</option><option value="−">− 未回答として出す</option></select>
        </label>
        <div className="flex items-end"><button className="w-full rounded-lg bg-surface-3 px-4 py-2 text-sm hover:bg-line-strong">作り直す</button></div>
        <p className="text-xs text-dim sm:col-span-6">最長 {MAX_RANGE_DAYS} 日。○ は対象時間帯すべて空き、× は空きなし、△ は一部空き(時間帯を併記)。Google カレンダー連携中は「予定あり」の時間が自動で埋まります。</p>
      </form>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-semibold">一覧</h2>
          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-line text-sm">
            {statuses.map((d) => (
              <div key={d.date} className="flex items-center justify-between border-b border-line/60 px-3 py-1.5 last:border-0">
                <span className={d.date === today ? "text-accent" : ""}>{fmtDateLabel(d.date)}</span>
                <span className={`font-semibold ${markCls[d.mark]}`}>{d.mark}<span className="ml-2 text-xs font-normal text-muted">{d.mark === "△" && d.free.map((r) => `${r.from}〜${r.to}`).join(", ")}</span></span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">LINE に貼る文章</h2>
          <textarea readOnly value={text} rows={16} className="w-full rounded-xl border border-line bg-bg p-3 font-mono text-xs text-fg" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={text} label="テキストをコピー" />
            <a href={lineShareUrl(text)} target="_blank" rel="noopener" className="rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">LINE で送る</a>
          </div>
          <p className="text-xs text-dim">「LINE で送る」はスマホなら LINE アプリが開き、この文章が入力欄に入った状態で送り先を選べます。PC では LINE の共有画面が開きます。</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">共有リンク</h2>
        <p className="text-sm text-muted">主催者がアカウントなしで、いつでも最新の ○×△ を見られるリンクです。見えるのは記号と時間帯だけで、予定の内容や座組名は出ません。</p>
        {shares.length > 0 && (
          <div className="space-y-2 text-sm">
            {shares.map((s) => {
              const url = `${SITE_URL}/a/${s.token}`;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{s.label || "共有リンク"} <span className="text-xs text-dim">{fmtDateLabel(s.from_date)}〜{fmtDateLabel(s.to_date)} ／ {shareOptions(s).windowFrom}〜{shareOptions(s).windowTo} ／ 期限 {fmtDate(s.expires_at)}</span></p>
                    <p className="break-all font-mono text-xs text-accent">{url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton text={url} label="URL をコピー" className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs hover:bg-line-strong" />
                    <a href={lineShareUrl(`${me.profile.display_name}の空き状況です。\n${url}`)} target="_blank" rel="noopener" className="rounded-lg bg-[#06C755] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">LINE で送る</a>
                    <form action={removeShare.bind(null, s.id)}><button className="text-xs text-dim hover:text-red-400">無効化</button></form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form action={newShare} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <input type="hidden" name="from" value={opts.fromDate} />
          <input type="hidden" name="to" value={opts.toDate} />
          <input type="hidden" name="window_from" value={opts.windowFrom} />
          <input type="hidden" name="window_to" value={opts.windowTo} />
          <input type="hidden" name="empty" value={opts.emptyMark} />
          <input name="label" placeholder="ラベル(例: 冬公演の日程調整)" className={input} />
          <label className="text-xs text-muted">有効日数<input name="days" type="number" min={1} max={90} defaultValue={14} className={`${input} mt-1 w-24`} /></label>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">上の期間で共有リンクを発行</button>
        </form>
      </section>
    </div>
  );
}
