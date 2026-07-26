import { NextRequest, NextResponse } from "next/server";
import { createOnlineOrder, finalizeOrder, OrderError, type CartItem } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, stageId, castId, buyerName, buyerEmail, items } = body as {
      eventId: string;
      stageId: string;
      castId: string | null;
      buyerName: string;
      buyerEmail: string;
      items: CartItem[];
    };
    if (!eventId || !stageId || !buyerName || !buyerEmail || !Array.isArray(items)) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }

    const { order, total } = await createOnlineOrder({
      eventId,
      stageId,
      castId,
      buyerName,
      buyerEmail,
      items,
    });

    const stripe = getStripe();
    if (!stripe) {
      // モック決済モード(Stripe未設定): 即時確定。本番公開前の動作確認用
      await finalizeOrder(order.id, "mock");
      return NextResponse.json({ url: `${SITE_URL}/order/complete?token=${order.manage_token}&mock=1` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: "公演チケット" },
            unit_amount: total,
          },
          quantity: 1,
        },
      ],
      metadata: { order_id: order.id },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${SITE_URL}/order/complete?token=${order.manage_token}`,
      cancel_url: `${SITE_URL}/e/${eventId}/s/${stageId}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof OrderError ? e.message : "エラーが発生しました";
    if (!(e instanceof OrderError)) console.error(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
