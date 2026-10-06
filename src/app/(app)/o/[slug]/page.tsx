import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/core/session";
import { listProfileSessions } from "@/lib/rehearsal/schedule";
import { participantForProfile } from "@/lib/rehearsal/profile";
import { addDays, fmtRange, jstDateString, jstDayRange } from "@/lib/rehearsal/time";
import { PRODUCTION_STATUS_LABEL, SESSION_KIND_LABEL, RESPONSE_LABEL, type ParticipantRow, type ProductionRow } from "@/lib/rehearsal/types";
import { PART_LABEL } from "@/lib/core/types";
import { createProduction, updateProductionStatus, claimMe, ensureMyParticipant } from "./actions";

export const dynamic = "force-dynamic";

// 組織ホーム。管理者: プロダクション管理。メンバー: この組織での自分の予定と仮メンバーの紐づけ
export default async function OrgHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ joined?: string; created?: string; denied?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { org, user, isAdmin } = await requireOrg(slug);
  const db = await supabaseServer(); // RLS 適用の読み取り
  const [{ data: productions }, mine, { data: unclaimed }] = await Promise.all([
    db.from("rh_productions").select("*, rh_production_members(participant_id)").eq("org_id", org.id).order("created_at", { ascending: false }),
    participantForProfile(org.id, user.id),
    db.from("rh_participants").select("*").eq("org_id", org.id).is("profile_id", null).eq("is_active", true).order("display_name"),
  ]);
  const today = jstDateString();
  const sessions = (await listProfileSessions(user.id, jstDayRange(today).start, jstDayRange(addDays(today, 30)).end)).filter((s) => s.orgId === org.id);
  const input = "rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm";

  return (
    <div className="space-y-10">
      {sp.joined && <p className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">{org.name} に参加しました。召集されるとマイスケジュールに表示されます。</p>}
      {sp.created && <p className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">団体を作成しました。「メンバー」から招待リンクを発行してキャストを招待してください。</p>}
      {sp.denied && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">その操作には管理者権限が必要です。</p>}

      {/* 仮メンバーの紐づけ(本人) */}
      {!mine && (
        <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="font-semibold text-accent">この団体での参加者登録</p>
          {(unclaimed ?? []).length > 0 ? (
            <>
              <p className="mt-1 text-fg-2">主催者が先に登録した名前があります。あなたのものを選んでください。</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {((unclaimed ?? []) as ParticipantRow[]).map((p) => (
                  <form key={p.id} action={claimMe.bind(null, org.id, p.id)}>
                    <button className="rounded-lg border border-accent/40 px-3 py-1.5 hover:bg-accent/10">{p.display_name} <span className="text-xs text-dim">({PART_LABEL[p.part]})</span> は私です</button>
                  </form>
                ))}
                <form action={ensureMyParticipant.bind(null, org.id)}><button className="rounded-lg border border-line-strong px-3 py-1.5 text-fg-2 hover:bg-surface-2">どれでもない(新規で登録)</button></form>
              </div>
            </>
          ) : (
            <form action={ensureMyParticipant.bind(null, org.id)} className="mt-2"><button className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink hover:bg-accent-hover">参加者として登録する</button></form>
          )}
        </section>
      )}

      {/* 自分の予定(この組織) */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">この団体での自分の予定(30日)</h2>
        {sessions.length === 0 && <p className="text-sm text-muted">召集されている予定はありません。</p>}
        {sessions.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm">
            <span><span className="text-xs text-muted">{SESSION_KIND_LABEL[s.kind]}</span> {fmtRange(s.startsAt, s.endsAt)} {s.productionName} {s.title}</span>
            <span className={`text-xs ${s.response === "yes" ? "text-emerald-400" : s.response === "no" ? "text-red-400" : "text-yellow-400"}`}>{RESPONSE_LABEL[s.response]}</span>
          </div>
        ))}
        <p className="text-xs text-dim">出欠の回答は <Link href="/me" className="underline">自分の予定</Link> から。</p>
      </section>

      {/* プロダクション */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">プロダクション</h2>
        {(productions ?? []).length === 0 && <p className="text-sm text-muted">まだありません。</p>}
        <div className="grid gap-3">
          {((productions ?? []) as (ProductionRow & { rh_production_members: { participant_id: string }[] })[]).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-4">
              <Link href={`/o/${slug}/p/${p.id}`} className="hover:text-accent">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-dim">{p.rh_production_members.length}名{p.opens_on && ` ／ 初日 ${p.opens_on}`} ／ {PRODUCTION_STATUS_LABEL[p.status]}</span>
              </Link>
              {isAdmin && (
                <div className="flex items-center gap-1 text-xs">
                  {(Object.keys(PRODUCTION_STATUS_LABEL) as ProductionRow["status"][]).map((s) => (
                    <form key={s} action={updateProductionStatus.bind(null, org.id, p.id, s)}>
                      <button className={`rounded px-2 py-1 ${p.status === s ? "bg-accent text-black" : "bg-surface-2 text-muted hover:bg-surface-3"}`}>{PRODUCTION_STATUS_LABEL[s]}</button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <form action={createProduction.bind(null, org.id)} className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 font-medium">新しいプロダクション</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="name" required placeholder="公演名(例: 秋公演『○○』)" className={input} />
              <input name="default_location" placeholder="既定の稽古場所" className={input} />
              <label className="text-xs text-muted">稽古開始日<input name="rehearsal_starts_on" type="date" className={`${input} mt-1 w-full`} /></label>
              <label className="text-xs text-muted">初日<input name="opens_on" type="date" className={`${input} mt-1 w-full`} /></label>
              <input name="note" placeholder="メモ" className={`${input} sm:col-span-2`} />
            </div>
            <button className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">作成</button>
          </form>
        )}
      </section>
    </div>
  );
}
