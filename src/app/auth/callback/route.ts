import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Supabase Auth のコールバック(Google ログイン / メール確認 / パスワード再設定)。
// PKCE の code をセッションに交換し、next へ送る。オンボーディング未完了なら /onboarding が拾う
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!code) return NextResponse.redirect(`${SITE_URL}/login?error=auth`);
  const supa = await supabaseServer();
  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth callback failed", error.message);
    return NextResponse.redirect(`${SITE_URL}/login?error=auth`);
  }
  return NextResponse.redirect(`${SITE_URL}/onboarding?next=${encodeURIComponent(next)}`);
}

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/me";
}
