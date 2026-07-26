import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// 公演ページ。?c=<castSlug> はキャスト個別URL(扱い自動設定)として購入ページへ引き継ぐ
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { eventId } = await params;
  const { c } = await searchParams;
  const admin = supabaseAdmin();

  const { data: event } = await admin
    .from("tk_events")
    .select("id, name, description, venue_name, is_published")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || !event.is_published) notFound();

  const { data: stages } = await admin
    .from("tk_stages")
    .select("id, name, starts_at, doors_open_at, sales_starts_at, sales_ends_at")
    .eq("event_id", eventId)
    .order("starts_at");

  const now = new Date().toISOString();
  const castParam = c ? `?c=${encodeURIComponent(c)}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="mt-1 text-neutral-400">{event.venue_name}</p>
        {event.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-300">{event.description}</p>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">ステージを選択</h2>
        {(stages ?? []).map((s) => {
          const open =
            (!s.sales_starts_at || s.sales_starts_at <= now) &&
            (!s.sales_ends_at || s.sales_ends_at >= now);
          return (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4"
            >
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-neutral-400">
                  {fmtDateTime(s.starts_at)} 開演
                  {s.doors_open_at && ` ／ ${fmtDateTime(s.doors_open_at)} 開場`}
                </p>
              </div>
              {open ? (
                <Link
                  href={`/e/${eventId}/s/${s.id}${castParam}`}
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400"
                >
                  チケット購入
                </Link>
              ) : (
                <span className="text-sm text-neutral-500">販売期間外</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
