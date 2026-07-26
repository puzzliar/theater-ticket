import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const admin = supabaseAdmin();
  const { data: events } = await admin
    .from("tk_events")
    .select("id, name, description, venue_name, tk_stages(id, starts_at)")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">公演一覧</h1>
      {(events ?? []).length === 0 && (
        <p className="text-neutral-400">現在販売中の公演はありません。</p>
      )}
      <div className="grid gap-4">
        {(events ?? []).map((e) => {
          const stages = (e.tk_stages ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          return (
            <Link
              key={e.id}
              href={`/e/${e.id}`}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600"
            >
              <h2 className="text-lg font-semibold">{e.name}</h2>
              <p className="mt-1 text-sm text-neutral-400">{e.venue_name}</p>
              {stages.length > 0 && (
                <p className="mt-2 text-sm text-neutral-300">
                  {fmtDateTime(stages[0].starts_at)}
                  {stages.length > 1 &&
                    ` 〜 ${fmtDateTime(stages[stages.length - 1].starts_at)}（全${stages.length}ステージ）`}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
