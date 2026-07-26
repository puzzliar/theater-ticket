import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID, SITE_URL } from "@/lib/constants";
import { allocateContiguous } from "@/lib/seating";
import { takenSeatIds, cleanupExpiredHolds, OrderError } from "@/lib/orders";
import { sendEmail } from "@/lib/email";

// キャストによるゲスト予約起票(要件5.7)。起票で即確定・座席は自動割当。
// 連番席が取れない場合は needsSplit を返し、acceptSplit=true での再送(離れ席了承)を待つ。
export async function POST(req: NextRequest) {
  const user = await getAppUser();
  if (!user || user.role !== "cast") {
    return NextResponse.json({ error: "キャストのみ操作できます" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as {
      stageId: string;
      seatClassId: string;
      qty: number;
      guestName: string;
      guestEmail?: string;
      paymentMethod: "online" | "cash_at_door" | "cast_paid";
      settlementMethod?: "online" | "cash_at_door" | "cash_with_organizer";
      acceptSplit?: boolean;
      note?: string;
    };
    const qty = Number(body.qty);
    if (!body.stageId || !body.seatClassId || !body.guestName?.trim() || qty < 1 || qty > 10) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }
    if (body.paymentMethod === "online" && !/.+@.+\..+/.test(body.guestEmail ?? "")) {
      return NextResponse.json({ error: "オンライン決済にはゲストのメールアドレスが必要です" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    await cleanupExpiredHolds(admin);

    // 席種→エリア・公演を解決し、本人のキャストであることを確認
    const { data: sc } = await admin
      .from("tk_seat_classes")
      .select("id, event_id, area_id, price, name, tk_areas!inner(id, kind, name)")
      .eq("id", body.seatClassId)
      .maybeSingle();
    if (!sc) return NextResponse.json({ error: "席種が見つかりません" }, { status: 404 });
    const { data: myCast } = await admin
      .from("tk_casts")
      .select("id, name")
      .eq("event_id", sc.event_id)
      .eq("user_id", user.userId)
      .maybeSingle();
    if (!myCast) return NextResponse.json({ error: "この公演のキャストとして登録されていません" }, { status: 403 });

    const { data: stage } = await admin
      .from("tk_stages")
      .select("id, event_id, name, starts_at")
      .eq("id", body.stageId)
      .eq("event_id", sc.event_id)
      .maybeSingle();
    if (!stage) return NextResponse.json({ error: "ステージが見つかりません" }, { status: 404 });

    const { data: tt } = await admin
      .from("tk_ticket_types")
      .select("id, price")
      .eq("seat_class_id", sc.id)
      .eq("is_active", true)
      .contains("sales_channel", ["guest"])
      .limit(1)
      .maybeSingle();
    if (!tt) return NextResponse.json({ error: "ゲスト予約可能な券種がありません" }, { status: 400 });

    const area = sc.tk_areas as unknown as { id: string; kind: string; name: string };
    let seatIds: string[] = [];
    if (area.kind === "reserved") {
      const { data: seats } = await admin.from("tk_seats").select("*").eq("area_id", area.id).eq("is_active", true);
      const taken = await takenSeatIds(admin, body.stageId);
      const allocation = allocateContiguous(seats ?? [], taken, qty);
      if (!allocation) return NextResponse.json({ error: "空席が不足しています" }, { status: 409 });
      if (!allocation.contiguous && !body.acceptSplit) {
        // 離れ席の了承確認(要件5.7): 断念するか離れ席で予約するかをキャストに確認
        return NextResponse.json({ needsSplit: true });
      }
      seatIds = allocation.seatIds;
    }

    // 注文作成
    const { data: rule } = await admin
      .from("tk_guarantee_rules")
      .select("rule_type, rate, fixed_amount, quota_threshold, quota_amount, effective_from")
      .eq("event_id", sc.event_id)
      .eq("cast_id", myCast.id)
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    const total = tt.price * qty;
    const { data: order, error: orderErr } = await admin
      .from("tk_orders")
      .insert({
        org_id: ORG_ID,
        stage_id: body.stageId,
        channel: "guest",
        cast_id: myCast.id,
        buyer_name: body.guestName.trim(),
        buyer_email: body.guestEmail?.trim() || null,
        payment_method: body.paymentMethod,
        settlement_method: body.paymentMethod === "cast_paid" ? (body.settlementMethod ?? "cash_with_organizer") : null,
        total,
      })
      .select()
      .single();
    if (orderErr) throw new OrderError(orderErr.message);

    const { data: item, error: itemErr } = await admin
      .from("tk_order_items")
      .insert({
        org_id: ORG_ID,
        order_id: order.id,
        ticket_type_id: tt.id,
        qty,
        unit_price: tt.price,
        guarantee_snapshot: rule ?? null,
      })
      .select()
      .single();
    if (itemErr) throw new OrderError(itemErr.message);

    // 予約時点で発券(座席確保)。一意インデックス衝突時は競合→やり直し
    if (area.kind === "reserved") {
      const { error: tErr } = await admin.from("tk_tickets").insert(
        seatIds.map((seatId) => ({
          org_id: ORG_ID,
          order_item_id: item.id,
          stage_id: body.stageId,
          seat_id: seatId,
          holder_name: body.guestName.trim(),
        })),
      );
      if (tErr) {
        await admin.from("tk_orders").delete().eq("id", order.id);
        return NextResponse.json({ error: "座席の確保に競合が発生しました。もう一度お試しください。" }, { status: 409 });
      }
    } else {
      const { data: startNo, error: rpcErr } = await admin.rpc("tk_consume_free_stock", {
        p_stage: body.stageId,
        p_area: area.id,
        p_qty: qty,
      });
      if (rpcErr || startNo === null) {
        await admin.from("tk_orders").delete().eq("id", order.id);
        return NextResponse.json({ error: "自由席の残数が不足しています" }, { status: 409 });
      }
      await admin.from("tk_tickets").insert(
        Array.from({ length: qty }, (_, i) => ({
          org_id: ORG_ID,
          order_item_id: item.id,
          stage_id: body.stageId,
          entry_number: (startNo as number) + i,
          holder_name: body.guestName.trim(),
        })),
      );
    }

    await admin.from("tk_guest_reservations").insert({
      order_id: order.id,
      org_id: ORG_ID,
      cast_id: myCast.id,
      guest_name: body.guestName.trim(),
      seat_assignment: area.kind === "reserved" && body.acceptSplit ? "split_confirmed" : "auto",
      note: body.note ?? "",
    });
    await admin.from("tk_audit_logs").insert({
      org_id: ORG_ID,
      actor_user_id: user.userId,
      action: "guest_reservation.created",
      target_table: "tk_orders",
      target_id: order.id,
      detail: { qty, paymentMethod: body.paymentMethod },
    });

    const ticketUrl = `${SITE_URL}/my/${order.manage_token}`;
    // オンライン決済: ゲストに決済リンクをメール送付(RESEND設定時)
    if (body.paymentMethod === "online" && order.buyer_email) {
      await sendEmail(
        order.buyer_email,
        `【PUZZLIAR】${myCast.name}さんからのご予約のご案内`,
        `<p>${body.guestName} 様</p><p>${myCast.name} さんからチケットのご予約をお預かりしています。以下のページからお支払いをお願いします。</p><p><a href="${ticketUrl}">${ticketUrl}</a></p>`,
      );
    }
    return NextResponse.json({ ok: true, ticketUrl });
  } catch (e) {
    const message = e instanceof OrderError ? e.message : "エラーが発生しました";
    if (!(e instanceof OrderError)) console.error(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
