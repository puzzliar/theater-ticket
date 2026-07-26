"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";

// チェックイン(受付スタッフ/管理者)
export async function checkinTicket(ticketId: string, stageId: string) {
  const user = await requireRole("staff", "admin");
  const admin = supabaseAdmin();
  const { data: ticket } = await admin.from("tk_tickets").select("id, checkin_status").eq("id", ticketId).maybeSingle();
  if (!ticket) throw new Error("チケットが見つかりません");
  if (ticket.checkin_status === "void") throw new Error("無効化されたチケットです");
  if (ticket.checkin_status === "checked_in") return; // 冪等
  await admin
    .from("tk_tickets")
    .update({ checkin_status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: user.userId })
    .eq("id", ticketId);
  revalidatePath(`/reception/s/${stageId}`);
}

export async function undoCheckin(ticketId: string, stageId: string) {
  await requireRole("staff", "admin");
  const admin = supabaseAdmin();
  await admin
    .from("tk_tickets")
    .update({ checkin_status: "not_checked_in", checked_in_at: null, checked_in_by: null })
    .eq("id", ticketId)
    .eq("checkin_status", "checked_in");
  revalidatePath(`/reception/s/${stageId}`);
}

// 当日現金の収受記録(要件5.8)
export async function receiveCash(orderId: string, stageId: string) {
  const user = await requireRole("staff", "admin");
  const admin = supabaseAdmin();
  const { data: order } = await admin.from("tk_orders").select("id, total, payment_status, status").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "active") throw new Error("注文が見つかりません");
  if (order.payment_status === "paid") return; // 冪等
  await admin.from("tk_payments").insert({
    org_id: ORG_ID,
    order_id: orderId,
    provider: "cash",
    amount: order.total,
    status: "succeeded",
    received_by: user.userId,
    received_at: new Date().toISOString(),
  });
  await admin.from("tk_orders").update({ payment_status: "paid" }).eq("id", orderId);
  await admin.from("tk_audit_logs").insert({
    org_id: ORG_ID,
    actor_user_id: user.userId,
    action: "payment.cash_received",
    target_table: "tk_orders",
    target_id: orderId,
    detail: { amount: order.total },
  });
  revalidatePath(`/reception/s/${stageId}`);
}
