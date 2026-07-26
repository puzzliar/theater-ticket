import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finalizeOrder } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/constants";

// 未決済注文(ゲスト予約のオンライン決済など)の支払い開始。manage_token で本人特定
export async function POST(req: NextRequest) {
  const { token } = (await req.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: order } = await admin.from("tk_orders").select("*").eq("manage_token", token).maybeSingle();
  if (!order || order.status !== "active") return NextResponse.json({ error: "注文が見つかりません" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ url: `${SITE_URL}/my/${token}` });

  const stripe = getStripe();
  if (!stripe) {
    await finalizeOrder(order.id, "mock");
    return NextResponse.json({ url: `${SITE_URL}/my/${token}?paid=1` });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.buyer_email ?? undefined,
    line_items: [
      {
        price_data: { currency: "jpy", product_data: { name: "公演チケット" }, unit_amount: order.total },
        quantity: 1,
      },
    ],
    metadata: { order_id: order.id },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${SITE_URL}/my/${token}?paid=1`,
    cancel_url: `${SITE_URL}/my/${token}`,
  });
  return NextResponse.json({ url: session.url });
}
