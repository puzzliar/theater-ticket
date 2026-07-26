import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID, HOLD_MINUTES, SITE_URL, CANCEL_FEE_RATE } from "@/lib/constants";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import type { AreaRow, OrderRow } from "@/lib/types";

export interface CartItem {
  ticketTypeId: string;
  qty: number;
  seatIds?: string[]; // 指定席のみ
}

interface ResolvedItem {
  ticketTypeId: string;
  qty: number;
  seatIds: string[];
  unitPrice: number;
  area: AreaRow;
}

export class OrderError extends Error {}

// 券種→席種→エリアを解決し、価格をサーバー側で確定する
async function resolveItems(
  admin: SupabaseClient,
  eventId: string,
  items: CartItem[],
): Promise<ResolvedItem[]> {
  if (items.length === 0) throw new OrderError("チケットが選択されていません");
  const ids = items.map((i) => i.ticketTypeId);
  const { data: types, error } = await admin
    .from("tk_ticket_types")
    .select("id, price, is_active, tk_seat_classes!inner(id, event_id, area_id, tk_areas!inner(id, event_id, name, kind, free_capacity))")
    .in("id", ids);
  if (error) throw new OrderError(error.message);

  return items.map((item) => {
    const t = (types ?? []).find((x) => x.id === item.ticketTypeId);
    if (!t || !t.is_active) throw new OrderError("無効な券種が含まれています");
    const sc = t.tk_seat_classes as unknown as { event_id: string; tk_areas: AreaRow };
    if (sc.event_id !== eventId) throw new OrderError("券種と公演が一致しません");
    const area = sc.tk_areas;
    if (area.kind === "reserved") {
      if (!item.seatIds || item.seatIds.length !== item.qty)
        throw new OrderError("指定席は座席を選択してください");
    }
    if (item.qty < 1 || item.qty > 10) throw new OrderError("枚数は1〜10枚で指定してください");
    return {
      ticketTypeId: item.ticketTypeId,
      qty: item.qty,
      seatIds: item.seatIds ?? [],
      unitPrice: t.price,
      area,
    };
  });
}

// 販売時点のギャランティルールをスナップショットとして取得
async function guaranteeSnapshot(
  admin: SupabaseClient,
  eventId: string,
  castId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!castId) return null;
  const { data } = await admin
    .from("tk_guarantee_rules")
    .select("rule_type, rate, fixed_amount, quota_threshold, quota_amount, effective_from")
    .eq("event_id", eventId)
    .eq("cast_id", castId)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// 指定席の販売済み+仮押さえ中の座席ID集合
export async function takenSeatIds(admin: SupabaseClient, stageId: string): Promise<Set<string>> {
  const now = new Date().toISOString();
  const [{ data: tickets }, { data: holds }] = await Promise.all([
    admin.from("tk_tickets").select("seat_id").eq("stage_id", stageId).neq("checkin_status", "void").not("seat_id", "is", null),
    admin.from("tk_seat_holds").select("seat_id").eq("stage_id", stageId).gt("expires_at", now).not("seat_id", "is", null),
  ]);
  const set = new Set<string>();
  for (const t of tickets ?? []) if (t.seat_id) set.add(t.seat_id);
  for (const h of holds ?? []) if (h.seat_id) set.add(h.seat_id);
  return set;
}

// 期限切れホールドの掃除(アクセス時に随時)
export async function cleanupExpiredHolds(admin: SupabaseClient): Promise<void> {
  await admin.from("tk_seat_holds").delete().lt("expires_at", new Date().toISOString());
}

