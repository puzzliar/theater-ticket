import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/rehearsal/members";
import { googleAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Google カレンダー連携の開始(要件 5.7 方式B)。ログイン中メンバーを state に署名して Google へリダイレクト
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${SITE_URL}/me?google=not_configured`);
  const ctx = await getCurrentMember();
  if (!ctx) return NextResponse.redirect(`${SITE_URL}/login`);
  if (!ctx.member) return NextResponse.redirect(`${SITE_URL}/me?google=no_member`);
  return NextResponse.redirect(googleAuthUrl(ctx.member.id));
}
