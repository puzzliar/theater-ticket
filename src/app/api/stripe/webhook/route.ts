import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finalizeOrder } from "@/lib/orders";

// Stripe Webhook: checkout.session.completed で注文を確定する。
// tk_stripe_webhook_events への INSERT 一意制約で二重処理を防止(冪等)。
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature!, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error: dupErr } = await admin.from("tk_stripe_webhook_events").insert({ event_id: event.id });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true }); // 処理済み

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId) {
      try {
        await finalizeOrder(orderId, "stripe", (session.payment_intent as string) ?? undefined);
      } catch (e) {
        console.error("finalize failed", orderId, e);
        // 処理失敗を記録から外してStripeにリトライさせる
        await admin.from("tk_stripe_webhook_events").delete().eq("event_id", event.id);
        return NextResponse.json({ error: "finalize failed" }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ received: true });
}