// オンライン購入(一般販売): 仮押さえ + pending注文を作成
export async function createOnlineOrder(params: {
  eventId: string;
  stageId: string;
  castId: string | null; // 扱い。null=「一般」
  buyerName: string;
  buyerEmail: string;
  items: CartItem[];
  channel?: "general" | "door";
}): Promise<{ order: OrderRow; total: number }> {
  const admin = supabaseAdmin();
  await cleanupExpiredHolds(admin);

  const resolved = await resolveItems(admin, params.eventId, params.items);
  const total = resolved.reduce((s, r) => s + r.unitPrice * r.qty, 0);

  // 自由席: 現時点の在庫を事前チェック(確定はfinalize時のアトミック減算)
  for (const r of resolved) {
    if (r.area.kind === "free") {
      const { data: stock } = await admin
        .from("tk_stage_area_stock")
        .select("remaining")
        .eq("stage_id", params.stageId)
        .eq("area_id", r.area.id)
        .maybeSingle();
      if (!stock || stock.remaining < r.qty) throw new OrderError(`「${r.area.name}」は残席が不足しています`);
    }
  }

  // 注文作成(pending)
  const snapshot = await guaranteeSnapshot(admin, params.eventId, params.castId);
  const { data: order, error: orderErr } = await admin
    .from("tk_orders")
    .insert({
      org_id: ORG_ID,
      stage_id: params.stageId,
      channel: params.channel ?? "general",
      cast_id: params.castId,
      buyer_name: params.buyerName,
      buyer_email: params.buyerEmail || null,
      payment_method: "online",
      total,
    })
    .select()
    .single();
  if (orderErr) throw new OrderError(orderErr.message);

  // 指定席の仮押さえ(session_key = order.id)。一意インデックス衝突=他者が確保済み
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const holdRows = resolved.flatMap((r) =>
    r.seatIds.map((seatId) => ({
      org_id: ORG_ID,
      stage_id: params.stageId,
      seat_id: seatId,
      qty: 1,
      session_key: order.id,
      expires_at: expiresAt,
    })),
  );
  if (holdRows.length > 0) {
    const { error: holdErr } = await admin.from("tk_seat_holds").insert(holdRows);
    if (holdErr) {
      await admin.from("tk_orders").delete().eq("id", order.id);
      throw new OrderError("選択した座席は確保できませんでした。他のお客様が購入手続き中の可能性があります。座席を選び直してください。");
    }
  }

  // 明細作成
  const { error: itemErr } = await admin.from("tk_order_items").insert(
    resolved.map((r) => ({
      org_id: ORG_ID,
      order_id: order.id,
      ticket_type_id: r.ticketTypeId,
      qty: r.qty,
      unit_price: r.unitPrice,
      guarantee_snapshot: snapshot,
    })),
  );
  if (itemErr) {
    await admin.from("tk_seat_holds").delete().eq("session_key", order.id);
    await admin.from("tk_orders").delete().eq("id", order.id);
    throw new OrderError(itemErr.message);
  }

  return { order: order as OrderRow, total };
}

// 決済確定時のチケット発行(冪等)。Stripe Webhook / モック決済 / ゲスト予約から共用
export async function finalizeOrder(
  orderId: string,
  provider: "stripe" | "mock" | "cash",
  paymentIntentId?: string,
): Promise<void> {
  const admin = supabaseAdmin();

  const { data: order } = await admin.from("tk_orders").select("*").eq("id", orderId).single();
  if (!order) throw new OrderError("注文が見つかりません");
  if (order.payment_status === "paid") return; // 冪等
  if (order.status !== "active") throw new OrderError("キャンセル済みの注文です");

  const { data: items } = await admin
    .from("tk_order_items")
    .select("id, qty, unit_price, ticket_type_id, tk_ticket_types!inner(seat_class_id, tk_seat_classes!inner(area_id, tk_areas!inner(id, kind, name)))")
    .eq("order_id", orderId);

  // ゲスト予約等、予約時点で発券済みの注文は発券をスキップ(支払い記録のみ)
  const { count: existingTickets } = await admin
    .from("tk_tickets")
    .select("id", { count: "exact", head: true })
    .in("order_item_id", (items ?? []).map((i) => i.id));
  const alreadyIssued = (existingTickets ?? 0) > 0;

  const { data: holds } = await admin
    .from("tk_seat_holds")
    .select("seat_id")
    .eq("session_key", orderId)
    .not("seat_id", "is", null);
  const heldSeatIds = (holds ?? []).map((h) => h.seat_id as string);
  let seatCursor = 0;

  for (const item of alreadyIssued ? [] : (items ?? [])) {
    const tt = item.tk_ticket_types as unknown as { tk_seat_classes: { tk_areas: { id: string; kind: string; name: string } } };
    const area = tt.tk_seat_classes.tk_areas;
    if (area.kind === "reserved") {
      const seats = heldSeatIds.slice(seatCursor, seatCursor + item.qty);
      seatCursor += item.qty;
      if (seats.length !== item.qty) throw new OrderError("座席の仮押さえが失効しています。お手数ですが再度購入してください。");
      const { error } = await admin.from("tk_tickets").insert(
        seats.map((seatId) => ({
          org_id: ORG_ID,
          order_item_id: item.id,
          stage_id: order.stage_id,
          seat_id: seatId,
        })),
      );
      if (error) throw new OrderError(`座席の確定に失敗しました: ${error.message}`);
    } else {
      // 自由席: アトミック減算 + 整理番号採番(決済完了順)
      const { data: startNo, error } = await admin.rpc("tk_consume_free_stock", {
        p_stage: order.stage_id,
        p_area: area.id,
        p_qty: item.qty,
      });
      if (error) throw new OrderError(error.message);
      if (startNo === null) throw new OrderError(`「${area.name}」は完売しました`);
      const rows = Array.from({ length: item.qty }, (_, i) => ({
        org_id: ORG_ID,
        order_item_id: item.id,
        stage_id: order.stage_id,
        entry_number: (startNo as number) + i,
      }));
      const { error: insErr } = await admin.from("tk_tickets").insert(rows);
      if (insErr) throw new OrderError(insErr.message);
    }
  }

  await admin.from("tk_payments").insert({
    org_id: ORG_ID,
    order_id: orderId,
    provider,
    stripe_payment_intent_id: paymentIntentId ?? null,
    amount: order.total,
    status: "succeeded",
    received_at: new Date().toISOString(),
  });
  await admin.from("tk_orders").update({ payment_status: "paid" }).eq("id", orderId);
  await admin.from("tk_seat_holds").delete().eq("session_key", orderId);

  // 購入完了メール(RESEND設定時のみ)
  if (order.buyer_email) {
    const url = `${SITE_URL}/my/${order.manage_token}`;
    await sendEmail(
      order.buyer_email,
      "【PUZZLIAR】チケット購入が完了しました",
      `<p>${order.buyer_name} 様</p><p>チケットのご購入ありがとうございます。当日は以下のページのQRコードを受付でご提示ください。</p><p><a href="${url}">${url}</a></p>`,
    );
  }
}

