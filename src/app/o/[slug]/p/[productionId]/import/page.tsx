import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/core/session";
import { parseScheduleText } from "@/lib/rehearsal/parse-schedule";
import { fmtDateLabel, jstDateString } from "@/lib/rehearsal/time";
import type { ProductionRow } from "@/lib/rehearsal/types";
import { importSessions } from "../../../actions";

export const dynamic = "force-dynamic";

const SAMPLE = `10/12(日) 13:00-17:00 稽古 @区民センター
10/13(月) 18:00〜21:30 立ち稽古
10/18(土)〜10/19(日) 13:00〜18:00 通し稽古
11/1(土) 14:00開演 本番 @小劇場B1`;

// 日程テキストの取り込み。GET で貼り付け → 同じページでプレビュー → 確認して一括登録
export default async function ImportPage({ params, searchParams }: { params: Promise<{ slug: string; productionId: string }>; searchParams: Promise<{ text?: string }> }) {
  const { slug, productionId } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug, "admin");
  const db = await supabaseServer();
  const { data: production } = await db.from("rh_productions").select("*").eq("id", productionId).eq("org_id", org.id).maybeSingle();
  if (!production) notFound();
  const prod = production as ProductionRow;
  const text = (sp.text ?? "").slice(0, 8000);
  const today = jstDateString();
  const parsed = text ? parseScheduleText(text, { today, defaultLocation: prod.default_location }) : null;
  const input = "rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-neutral-500"><Link href={`/o/${slug}/p/${productionId}`} className="hover:text-neutral-300">← {prod.name}</Link></p>
        <h2 className="text-2xl font-bold">日程を貼り付けて取り込む</h2>
        <p className="mt-1 text-sm text-neutral-400">LINE や PDF から日程の文章をそのまま貼り付けてください。1 行 1 件として読み取り、確認してから登録します。日付だけの行の下に時間だけの行が続く形式にも対応しています。</p>
      </div>

      <form method="get" className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <textarea name="text" rows={10} defaultValue={text} placeholder={SAMPLE} className="w-full rounded-md border border-neutral-700 bg-neutral-950 p-3 font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">読み取る</button>
          <span className="text-xs text-neutral-500">対応例: 「10/12(日) 13:00-17:00 稽古 @場所」「10月13日 18時〜21時半」「10/18〜10/19 13:00〜18:00」「11/1 14:00開演 本番」</span>
        </div>
      </form>

      {parsed && (
        <form action={importSessions.bind(null, org.id, productionId)} className="space-y-3">
          <h3 className="font-semibold">読み取り結果 ({parsed.items.length} 件)</h3>
          {parsed.items.length === 0 && <p className="text-sm text-neutral-400">予定として読み取れる行がありませんでした。日付と時間が同じ行にあるか確認してください。</p>}
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-left text-xs text-neutral-400"><tr><th className="p-2">登録</th><th className="p-2">日付</th><th className="p-2">開始</th><th className="p-2">終了</th><th className="p-2">種別</th><th className="p-2">タイトル</th><th className="p-2">場所</th><th className="p-2">元の行・注意</th></tr></thead>
              <tbody>
                {parsed.items.map((it, i) => (
                  <tr key={i} className="border-t border-neutral-800 align-top">
                    <td className="p-2"><input type="hidden" name="row" value={i} /><input type="checkbox" name={`use_${i}`} defaultChecked /></td>
                    <td className="p-2"><input name={`date_${i}`} type="date" defaultValue={it.date} className={input} /><span className="block text-xs text-neutral-500">{fmtDateLabel(it.date)}</span></td>
                    <td className="p-2"><input name={`from_${i}`} type="time" defaultValue={it.from} className={input} /></td>
                    <td className="p-2"><input name={`to_${i}`} type="time" defaultValue={it.to} className={input} /></td>
                    <td className="p-2"><select name={`kind_${i}`} defaultValue={it.kind} className={input}><option value="rehearsal">稽古</option><option value="performance">本番</option><option value="other">その他</option></select></td>
                    <td className="p-2"><input name={`title_${i}`} defaultValue={it.title} className={`${input} w-40`} /></td>
                    <td className="p-2"><input name={`location_${i}`} defaultValue={it.location} className={`${input} w-32`} /></td>
                    <td className="p-2 text-xs text-neutral-500"><span className="block">{it.raw}</span>{it.warnings.map((w) => <span key={w} className="block text-yellow-500">{w}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.skipped.length > 0 && (
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">読み取れなかった行 ({parsed.skipped.length})</summary>
              <ul className="mt-1 list-disc pl-5">{parsed.skipped.map((s, i) => <li key={i}>{s.line} <span className="text-neutral-600">({s.reason})</span></li>)}</ul>
            </details>
          )}
          {parsed.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="invite_all" defaultChecked /> 公演メンバー全員を召集する</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="tentative" /> すべて仮押さえとして登録</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="notify" /> 召集を通知する(件数が多いと通知も多くなります)</label>
              <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">チェックした予定を登録</button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
