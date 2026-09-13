import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/core/session";
import { addDays, fmtDateLabel, fmtTime, jstDateString, jstDayRange, overlaps } from "@/lib/rehearsal/time";
import { SESSION_KIND_LABEL, type AvailabilityRow, type ParticipantRow, type SessionKind } from "@/lib/rehearsal/types";

export const dynamic = "force-dynamic";

// 週間の空き時間マトリクス(管理者)。可用性は本人申告、召集済みの予定は自組織分は名称つき、他組織分は「他現場」とだけ表示(4.3)
export default async function AvailabilityMatrixPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; production?: string }> }) {
  const { slug } = await params;
  const { org } = await requireOrg(slug, "admin");
  const sp = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : jstDateString();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const { start } = jstDayRange(from);
  const { end } = jstDayRange(addDays(from, 6));
  const db = await supabaseServer();
  const admin = supabaseAdmin();

  const [{ data: participants }, { data: productions }] = await Promise.all([
    db.from("rh_participants").select("*").eq("org_id", org.id).eq("is_active", true).order("display_name"),
    db.from("rh_productions").select("id, name").eq("org_id", org.id).neq("status", "closed").order("created_at", { ascending: false }),
  ]);
  let list = (participants ?? []) as ParticipantRow[];
  if (sp.production) {
    const { data: pm } = await db.from("rh_production_members").select("participant_id").eq("production_id", sp.production);
    const ids = new Set((pm ?? []).map((p) => p.participant_id));
    list = list.filter((p) => ids.has(p.id));
  }
  const profileIds = list.map((p) => p.profile_id).filter((x): x is string => Boolean(x));

  // 可用性(本人申告)と、本人に紐づく全組織の召集(他組織は時間だけ)。service role で読んで判定結果のみ描画する
  const [{ data: avail }, { data: booked }] = profileIds.length
    ? await Promise.all([
        admin.from("rh_availability").select("*").in("profile_id", profileIds).lt("starts_at", end).gt("ends_at", start),
        admin
          .from("rh_session_members")
          .select("response, rh_participants!inner(profile_id), rh_sessions!inner(id, org_id, kind, starts_at, ends_at, status, rh_productions(name))")
          .in("rh_participants.profile_id", profileIds)
          .lt("rh_sessions.starts_at", end)
          .gt("rh_sessions.ends_at", start)
          .neq("rh_sessions.status", "cancelled"),
      ])
    : [{ data: [] }, { data: [] }];
  type Booked = { response: string; rh_participants: { profile_id: string }; rh_sessions: { id: string; org_id: string; kind: SessionKind; starts_at: string; ends_at: string; rh_productions: { name: string } | null } };

  const cell = (profileId: string | null, day: string) => {
    if (!profileId) return { a: [] as AvailabilityRow[], b: [] as Booked[] };
    const { start: ds, end: de } = jstDayRange(day);
    return {
      a: ((avail ?? []) as AvailabilityRow[]).filter((x) => x.profile_id === profileId && overlaps(x.starts_at, x.ends_at, ds, de)),
      b: ((booked ?? []) as unknown as Booked[]).filter((x) => x.rh_participants.profile_id === profileId && x.response !== "no" && overlaps(x.rh_sessions.starts_at, x.rh_sessions.ends_at, ds, de)),
    };
  };
  const q = (d: string) => `?from=${d}${sp.production ? `&production=${sp.production}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">空き時間マトリクス</h2>
        <p className="text-sm text-neutral-400">本人が申告した参加可(緑)・不可(赤)と、召集済みの予定(青=稽古／桃=本番／灰=他団体の予定)を週単位で表示します。未登録(仮メンバー)は空欄です。</p>
      </div>
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={q(addDays(from, -7))} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">← 前週</Link>
        <input type="date" name="from" defaultValue={from} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1" />
        <select name="production" defaultValue={sp.production ?? ""} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1">
          <option value="">全参加者</option>
          {(productions ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} の参加者</option>)}
        </select>
        <button className="rounded bg-neutral-700 px-3 py-1 hover:bg-neutral-600">表示</button>
        <Link href={q(addDays(from, 7))} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">翌週 →</Link>
      </form>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr><th className="p-2">参加者</th>{days.map((d) => <th key={d} className={`p-2 ${d === jstDateString() ? "text-amber-300" : ""}`}>{fmtDateLabel(d)}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-neutral-800 align-top">
                <td className="whitespace-nowrap p-2 font-medium">{p.display_name}{!p.profile_id && <span className="ml-1 text-neutral-500">(未登録)</span>}</td>
                {days.map((d) => {
                  const { a, b } = cell(p.profile_id, d);
                  return (
                    <td key={d} className="p-1">
                      <div className="space-y-0.5">
                        {a.map((x) => (
                          <div key={x.id} className={`rounded px-1 py-0.5 ${x.status === "available" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{x.status === "available" ? "可" : "不可"} {fmtTime(x.starts_at)}-{fmtTime(x.ends_at)}</div>
                        ))}
                        {b.map((x) =>
                          x.rh_sessions.org_id === org.id ? (
                            <div key={x.rh_sessions.id} className={`rounded px-1 py-0.5 ${x.rh_sessions.kind === "performance" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300"}`}>
                              {SESSION_KIND_LABEL[x.rh_sessions.kind]} {fmtTime(x.rh_sessions.starts_at)}-{fmtTime(x.rh_sessions.ends_at)} {x.rh_sessions.rh_productions?.name}{x.response === "pending" && <span className="text-yellow-400">?</span>}
                            </div>
                          ) : (
                            <div key={x.rh_sessions.id} className="rounded bg-neutral-700/40 px-1 py-0.5 text-neutral-400">他現場 {fmtTime(x.rh_sessions.starts_at)}-{fmtTime(x.rh_sessions.ends_at)}</div>
                          ),
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {list.length === 0 && <tr><td className="p-3 text-neutral-500" colSpan={8}>参加者がいません。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
