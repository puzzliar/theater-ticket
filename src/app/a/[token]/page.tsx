import Link from "next/link";
import type { Metadata } from "next";
import { IS_REHEARSAL } from "@/lib/app";
import { computeDayStatuses, formatAvailabilityText, getShare, shareOptions, shareUsable } from "@/lib/rehearsal/availability-text";
import { fmtDateLabel, jstDateString } from "@/lib/rehearsal/time";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "空き状況 | ZAGUMIスケジュール", robots: { index: false } };

// 空き状況の公開ページ(リンクを知っている人だけ)。見せるのは ○×△ と可能な時間帯のみ
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = IS_REHEARSAL ? await getShare(token) : null;
  if (!share) return <Empty text="このリンクは存在しないか、無効化されています。" />;
  const usable = shareUsable(share);
  if (!usable.ok) return <Empty text={usable.reason!} />;
  const opts = shareOptions(share);
  const statuses = await computeDayStatuses(share.profile_id, opts);
  const text = formatAvailabilityText(share.display_name, statuses, opts);
  const today = jstDateString();
  const markCls: Record<string, string> = { "○": "text-emerald-400", "×": "text-red-400", "△": "text-yellow-400", "−": "text-neutral-500" };
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-neutral-400">空き状況{share.label && ` ／ ${share.label}`}</p>
        <h1 className="text-2xl font-bold">{share.display_name}</h1>
        <p className="text-sm text-neutral-400">{fmtDateLabel(opts.fromDate)}〜{fmtDateLabel(opts.toDate)} ／ 対象時間帯 {opts.windowFrom}〜{opts.windowTo}。開くたびに最新の状況を表示します。</p>
      </div>
      <div className="rounded-lg border border-neutral-800 text-sm">
        {statuses.map((d) => (
          <div key={d.date} className="flex items-center justify-between border-b border-neutral-800/60 px-3 py-1.5 last:border-0">
            <span className={d.date === today ? "text-amber-300" : ""}>{fmtDateLabel(d.date)}</span>
            <span className={`font-semibold ${markCls[d.mark]}`}>{d.mark}<span className="ml-2 text-xs font-normal text-neutral-400">{d.mark === "△" && d.free.map((r) => `${r.from}〜${r.to}`).join(", ")}</span></span>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">○=終日可 ×=不可 △=一部可(可能な時間帯)</p>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={text} label="テキストでコピー" className="rounded-md bg-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-600" />
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
        <p className="font-semibold text-amber-300">主催者の方へ</p>
        <p className="mt-1">ZAGUMIスケジュールに座組を登録すると、キャスト全員の空き状況を一覧で確かめながら稽古や本番の予定を作れます。予定を作るとキャストに自動で召集が届きます。</p>
        <Link href="/" className="mt-2 inline-block text-amber-400 hover:underline">ZAGUMIスケジュールについて</Link>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-md space-y-2">
      <h1 className="text-xl font-bold">空き状況</h1>
      <p className="text-sm text-neutral-400">{text}</p>
    </div>
  );
}
