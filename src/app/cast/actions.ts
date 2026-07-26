"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cancelOrder } from "@/lib/orders";

// キャスト自身によるゲスト予約キャンセル(要件5.7: キャストからキャンセル可能)
export async function castCancelReservation(orderId: string) {
  const user = await requireRole("cast");
  const admin = supabaseAdmin();
  const { data: order } = await admin
    .from("tk_orders")
    .select("id, cast_id, channel")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.channel !== "guest" || !order.cast_id || !user.castIds.includes(order.cast_id)) {
    throw new Error("この予約をキャンセルする権限がありません");
  }
  await cancelOrder({ orderId, reason: "organizer", actorUserId: user.userId });
  revalidatePath("/cast");
}
