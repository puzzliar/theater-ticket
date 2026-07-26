import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanupExpiredHolds, takenSeatIds } from "@/lib/orders";
import { fmtDateTime } from "@/lib/format";
import PurchaseForm from "./PurchaseForm";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; stageId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { eventId, stageId } = await params;
  const { c } = await searchParams;
  const admin = supabaseAdmin();
  await cleanupExpiredHolds(admin);

  const { data: event } = await admin
    .from("tk_events")
    .select("id, name, venue_name, is_published")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || !event.is_published) notFound();

  const { data: stage } = await admin
    .from("tk_stages")
    .select("*")
    .eq("id", stageId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!stage) notFound();

  const [{ data: areas }, { data: seatClasses }, { data: ticketTypes }, { data: casts }, { data: stock }] =
    await Promise.all([
      admin.from("tk_areas").select("*").eq("event_id", eventId),
      admin.from("tk_seat_classes").select("*").eq("event_id", eventId),
      admin
        .from("tk_ticket_types")
        .select("*")
        .eq("is_active", true)
        .contains("sales_channel", ["online"])
        .in("seat_class_id", (await admin.from("tk_seat_classes").select("id").eq("event_id", eventId)).data?.map((r) => r.id) ?? []),
      admin.from("tk_casts").select("id, name, slug").eq("event_id", eventId).order("name"),
      admin.from("tk_stage_area_stock").select("*").eq("stage_id", stageId),
    ]);

  const reservedAreaIds = (areas ?? []).filter((a) => a.kind === "reserved").map((a) => a.id);
  const { data: seats } = reservedAreaIds.length
    ? await admin.from("tk_seats").select("*").in("area_id", reservedAreaIds).eq("is_active", true)
    : { data: [] };
  const taken = await takenSeatIds(admin, stageId);

  const defaultCastId = c ? ((casts ?? []).find((x) => x.slug === c)?.id ?? null) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{event.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {stage.name} ／ {fmtDateTime(stage.starts_at)} 開演 ／ {event.venue_name}
        </p>
      </div>
      <PurchaseForm
        eventId={eventId}
        stageId={stageId}
        areas={areas ?? []}
        seatClasses={seatClasses ?? []}
        ticketTypes={ticketTypes ?? []}
        seats={seats ?? []}
        takenSeatIds={[...taken]}
        stock={stock ?? []}
        casts={casts ?? []}
        defaultCastId={defaultCastId}
      />
    </div>
  );
}
