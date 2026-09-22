import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";

export const dynamic = "force-dynamic";

// Web プッシュ購読の登録・解除(本人のみ)
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("rh_push_subscriptions")
    .upsert({ profile_id: me.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, user_agent: req.headers.get("user-agent") ?? "" }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) await supabaseAdmin().from("rh_push_subscriptions").delete().eq("profile_id", me.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
