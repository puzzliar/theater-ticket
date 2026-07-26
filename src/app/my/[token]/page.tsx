import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDateTime, yen, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/format";
import PayButton from "./PayButton";

export const dynamic = "force-dynamic";

// 購入者向けチケットページ(manage_token で認証レス閲覧)
export default async function MyTicketsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = supabaseAdmin();

  const { data: order } = await admin
    .from("tk_orders")
    .select("*, tk_stages(name, starts_at, doors_open_at, tk_events(name, venue_name))")
    .eq("manage_token", token)
    .maybeSingle();
  if (!order) notFound();

  const stage = order.tk_stages as unknown as {
    name: string;
    starts_at: string;
    doors_open_at: string | null;
    tk_events: { name: string; venue_name: string };
  };

  const { data: items } = await admin
    .from("tk_order_items")
    .select("id, tk_ticket_types(name)")
    .eq("order_id", order.id);
  const { data: tickets } = await admin
    .from("tk_tickets")
    .select("*, tk_seats(row_label, seat_number)")
    .in("order_item_id", (items ?? []).map((i) => i.id))
    .neq("checkin_status", "void")
    .order("entry_number", { ascending: true, nullsFirst: false });

  const qrImages = new Map<string, string>();
  for (const t of tickets ?? []) {
    qrImages.set(t.id, await QRCode.toDataURL(t.qr_token, { width: 220, margin: 1 }));
  }

  const cancelled = order.status === "cancelled";
  const unpaidOnline =
    !cancelled &&
    order.payment_status === "pending" &&
    (order.payment_method === "online" || order.settlement_method === "online");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">{stage.tk_events.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {stage.name} ／ {fmtDateTime(stage.starts_at)} 開演
          {stage.doors_open_at && ` ／ ${fmtDateTime(stage.doors_open_at)} 開場`}
        </p>
        <p className="text-sm text-neutral-400">{stage.tk_events.venue_name}</p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm">
        <p>
          {order.buyer_name} 様 ／ 合計 {yen(order.total)} ／{" "}
          <span className={order.payment_status === "paid" ? "text-emerald-400" : "text-yellow-400"}>
            {cancelled ? "キャンセル済み" : PAYMENT_STATUS_LABEL[order.payment_status]}
          </span>
        </p>
        {order.payment_status === "pending" && !cancelled && (
          <p className="mt-1 text-neutral-400">
            お支払い方法: {PAYMENT_METHOD_LABEL[order.payment_method]}
            {order.payment_method === "cash_at_door" && "(当日受付でお支払いください)"}
          </p>
        )}
        {unpaidOnline && <PayButton token={token} />}
      </div>

      {cancelled ? (
        <p className="text-neutral-400">この注文はキャンセルされました。</p>
      ) : (
        <div className="grid gap-4">
          {(tickets ?? []).map((t, idx) => {
            const seat = t.tk_seats as unknown as { row_label: string; seat_number: number } | null;
            return (
              <div key={t.id} className="rounded-lg border border-neutral-700 bg-white p-5 text-center text-neutral-900">
                <p className="text-sm font-semibold text-neutral-500">TICKET {idx + 1}</p>
                <p className="mt-1 text-lg font-bold">
                  {seat ? `${seat.row_label}列 ${seat.seat_number}番` : `自由席 整理番号 ${t.entry_number ?? "-"}`}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImages.get(t.id)} alt="チケットQRコード" className="mx-auto mt-2" />
                <p className="text-xs text-neutral-500">
                  {t.checkin_status === "checked_in" ? `✅ 入場済み (${fmtDateTime(t.checked_in_at)})` : "受付でこのQRをご提示ください"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
