import { NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/format";

// 精算用CSVエクスポート(要件5.12)
export async function GET(_req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") return new NextResponse("forbidden", { status: 403 });
  const { eventId } = await ctx.params;

  const admin = supabaseAdmin();
  const { data: stages } = await admin.from("tk_stages").select("id, name").eq("event_id", eventId);
  const { data: casts } = await admin.from("tk_casts").select("id, name").eq("event_id", eventId);
  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: orders } = stageIds.length
    ? await admin
        .from("tk_orders")
        .select("*, tk_order_items(qty, unit_price)")
        .in("stage_id", stageIds)
        .order("created_at")
    : { data: [] };

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["注文日時", "ステージ", "購入者", "メール", "チャネル", "扱い", "支払方法", "支払状況", "状態", "枚数", "金額"];
  const rows = (orders ?? []).map((o) => {
    const qty = (o.tk_order_items ?? []).reduce((s: number, i: { qty: number }) => s + i.qty, 0);
    return [
      o.created_at,
      (stages ?? []).find((s) => s.id === o.stage_id)?.name ?? "",
      o.buyer_name,
      o.buyer_email ?? "",
      CHANNEL_LABEL[o.channel],
      (casts ?? []).find((c) => c.id === o.cast_id)?.name ?? "一般",
      PAYMENT_METHOD_LABEL[o.payment_method],
      PAYMENT_STATUS_LABEL[o.payment_status],
      o.status === "cancelled" ? "キャンセル" : "有効",
      qty,
      o.total,
    ].map(esc).join(",");
  });
  const csv = "﻿" + [header.map(esc).join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${eventId}.csv"`,
    },
  });
}
