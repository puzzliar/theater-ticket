import { SCHEDULE_SITE_URL, SHIFT_SITE_URL, TICKET_SITE_URL } from "@/lib/app";

// ZAGUMI ブランドのトップページ(ルートドメイン用)。各サービスへの入口と共通アカウントの説明だけを置く。
// サービス同士は相互リンクしない方針だが、ブランドのトップは唯一の「入口」としてリンクする
const SERVICES = [
  { key: "schedule", name: "ZAGUMIスケジュール", logo: "/brand/zagumi-schedule-mark.svg", url: SCHEDULE_SITE_URL, lead: "稽古から本番までの予定を、座組全員で", body: "召集と出欠、シーン進捗、空き状況の ○×△ 共有、仮押さえ、キャスト公式サイト。小劇場の劇団と、複数の座組を掛け持ちするキャストのために。", status: "β" },
  { key: "shift", name: "ZAGUMIシフト", logo: "/brand/zagumi-shift-mark.svg", url: SHIFT_SITE_URL, lead: "回ごとに役割を埋める、イマーシブ公演のシフト表", body: "回の一括生成、入れる回の受付、自動割り当て、確定の一斉通知、出演回数の集計。ウォークスルー型や 1 人 1 組誘導型の公演のために。", status: "β" },
  { key: "ticket", name: "ZAGUMIチケット", logo: "/brand/zagumi-ticket-mark.svg", url: TICKET_SITE_URL, lead: "小劇場公演のチケット販売", body: "指定席と自由席の混合販売、キャスト扱いの管理、ゲスト予約、QR チェックイン。", status: "準備中" },
  { key: "goods", name: "ZAGUMI物販", logo: "/brand/zagumi-goods-mark.svg", url: null, lead: "事前物販と当日物販", body: "公演グッズの事前予約と当日販売、キャストごとの売上集計。", status: "構想中" },
  { key: "pay", name: "ZAGUMI精算", logo: "/brand/zagumi-pay-mark.svg", url: null, lead: "キャスト精算", body: "出演回数・チケット扱い・物販の実績から、キャストへの精算をまとめる。", status: "構想中" },
];

export default function BrandLanding() {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(60rem_24rem_at_50%_-4rem,rgb(245_165_36_/_0.22),transparent_70%)]" />
      <div className="mx-auto max-w-5xl space-y-16 px-4 pb-10 pt-16">
        <section className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />小劇場・イマーシブ公演のための座組の道具箱</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">座組のことは、ZAGUMI で。</h1>
          <p className="mx-auto max-w-2xl text-base text-muted sm:text-lg">稽古の予定、本番のシフト、チケットの販売。公演を支える裏方の仕事を、主催者とキャストが 1 つのアカウントで使えるサービス群です。基本機能は無料で、必要なサービスだけを使えます。</p>
        </section>

        <section id="services" className="grid gap-4 sm:grid-cols-2">
          {SERVICES.map((s) => {
            const inner = (
              <>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.logo} alt="" className="h-10 w-10" />
                  <div>
                    <h2 className="font-semibold">{s.name}</h2>
                    <p className="text-xs text-dim">{s.status}</p>
                  </div>
                </div>
                <p className="mt-3 font-medium">{s.lead}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                {s.url && <p className="mt-3 text-sm font-semibold text-accent-text">開く →</p>}
              </>
            );
            const cls = "block rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]";
            return s.url ? (
              <a key={s.key} href={s.url} className={`${cls} transition hover:border-accent/50`}>{inner}</a>
            ) : (
              <div key={s.key} className={`${cls} opacity-70`}>{inner}</div>
            );
          })}
        </section>

        <section className="grid gap-6 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">1 つのアカウントで</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">ZAGUMIアカウントは全サービス共通です。Google アカウントかメールアドレスで登録すると、どのサービスにも同じアカウントでログインできます。所属する座組(劇団・団体)もサービスをまたいで共通です。</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">主催者にも、キャストにも</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">同じ人がある公演では主催者、別の公演ではキャストになる。ZAGUMI は主催者モードと出演者モードを切り替えて、立場に合った画面を出します。</p>
          </div>
        </section>

        <section className="text-center text-xs text-dim">
          <p>運営: PUZZLIAR。現在はクローズド β として招待制で運用しています。</p>
        </section>
      </div>
    </div>
  );
}
