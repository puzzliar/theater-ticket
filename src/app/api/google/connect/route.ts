import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/core/session";
import { isMode } from "@/lib/core/mode";
import { googleAuthUrl, googleConfigured } from "@/lib/google-calendar";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Google カレンダー連携の開始(要件 5.7 方式B)。?mode=cast|organizer でどちらの用途の連携かを state に含める。
// Google 側ではアカウント選択を必ず出すので、主催者用に別の Google アカウントを選べる
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(`${SITE_URL}/me/settings?google=not_configured`);
  const me = await getSessionUser();
  if (!me) return NextResponse.redirect(`${SITE_URL}/login?next=${encodeURIComponent("/me/settings")}`);
  const m = req.nextUrl.searchParams.get("mode");
  const mode = isMode(m) ? m : "cast";
  return NextResponse.redirect(googleAuthUrl(`${me.id}|${mode}`));
}
