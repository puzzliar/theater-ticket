import Link from "next/link";
import type { SessionUser } from "@/lib/core/session";

// ZAGUMIスケジュールのトップページ(独立したサービスとして配信。ZAGUMIチケットとは ZAGUMIアカウントのみ共有)
const FEATURES: [string, string][] = [
  ["召集と出欠が一画面に", "稽古や本番の予定を作ると必要なキャストが自動で召集され、誰が来られるかが作成前に分かります。"],
  ["複数の座組を 1 つの予定表で", "掛け持ちしているすべての座組・公演の予定が一つに。主催者には「来られる／来られない」の判定だけが共有されます。"],
  ["空き状況を ○×△ で一瞬で返す", "期間を指定すると ○×△ の文章ができ、コピーや LINE で主催者に送れます。共有リンクなら常に最新です。"],
  ["主催者がいなくても使える", "届いた日程を貼り付けるだけで予定に。共演者と一緒に管理し、主催者が登録したら公演ごと引き渡せます。"],
  ["Google カレンダーと LINE", "予定は Google カレンダーに即時同期。LINE で「今日」と送れば予定が返り、代役募集には「入れます」で応募。"],
  ["出演履歴が公式サイトに", "参加した公演から出演履歴が自動で積み上がり、写真とプロフィールを添えた公開ページになります。"],
];

export default function RehearsalLanding({ me, deleted }: { me: SessionUser | null; deleted?: boolean }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60rem_24rem_at_50%_-4rem,rgb(245_165_36_/_0.22),transparent_70%)]" />
      <div className="mx-auto max-w-5xl space-y-20 px-4 pb-10 pt-16">
        {deleted && <p className="rounded-xl border border-line bg-surface p-3 text-sm text-fg-2">退会が完了しました。ご利用ありがとうございました。</p>}

        <section className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />小劇場・イマーシブシアターのための予定表。基本機能は無料
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">今日、どこに行けばいいか。<br />誰がいつ来られるか。</h1>
          <p className="mx-auto max-w-2xl text-base text-muted sm:text-lg">稽古から本番までの予定を、主催者とキャストの両方が一つの場所で把握できるサービスです。複数の座組を掛け持ちするキャストも、1 つのアカウントで全部の予定が見えます。</p>
          <div className="flex flex-wrap justify-center gap-3">
            {me ? (
              <Link href="/me" className="rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink shadow-[var(--shadow-pop)] hover:bg-accent-hover">マイスケジュールを開く</Link>
            ) : (
              <>
                <Link href="/signup" className="rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink shadow-[var(--shadow-pop)] hover:bg-accent-hover">無料ではじめる</Link>
                <Link href="/login" className="rounded-lg border border-line-strong bg-surface px-6 py-3 hover:bg-surface-2">ログイン</Link>
              </>
            )}
          </div>
          <p className="text-xs text-dim">Google アカウントで 30 秒。主催者から招待リンクを受け取った方は、そのリンクから参加できます。</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d], i) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <p className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 font-mono text-xs text-accent-text">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">主催者の方へ</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">シーンごとに必要なキャストを登録しておけば、稽古の予定を作る前に全員の参加可否が分かります。どのシーンを何回稽古したか、あとどのシーンが残っているかが常に見えます。複数の公演を並行して管理できます。</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">キャストの方へ</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">主催者が使っていなくても始められます。届いた日程を貼り付けて自分の予定にし、空き状況を ○×△ で返し、仮押さえの重なりに気づける。出演履歴は公式サイトとして公開できます。</p>
          </div>
        </section>

        <section className="space-y-2 text-center text-sm text-muted">
          <p>現在はクローズド β として招待制で運用しています。座組(団体)を作成するには運営が発行する主催者コードが必要です。キャストとして参加する場合は、主催者から受け取った招待リンクを開いてください。</p>
          <p className="text-xs text-dim">アカウントは ZAGUMI の他のサービス(チケット・物販・精算)と共通です。</p>
        </section>
      </div>
    </div>
  );
}
