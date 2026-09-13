import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lineAuthorizeUrl, lineLoginConfigured, newStateAndNonce } from "@/lib/line-login";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// LINE ログインの開始。state/nonce を httpOnly cookie に保存して LINE へリダイレクト。
// ?mode=link はログイン中アカウントへの LINE 連携(通知先の登録)
export async function GET(req: NextRequest) {
  if (!lineLoginConfigured()) return NextResponse.redirect(`${SITE_URL}/login?error=line_not_configured`);
  const next = req.nextUrl.searchParams.get("next") ?? "/me";
  const mode = req.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const { state, nonce } = newStateAndNonce();
  const store = await cookies();
  store.set("line_oauth", JSON.stringify({ state, nonce, next, mode }), { httpOnly: true, secure: SITE_URL.startsWith("https"), sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(lineAuthorizeUrl(state, nonce));
}
