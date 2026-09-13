import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, fmtDateLabel, fmtTime, jstDateString, jstDayRange, overlaps } from "@/lib/rehearsal/time";
import { SESSION_KIND_LABEL, type AvailabilityRow, type MemberRow, type SessionKind } from "@/lib/rehearsal/types";

export const dynamic = "force-dynamic";

// 週間の可用性マトリクス(要件 5.3)。メンバー × 日で「可/不可の申告」と「召集済みの予定(他現場)」を並べる。
export default async function AvailabilityMatrixPage({ searchParams }: { searchParams: Promise<{ from?: string; production?: string }> }) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");
  const sp = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : jstDateString();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const { start } = jstDayRange(from);
  const { end } = jstDayRange(addDays(from, 6));
  const admin = supabaseAdmin();

  const [{ data: members }, { data: avail }, { data: booked }, { data: productions }] = await Promise.all([
    admin.from("rh_members").select("id, name, kind").eq("is_active", true).order("name"),
    admin.from("rh_availability").select("*").lt("starts_at", end).gt("ends_at", start),
    admin
      .from("rh_session_members")
      .select("member_id, response, rh_sessions!inner(id, kind, starts_at, ends_at, status, production_id, rh_productions(name))")
      .lt("rh_sessions.starts_at", end)
      .gt("rh_sessions.ends_at", start)
      .neq("rh_sessions.status", "cancelled"),
    admin.from("rh_productions").select("id, name").neq("status", "closed").order("created_at", { ascending: false }),
  ]);

  // プロダクション絞り込み(参加メンバーのみ表示)
  let memberList = (members ?? []) as Pick<MemberRow, "id" | "name" | "kind">[];
  if (sp.production) {
    const { data: pm } = await admin.from("rh_production_members").select("member_id").eq("production_id", sp.production);
    const ids = new Set((pm ?? []).map((p) => p.member_id));
    memberList = memberList.filter((m) => ids.has(m.id));
  }

  type Booked = { member_id: string; response: string; rh_sessions: { id: string; kind: SessionKind; starts_at: string; ends_at: string; production_id: string; rh_productions: { name: string } | null } };
  const cell = (memberId: string, day: string) => {
    const { start: ds, end: de } = jstDayRange(day);
    const a = ((avail ?? []) as AvailabilityRow[]).filter((x) => x.member_id === memberId && overlaps(x.starts_at, x.ends_at, ds, de));
    const b = ((booked ?? []) as unknown as Booked[]).filter((x) => x.member_id === memberId && x.response !== "no" && overlaps(x.rh_sessions.starts_at, x.rh_sessions.ends_at, ds, de));
    return { a, b };
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500"><Link href="/admin/rehearsal" className="hover:text-neutral-300">← 稽古・シフト管理</Link></p>
        <h1 className="text-2xl font-bold">空き時間マトリクス</h1>
        <p className="text-sm text-neutral-400">メンバーが申告した参加可(緑)・不可(赤)と、召集済みの予定(青=稽古／桃=本番)を週単位で表示します。</p>
      </div>
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`?from=${addDays(from, -7)}${sp.production ? `&production=${sp.production}` : ""}`} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">← 前週</Link>
        <input type="date" name="from" defaultValue={from} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1" />
        <select name="production" defaultValue={sp.production ?? ""} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1">
          <option value="">全メンバー</option>
          {(productions ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} の参加者</option>)}
        </select>
        <button className="rounded bg-neutral-700 px-3 py-1 hover:bg-neutral-600">表示</button>
        <Link href={`?from=${addDays(from, 7)}${sp.production ? `&production=${sp.production}` : ""}`} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">翌週 →</Link>
      </form>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="p-2">メンバー</th>
              {days.map((d) => <th key={d} className={`p-2 ${d === jstDateString() ? "text-amber-300" : ""}`}>{fmtDateLabel(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {memberList.map((m) => (
              <tr key={m.id} className="border-t border-neutral-800 align-top">
                <td className="whitespace-nowrap p-2 font-medium">{m.name}</td>
                {days.map((d) => {
                  const { a, b } = cell(m.id, d);
                  return (
                    <td key={d} className="p-1">
                      <div className="space-y-0.5">
                        {a.map((x) => (
                          <div key={x.id} className={`rounded px-1 py-0.5 ${x.status === "available" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                            {x.status === "available" ? "可" : "不可"} {fmtTime(x.starts_at)}-{fmtTime(x.ends_at)}
                          </div>
                        ))}
                        {b.map((x) => (
                          <div key={x.rh_sessions.id} className={`rounded px-1 py-0.5 ${x.rh_sessions.kind === "performance" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300"}`}>
                            {SESSION_KIND_LABEL[x.rh_sessions.kind]} {fmtTime(x.rh_sessions.starts_at)}-{fmtTime(x.rh_sessions.ends_at)} {x.rh_sessions.rh_productions?.name}
                            {x.response === "pending" && <span className="text-yellow-400">?</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {memberList.length === 0 && <tr><td className="p-3 text-neutral-500" colSpan={8}>メンバーがいません。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
