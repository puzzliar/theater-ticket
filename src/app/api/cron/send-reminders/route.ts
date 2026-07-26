import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { SITE_URL, ORG_ID } from "@/lib/constants";

// 開演1時間前のQRメール送付(要件5.4)。Vercel Cronから10分おきに実行。
// 対象: 開演55〜75分前のステージの支払済み注文(送付済みはaudit_logで冪等化)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const from = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 75 * 60 * 1000).toISOString();
  const { data: stages } = await admin
    .from("tk_stages")
    .select("id, name, starts_at, tk_events(name, venue_name)")
    .gte("starts_at", from)
    .lte("starts_at", to);

  let sent = 0;
  for (const stage of stages ?? []) {
    const ev = stage.tk_events as unknown as { name: string; venue_name: string };
    const { data: orders } = await admin
      .from("tk_orders")
      .select("id, buyer_name, buyer_email, manage_token")
      .eq("stage_id", stage.id)
      .eq("status", "active")
      .in("payment_status", ["paid", "pending"])
      .not("buyer_email", "is", null);
    for (const order of orders ?? []) {
      const { data: already } = await admin
        .from("tk_audit_logs")
        .select("id")
        .eq("action", "reminder.sent")
        .eq("target_id", order.id)
        .limit(1);
      if ((already ?? []).length > 0) continue;
      const url = `${SITE_URL}/my/${order.manage_token}`;
      const ok = await sendEmail(
        order.buyer_email!,
        `【PUZZLIAR】まもなく開演です — ${ev.name}`,
        `<p>${order.buyer_name} 様</p><p>「${ev.name}」(${stage.name})はまもなく開演です。受付では以下のページのQRコードをご提示ください。</p><p><a href="${url}">${url}</a></p><p>会場: ${ev.venue_name}</p>`,
      );
      if (ok) {
        sent++;
        await admin.from("tk_audit_logs").insert({
          org_id: ORG_ID,
          actor_user_id: null,
          action: "reminder.sent",
          target_table: "tk_orders",
          target_id: order.id,
          detail: { stage_id: stage.id },
        });
      }
    }
  }
  return NextResponse.json({ sent });
}
