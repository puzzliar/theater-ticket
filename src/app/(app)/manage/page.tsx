import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMyOrgs, requireSessionUser } from "@/lib/core/session";
import { isAdminRole } from "@/lib/core/types";
import { addDays, fmtDateLabel, fmtRange, jstDateString, jstDayRange } from "@/lib/rehearsal/time";
import { PRODUCTION_STATUS_LABEL, SESSION_KIND_LABEL, type ProductionRow, type SessionKind } from "@/lib/rehearsal/types";

export const dynamic = "force-dynamic";

// 主催者モードのホーム: 管理者である座組と公演、直近の予定の出欠状況、対応が必要なもの
export default async function ManagePage() {
  const me = await requireSessionUser("/manage");
  const orgs = (await listMyOrgs(me.id)).filter((o) => isAdminRole(o.role) && o.org.kind !== "personal");
  const orgIds = orgs.map((o) => o.org.id);
  const today = jstDateString();
  const { start } = jstDayRange(today);
  const { end } = jstDayRange(addDays(today, 13));
  const admin = supabaseAdmin();
  const [{ data: productions }, { data: sessions }, { data: subs }] = orgIds.length
    ? await Promise.all([
        admin.from("rh_productions").select("*, rh_production_members(participant_id)").in("org_id", orgIds).neq("status", "closed").order("created_at", { ascending: false }),
        admin.from("rh_sessions").select("id, org_id, production_id, kind, title, starts_at, ends_at, location, tentative, respond_by, rh_productions(name), rh_session_members(response)").in("org_id", orgIds).eq("status", "scheduled").gte("starts_at", start).lt("starts_at", end).order("starts_at"),
        admin.from("rh_substitution_requests").select("id, org_id, session_id, rh_sessions(starts_at, ends_at, rh_productions(name))").in("org_id", orgIds).eq("status", "open"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  type P = ProductionRow & { rh_production_members: { participant_id: string }[] };
  type S = { id: string; org_id: string; production_id: string; kind: SessionKind; title: string; starts_at: string; ends_at: string; location: string; tentative: boolean; respond_by: string | null; rh_productions: { name: string } | null; rh_session_members: { response: string }[] };
  type Sub = { id: string; org_id: string; session_id: string; rh_sessions: { starts_at: string; ends_at: string; rh_productions: { name: string } | null } | null };
  const prods = (productions ?? []) as P[];
  const upcoming = (sessions ?? []) as unknown as S[];
  const openSubs = (subs ?? []) as unknown as Sub[];
  const orgOf = new Map(orgs.map((o) => [o.org.id, o.org]));
  const tile = "rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]";
  const pendingTotal = upcoming.reduce((n, s) => n + s.rh_session_members.filter((m) => m.response === "pending").length, 0);
  const tentativeCount = upcoming.filter((s) => s.tentative).length;

  if (orgs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs text-dim">主催者モード</p>
          <h1 className="text-2xl font-bold tracking-tight">主催ホーム</h1>
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <p className="font-semibold">まだ管理している座組がありません</p>
          <p className="text-sm text-muted">座組(劇団・団体)を作ると、公演・シーン・予定を登録してキャストを召集できます。現在はクローズド β のため、作成には運営が発行する主催者コードが必要です。</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/orgs/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">座組を作る</Link>
            <Link href="/me" className="rounded-lg border border-line-strong px-4 py-2 text-sm hover:bg-surface-2">出演者として使う</Link>
          </div>
          <p className="text-xs text-dim">自分の公演を自分で管理するだけなら、出演者モードの「セルフ公演」で主催者コードなしに始められます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-dim">主催者モード ／ {fmtDateLabel(today)}</p>
          <h1 className="text-2xl font-bold tracking-tight">主催ホーム</h1>
        </div>
        <Link href="/orgs/new" className="rounded-lg border border-line-strong px-3.5 py-2 text-sm hover:bg-surface-2">＋ 座組を作る</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className={tile}><p className="text-xs text-dim">管理している座組</p><p className="mt-1 text-2xl font-semibold tabular-nums">{orgs.length}</p></div>
        <div className={tile}><p className="text-xs text-dim">2 週間の予定</p><p className="mt-1 text-2xl font-semibold tabular-nums">{upcoming.length}<span className="ml-1 text-sm font-normal text-muted">件</span></p></div>
        <div className={tile}><p className="text-xs text-dim">未回答の召集</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${pendingTotal ? "text-accent-text" : ""}`}>{pendingTotal}<span className="ml-1 text-sm font-normal text-muted">名分</span></p></div>
        <div className={tile}><p className="text-xs text-dim">代役募集中 ／ 仮押さえ</p><p className="mt-1 text-2xl font-semibold tabular-nums">{openSubs.length}<span className="mx-1 text-sm font-normal text-muted">／</span>{tentativeCount}</p></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">座組と公演</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => {
            const mine = prods.filter((p) => p.org_id === o.org.id);
            return (
              <div key={o.org.id} className={`${tile} space-y-2`}>
                <div className="flex items-center justify-between">
                  <Link href={`/o/${o.org.slug}`} className="font-semibold hover:underline">{o.org.name}</Link>
                  <Link href={`/o/${o.org.slug}/members`} className="text-xs text-muted hover:text-fg">メンバー・招待</Link>
                </div>
                {mine.length === 0 && <p className="text-sm text-muted">公演がありません。<Link href={`/o/${o.org.slug}`} className="text-accent-text hover:underline">作成する</Link></p>}
                {mine.map((p) => (
                  <Link key={p.id} href={`/o/${o.org.slug}/p/${p.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-accent/50">
                    <span>{p.name}</span>
                    <span className="text-xs text-dim">{PRODUCTION_STATUS_LABEL[p.status]} ／ {p.rh_production_members.length}名{p.opens_on && ` ／ 初日 ${p.opens_on}`}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {openSubs.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <h2 className="font-semibold text-accent-text">代役募集中</h2>
          {openSubs.map((r) => (
            <Link key={r.id} href={`/o/${orgOf.get(r.org_id)?.slug}/p/${upcoming.find((s) => s.id === r.session_id)?.production_id ?? ""}/s/${r.session_id}`} className="block rounded-lg border border-line bg-surface p-2 hover:border-accent/50">
              {r.rh_sessions && `${fmtRange(r.rh_sessions.starts_at, r.rh_sessions.ends_at)} ${orgOf.get(r.org_id)?.name}／${r.rh_sessions.rh_productions?.name ?? ""}`}
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">これからの予定(2 週間)</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">予定はありません。</p>}
        <div className="space-y-2">
          {upcoming.map((s) => {
            const yes = s.rh_session_members.filter((m) => m.response === "yes").length;
            const no = s.rh_session_members.filter((m) => m.response === "no").length;
            const pending = s.rh_session_members.filter((m) => m.response === "pending").length;
            const org = orgOf.get(s.org_id);
            return (
              <Link key={s.id} href={`/o/${org?.slug}/p/${s.production_id}/s/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-sm hover:border-accent/50">
                <div>
                  <p>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${s.kind === "performance" ? "bg-rose-500/15 text-rose-700" : "bg-sky-500/15 text-sky-700"}`}>{SESSION_KIND_LABEL[s.kind]}</span>
                    {s.tentative && <span className="mr-2 rounded bg-orange-500/15 px-1.5 py-0.5 text-xs text-orange-700">仮</span>}
                    <span className="font-medium">{fmtRange(s.starts_at, s.ends_at)}</span> <span className="text-muted">{org?.name}／</span>{s.rh_productions?.name}{s.title && ` ${s.title}`}
                  </p>
                  <p className="text-xs text-muted">{s.location && `📍${s.location}`}{s.tentative && s.respond_by && ` ／ 返答期限 ${fmtDateLabel(s.respond_by)}`}</p>
                </div>
                <p className="text-xs text-muted">召集{s.rh_session_members.length} ／ <span className="text-emerald-600">参加{yes}</span> ／ <span className="text-red-600">不参加{no}</span> ／ <span className={pending ? "text-accent-text" : ""}>未回答{pending}</span></p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
