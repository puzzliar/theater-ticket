import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/rehearsal/members";
import { encryptToken, exchangeCode, googleConfigured, verifyState } from "@/lib/google-calendar";
import { importBusyAsUnavailable, syncMemberUpcoming } from "@/lib/rehearsal/google-sync";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Google OAuth コールバック。state の署名とログイン中メンバーの一致を確認してからトークンを保存する
export async function GET(req: NextRequest) {
  const me = `${SITE_URL}/me`;
  if (!googleConfigured()) return NextResponse.redirect(`${me}?google=not_configured`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (req.nextUrl.searchParams.get("error") || !code) return NextResponse.redirect(`${me}?google=denied`);

  const memberId = verifyState(state);
  const ctx = await getCurrentMember();
  if (!memberId || !ctx?.member || ctx.member.id !== memberId) return NextResponse.redirect(`${me}?google=state_mismatch`);

  try {
    const { refreshToken, email } = await exchangeCode(code);
    const { error } = await supabaseAdmin()
      .from("rh_members")
      .update({
        google_refresh_token_enc: encryptToken(refreshToken),
        google_email: email,
        google_connected_at: new Date().toISOString(),
      })
      .eq("id", memberId);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("google connect failed", e);
    return NextResponse.redirect(`${me}?google=error`);
  }

  // 連携直後: 今後の召集をカレンダーへ、カレンダーの予定を「不可」へ
  await syncMemberUpcoming(memberId);
  await importBusyAsUnavailable(memberId);
  return NextResponse.redirect(`${me}?google=connected`);
}
