import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";
import { HOME_AFTER_LOGIN, IS_REHEARSAL } from "@/lib/app";

export const dynamic = "force-dynamic";

// Supabase Auth のコールバック(Google ログイン / メール確認 / パスワード再設定)。
// PKCE の code をセッションに交換し、next へ送る。
// 稽古管理ではオンボーディング(表示名・規約同意)を経由し、チケットではロール別の振り分け(/portal)へ
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
  if (IS_REHEARSAL) return NextResponse.redirect(`${SITE_URL}/onboarding?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${SITE_URL}${next}`);
}

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : HOME_AFTER_LOGIN;
}
