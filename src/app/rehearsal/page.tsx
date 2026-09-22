import Link from "next/link";
import { getSessionUser } from "@/lib/core/session";

export const dynamic = "force-dynamic";

// 稽古管理サービスの紹介ページ(PUZZLIAR サブブランド)
export default async function RehearsalLanding({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const sp = await searchParams;
  const me = await getSessionUser();
  return (
    <div className="space-y-12">
      {sp.deleted && <p className="rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-300">退会が完了しました。ご利用ありがとうございました。</p>}
      <section className="space-y-4">
        <p className="text-sm text-amber-400">PUZZLIAR 稽古管理(無料)</p>
        <h1 className="text-3xl font-bold leading-tight">今日、どこに行けばいいか。<br />誰がいつ来られるか。</h1>
        <p className="max-w-2xl text-neutral-300">小劇場・イマーシブシアターの稽古とシフトを、主催者とキャストの両方が一つの場所で把握できるサービスです。複数の劇団を掛け持ちするキャストも、1 つのアカウントで全部の予定が見えます。</p>
        <div className="flex flex-wrap gap-3">
          {me ? (
            <Link href="/me" className="rounded-md bg-amber-500 px-5 py-2.5 font-semibold text-black hover:bg-amber-400">稽古予定を開く</Link>
          ) : (
            <>
              <Link href="/signup" className="rounded-md bg-amber-500 px-5 py-2.5 font-semibold text-black hover:bg-amber-400">無料ではじめる</Link>
              <Link href="/login" className="rounded-md border border-neutral-700 px-5 py-2.5 hover:bg-neutral-900">ログイン</Link>
            </>
          )}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["主催者", "稽古枠を作ると必要なキャストが自動で召集され、誰が来られるかが作成前に分かります。どのシーンを何回稽古したか、あとどのシーンが残っているかが常に見えます。"],
          ["キャスト", "所属するすべての劇団の予定が一つの画面に。Google カレンダーへの即時同期、LINE で「今日」と送るだけの確認、急な代役募集への「入れます」の一言で応募。"],
          ["無料・共通アカウント", "基本機能は無料です。将来の PUZZLIAR チケット販売・物販管理と同じアカウントで、劇団とキャストの台帳をそのまま使えます。"],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="font-semibold text-amber-300">{t}</h2>
            <p className="mt-2 text-sm text-neutral-300">{d}</p>
          </div>
        ))}
      </section>
      <section className="space-y-2 text-sm text-neutral-400">
        <p>現在はクローズド β として招待制で運用しています。劇団を作成するには運営が発行する主催者コードが必要です。キャストとして参加する場合は、主催者から受け取った招待リンクを開いてください。</p>
      </section>
    </div>
  );
}
