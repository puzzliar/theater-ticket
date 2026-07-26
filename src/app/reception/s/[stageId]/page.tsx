import { notFound, redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";
import CheckinList, { type ReceptionOrder } from "./CheckinList";

export const dynamic = "force-dynamic";

export default async function ReceptionStagePage({ params }: { params: Promise<{ stageId: string }> }) {
  const user = await getAppUser();
  if (!user || (user.role !== "staff" && user.role !== "admin")) redirect("/login");
  const { stageId } = await params;
  const admin = supabaseAdmin();

  const { data: stage } = await admin
    .from("tk_stages")
    .select("id, name, starts_at, tk_events(name)")
    .eq("id", stageId)
    .maybeSingle();
  if (!stage) notFound();

  const { data: orders } = await admin
    .from("tk_orders")
    .select("id, buyer_name, channel, payment_status, payment_method, total, status, tk_order_items(id)")
    .eq("stage_id", stageId)
    .eq("status", "active")
    .order("buyer_name");

  const itemIds = (orders ?? []).flatMap((o) => (o.tk_order_items ?? []).map((i: { id: string }) => i.id));
  const { data: tickets } = itemIds.length
    ? await admin
        .from("tk_tickets")
        .select("id, order_item_id, seat_id, entry_number, qr_token, checkin_status, tk_seats(row_label, seat_number)")
        .in("order_item_id", itemIds)
        .neq("checkin_status", "void")
    : { data: [] };

  const receptionOrders: ReceptionOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    buyerName: o.buyer_name,
    channel: o.channel,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    total: o.total,
    tickets: (tickets ?? [])
      .filter((t) => (o.tk_order_items ?? []).some((i: { id: string }) => i.id === t.order_item_id))
      .map((t) => {
        const seat = t.tk_seats as unknown as { row_label: string; seat_number: number } | null;
        return {
          id: t.id,
          label: seat ? `${seat.row_label}${seat.seat_number}` : `整理番号${t.entry_number ?? "-"}`,
          qrToken: t.qr_token,
          checkedIn: t.checkin_status === "checked_in",
        };
      }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{(stage.tk_events as unknown as { name: string }).name}</h1>
        <p className="text-sm text-neutral-400">
          {stage.name} ／ {fmtDateTime(stage.starts_at)} 開演 ── 受付
        </p>
      </div>
      <CheckinList stageId={stageId} orders={receptionOrders} />
    </div>
  );
}
