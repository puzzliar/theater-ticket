import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMyOrgs, requireSessionUser } from "@/lib/core/session";
import { listProfileSessions, type MemberSession } from "@/lib/rehearsal/schedule";
import { openSubstitutionsFor } from "@/lib/rehearsal/core";
import { addDays, fmtDateLabel, fmtRange, fmtTime, jstDateString, jstDayRange } from "@/lib/rehearsal/time";
import { RESPONSE_LABEL, SESSION_KIND_LABEL, type AvailabilityRow } from "@/lib/rehearsal/types";
import { isAdminRole } from "@/lib/core/types";
import { listPersonalProductions } from "@/lib/rehearsal/personal";
import { PRODUCTION_STATUS_LABEL } from "@/lib/rehearsal/types";
import { overlaps } from "@/lib/rehearsal/time";
import { respond, apply, addAvailability, deleteAvailability, createSelfProduction } from "./actions";

export const dynamic = "force-dynamic";

// 個人ビュー(要件 5.6): 全組織横断の「今日どこへ行くか」
export default async function MePage() {
  const me = await requireSessionUser("/me");
  const today = jstDateString();
  const { start: todayStart } = jstDayRange(today);
  const { end: rangeEnd } = jstDayRange(addDays(today, 13));
  const { end: farEnd } = jstDayRange(addDays(today, 90));
  const [orgs, sessions, openRequests, { data: availability }, personal, farSessions] = await Promise.all([
    listMyOrgs(me.id),
    listProfileSessions(me.id, todayStart, rangeEnd),
    openSubstitutionsFor(me.id),
    supabaseAdmin().from("rh_availability").select("*").eq("profile_id", me.id).gte("ends_at", todayStart).order("starts_at").limit(60),
    listPersonalProductions(me.id),
    listProfileSessions(me.id, todayStart, farEnd),
  ]);
  // 仮押さえの重複: 90 日先までで、仮押さえを含む予定同士が時間帯で重なるもの
  const active = farSessions.filter((s) => s.response !== "no" && s.status === "scheduled");
  const tentatives = active.filter((s) => s.tentative);
  const holdConflicts = tentatives
    .map((t) => ({ t, others: active.filter((o) => o.id !== t.id && overlaps(t.startsAt, t.endsAt, o.startsAt, o.endsAt)) }))
    .filter((x) => x.others.length > 0);
  const realOrgs = orgs.filter((o) => o.org.kind !== "personal");

  const pending = sessions.filter((s) => s.response === "pending");
  const byDay = new Map<string, MemberSession[]>();
  for (const s of sessions) {
    const d = jstDateString(new Date(s.startsAt));
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const weekCount = sessions.filter((s) => jstDateString(new Date(s.startsAt)) < addDays(today, 7)).length;
  const btn = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">マイスケジュール</h1>
          <p className="text-sm text-neutral-400">{me.profile.display_name} さん ／ 今週 {weekCount} 件</p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link href="/me/availability" className="rounded-md border border-amber-500/50 px-3 py-1.5 text-amber-300 hover:bg-amber-500/10">空き状況を伝える</Link>
          <Link href="/me/site" className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800">公式サイト</Link>
          <Link href="/me/settings" className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800">通知・連携の設定</Link>
        </nav>
      </div>

      {/* 所属 */}
      <section className="flex flex-wrap items-center gap-2 text-sm">
        {realOrgs.length === 0 && <span className="text-neutral-400">まだどの座組にも参加していません。主催者から招待リンクを受け取るか、下の「セルフ公演」で自分の予定を管理できます。</span>}
        {realOrgs.map((o) => (
          <Link key={o.org.id} href={`/o/${o.org.slug}`} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 hover:border-neutral-600">
            {o.org.name} {isAdminRole(o.role) && <span className="text-xs text-amber-400">管理</span>}
          </Link>
        ))}
        <Link href="/orgs/new" className="rounded-lg border border-dashed border-neutral-700 px-3 py-1.5 text-neutral-400 hover:text-neutral-200">＋ 座組を作る(主催者)</Link>
      </section>

      {holdConflicts.length > 0 && (
        <section className="space-y-2 rounded-xl border border-orange-500/40 bg-orange-500/5 p-4 text-sm">
          <h2 className="font-semibold text-orange-300">仮押さえが重なっています</h2>
          {holdConflicts.map(({ t, others }) => (
            <div key={t.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <p><span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-300">仮</span> {fmtRange(t.startsAt, t.endsAt)} {t.orgName}／{t.productionName}{t.title && ` ${t.title}`}{t.respondBy && <span className="ml-2 text-xs text-neutral-400">返答期限 {fmtDateLabel(t.respondBy)}</span>}</p>
              <p className="mt-1 text-xs text-neutral-400">重なる予定: {others.map((o) => `${fmtRange(o.startsAt, o.endsAt)} ${o.orgName}／${o.productionName}${o.tentative ? "(仮)" : "(確定)"}`).join(" ／ ")}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-500">どちらかの主催者に早めに返答してください。確定した予定と重なる仮押さえは、主催者側の参加可否確認でも「重複」と表示されます。</p>
        </section>
      )}

      {(pending.length > 0 || openRequests.length > 0) && (
        <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="font-semibold text-amber-300">要対応</h2>
          {openRequests.map((r) => (
            <div key={r.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div>
                <p className="font-medium">代役募集: {r.absentName} さんの代わり</p>
                {r.session && (
                  <p className="text-neutral-300">
                    {fmtRange(r.session.starts_at, r.session.ends_at)} {r.session.org_name}／{r.session.production_name}({SESSION_KIND_LABEL[r.session.kind]}){r.session.location && ` @${r.session.location}`}
                  </p>
                )}
                {r.reason && <p className="text-xs text-neutral-500">{r.reason}</p>}
              </div>
              <form action={apply.bind(null, r.requestId)}><button className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>入れます</button></form>
            </div>
          ))}
          {pending.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div>
                <p className="font-medium">{s.tentative && <span className="mr-1 rounded bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-300">仮</span>}{fmtRange(s.startsAt, s.endsAt)} {s.orgName}／{s.productionName}({SESSION_KIND_LABEL[s.kind]}){s.title && ` ${s.title}`}{s.respondBy && <span className="ml-2 text-xs text-neutral-400">返答期限 {fmtDateLabel(s.respondBy)}</span>}</p>
                <p className="text-xs text-neutral-400">{s.location && `@${s.location} `}{s.scenes.length > 0 && `シーン: ${s.scenes.map((x) => x.code).join(", ")}`}</p>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">今日からの予定(2週間)</h2>
        {sessions.length === 0 && <p className="text-neutral-400">予定はありません。</p>}
        {days.map((d) => {
          const list = byDay.get(d);
          if (!list) return null;
          return (
            <div key={d} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
              <p className={`mb-2 text-sm font-semibold ${d === today ? "text-amber-300" : "text-neutral-300"}`}>{d === today ? "今日 " : d === addDays(today, 1) ? "明日 " : ""}{fmtDateLabel(d)}</p>
              <div className="space-y-2">
                {list.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div>
                      <p>
                        <span className="font-mono text-neutral-200">{fmtTime(s.startsAt)}〜{fmtTime(s.endsAt)}</span>{" "}
                        <span className={`rounded px-1.5 py-0.5 text-xs ${s.kind === "performance" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`}>{SESSION_KIND_LABEL[s.kind]}</span>{" "}
                        {s.tentative && <span className="mr-1 rounded bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-300">仮</span>}
                        <span className="text-neutral-400">{s.orgName}／</span><span className="font-medium">{s.productionName}</span>
                        {s.title && <span className="text-neutral-300"> {s.title}</span>}
                      </p>
                      <p className="text-xs text-neutral-400">{s.location ? `📍 ${s.location}` : "📍 場所未定"}{s.scenes.length > 0 && ` ／ シーン: ${s.scenes.map((x) => `${x.code} ${x.name}`).join(", ")}`}</p>
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">セルフ公演</h2>
          {personal && <Link href={`/o/${personal.org.slug}`} className="text-xs text-neutral-400 hover:text-neutral-200">一覧・共演者の招待 →</Link>}
        </div>
        <p className="text-sm text-neutral-400">主催者が ZAGUMI を使っていない公演でも、届いた日程を自分で登録して予定に載せられます。日程表の貼り付けで一括登録でき、共演者を招待して一緒に管理したり、主催者が登録したら公演ごと引き渡したりできます。</p>
        {personal && personal.productions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {personal.productions.map((p) => (
              <Link key={p.id} href={`/o/${personal.org.slug}/p/${p.id}`} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-600">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{PRODUCTION_STATUS_LABEL[p.status]}{p.opens_on && ` ／ 初日 ${p.opens_on}`} ／ {p.member_count}名</span>
              </Link>
            ))}
          </div>
        )}
        <form action={createSelfProduction} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-neutral-700 p-3">
          <input name="name" required placeholder="公演名(例: 冬公演『○○』)" className={inputCls} />
          <input name="default_location" placeholder="主な稽古場所(任意)" className={inputCls} />
          <input name="opens_on" type="date" title="初日(任意)" className={inputCls} />
          <button className="rounded-md bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600">セルフ公演を作る</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">空き時間の登録</h2>
        <p className="text-sm text-neutral-400">所属するすべての劇団の日程調整に使われます(主催者には「来られる／来られない」の判定だけが見えます)。Google カレンダーを連携すると「予定あり」が自動で不可になります。</p>
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
                <span className={a.status === "available" ? "text-emerald-400" : "text-red-400"}>{a.status === "available" ? "可" : "不可"}</span> {fmtRange(a.starts_at, a.ends_at)}
                {a.note && <span className="text-neutral-500"> ({a.note})</span>}
                {a.source === "calendar" && <span className="ml-1 text-xs text-neutral-600">Google</span>}
              </span>
              <form action={deleteAvailability.bind(null, a.id)}><button className="text-xs text-neutral-500 hover:text-red-400">削除</button></form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
