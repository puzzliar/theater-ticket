import Link from "next/link";
import type { SessionUser } from "@/lib/core/session";

// ZAGUMIシフトのトップページ(独立したサービスとして配信。ZAGUMIスケジュール・ZAGUMIチケットとは ZAGUMIアカウントのみ共有)
const FEATURES: [string, string][] = [
  ["回 × 役割の表で組む", "公演の回(日時)ごとに案内人・受付・制御などの役割と人数を決め、表の空いている枠を埋めていきます。"],
  ["回は一括で作る", "期間・各日の開始時刻・長さ・曜日を指定すると、公演期間の全回がまとめて作られます。仮押さえにもできます。"],
  ["入れる回をキャストに聞く", "作った回に対して「入れる／未定／入れない」をキャスト全員に聞き、回答が表に並びます。"],
  ["自動で埋めて、手で直す", "入れると答えた人を確定回数の少ない順に、同じ時間帯の重複を避けて割り当てます。結果は手で入れ替えられます。"],
  ["確定だけが本人の予定になる", "確定した人にだけ召集・Google カレンダー・前日リマインドが届きます。希望を聞いただけの回は予定に載りません。"],
  ["出演回数が見える", "メンバーごとの確定回数・入れる回数・未回答数を集計。出演回数は精算の元データになります。"],
];

export default function ShiftLanding({ me, deleted }: { me: SessionUser | null; deleted?: boolean }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60rem_24rem_at_50%_-4rem,rgb(245_165_36_/_0.22),transparent_70%)]" />
      <div className="mx-auto max-w-5xl space-y-20 px-4 pb-10 pt-16">
        {deleted && <p className="rounded-xl border border-line bg-surface p-3 text-sm text-fg-2">退会が完了しました。ご利用ありがとうございました。</p>}

        <section className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />イマーシブ公演のためのシフト表。基本機能は無料
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">この回、誰が入れるか。<br />どの枠がまだ空いているか。</h1>
          <p className="mx-auto max-w-2xl text-base text-muted sm:text-lg">ウォークスルー型や、1 人のキャストが 1 組のお客様を案内する形式の公演向け。回ごとに役割を埋めるシフト表を、主催者とキャストで一緒に組むサービスです。</p>
          <div className="flex flex-wrap justify-center gap-3">
            {me ? (
              <Link href="/me" className="rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink shadow-[var(--shadow-pop)] hover:bg-accent-hover">マイシフトを開く</Link>
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
            <p className="mt-2 text-sm leading-relaxed text-muted">役割と人数を決めて回を一括で作り、キャストに入れる回を聞いて、自動で埋めて、足りない枠だけ手で調整する。確定した人にだけ召集が届くので、希望を聞く段階で予定を汚しません。複数の公演を並行して管理できます。</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">キャストの方へ</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">聞かれた回に「入れる」と答えるだけ。確定した回がマイシフトに並び、Google カレンダーにも同期されます。前日には LINE やメールでリマインドが届きます。</p>
          </div>
        </section>

        <section className="space-y-2 text-center text-sm text-muted">
          <p>現在はクローズド β として招待制で運用しています。座組(団体)を作成するには運営が発行する主催者コードが必要です。キャストとして参加する場合は、主催者から受け取った招待リンクを開いてください。</p>
          <p className="text-xs text-dim">アカウントは ZAGUMI の他のサービス(スケジュール・チケット・物販・精算)と共通です。小劇場の稽古〜本番の日程調整は ZAGUMIスケジュールをご利用ください。</p>
        </section>
      </div>
    </div>
  );
}