// キャンセル: チケットvoid・自由席在庫復元・キャンセル記録・(可能なら)Stripe返金
export async function cancelOrder(params: {
  orderId: string;
  reason: "buyer" | "organizer" | "event_cancelled";
  actorUserId: string | null;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { data: order } = await admin.from("tk_orders").select("*").eq("id", params.orderId).single();
  if (!order) throw new OrderError("注文が見つかりません");
  if (order.status === "cancelled") return;

  // 有効チケットを取得しvoid化
  const { data: items } = await admin
    .from("tk_order_items")
    .select("id, qty, tk_ticket_types!inner(tk_seat_classes!inner(tk_areas!inner(id, kind)))")
    .eq("order_id", params.orderId);
  const { data: tickets } = await admin
    .from("tk_tickets")
    .select("id, seat_id, order_item_id")
    .in("order_item_id", (items ?? []).map((i) => i.id))
    .neq("checkin_status", "void");

  if ((tickets ?? []).length > 0) {
    await admin.from("tk_tickets").update({ checkin_status: "void" }).in("id", (tickets ?? []).map((t) => t.id));
    // 自由席分の在庫復元
    for (const item of items ?? []) {
      const tt = item.tk_ticket_types as unknown as { tk_seat_classes: { tk_areas: { id: string; kind: string } } };
      const area = tt.tk_seat_classes.tk_areas;
      if (area.kind === "free") {
        const freed = (tickets ?? []).filter((t) => t.order_item_id === item.id && !t.seat_id).length;
        if (freed > 0) {
          await admin.rpc("tk_restore_free_stock", { p_stage: order.stage_id, p_area: area.id, p_qty: freed });
        }
      }
    }
  }
  await admin.from("tk_seat_holds").delete().eq("session_key", params.orderId);

  // 返金計算(要件5.10): 購入者都合 = 5% + Stripe手数料 / 主催都合・中止 = 全額
  let feeAmount = 0;
  let refundAmount = 0;
  let stripeRefundId: string | null = null;
  if (order.payment_status === "paid") {
    feeAmount = params.reason === "buyer" ? Math.round(order.total * CANCEL_FEE_RATE) : 0;
    refundAmount = order.total - feeAmount;
    const { data: payment } = await admin
      .from("tk_payments")
      .select("stripe_payment_intent_id")
      .eq("order_id", params.orderId)
      .eq("status", "succeeded")
      .maybeSingle();
    const stripe = getStripe();
    if (stripe && payment?.stripe_payment_intent_id) {
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: refundAmount,
      });
      stripeRefundId = refund.id;
    }
  }

  await admin.from("tk_cancellations").insert({
    org_id: ORG_ID,
    order_id: params.orderId,
    reason: params.reason,
    fee_amount: feeAmount,
    refund_amount: refundAmount,
    stripe_refund_id: stripeRefundId,
    cancelled_by: params.actorUserId,
  });
  await admin
    .from("tk_orders")
    .update({
      status: "cancelled",
      payment_status: order.payment_status === "paid" ? "refunded" : "cancelled",
    })
    .eq("id", params.orderId);
  await admin.from("tk_audit_logs").insert({
    org_id: ORG_ID,
    actor_user_id: params.actorUserId,
    action: "order.cancelled",
    target_table: "tk_orders",
    target_id: params.orderId,
    detail: { reason: params.reason, refundAmount, feeAmount },
  });
}

// ステージ×自由席エリアの在庫行を保証(管理画面の作成操作から呼ぶ)
export async function ensureStockRows(eventId: string): Promise<void> {
  const admin = supabaseAdmin();
  const [{ data: stages }, { data: areas }] = await Promise.all([
    admin.from("tk_stages").select("id").eq("event_id", eventId),
    admin.from("tk_areas").select("id, free_capacity").eq("event_id", eventId).eq("kind", "free"),
  ]);
  for (const stage of stages ?? []) {
    for (const area of areas ?? []) {
      await admin.from("tk_stage_area_stock").upsert(
        {
          org_id: ORG_ID,
          stage_id: stage.id,
          area_id: area.id,
          capacity: area.free_capacity ?? 0,
          remaining: area.free_capacity ?? 0,
        },
        { onConflict: "stage_id,area_id", ignoreDuplicates: true },
      );
    }
  }
}
