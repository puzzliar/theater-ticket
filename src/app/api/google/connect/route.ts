import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/core/session";
import { googleAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Google カレンダー連携の開始(要件 5.7 方式B)。ログイン中プロフィールを state に署名して Google へ
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${SITE_URL}/me/settings?google=not_configured`);
  const me = await getSessionUser();
  if (!me) return NextResponse.redirect(`${SITE_URL}/login?next=${encodeURIComponent("/me/settings")}`);
  return NextResponse.redirect(googleAuthUrl(me.id));
}
