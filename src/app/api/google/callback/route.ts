import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { encryptToken, exchangeCode, googleConfigured, verifyState } from "@/lib/google-calendar";
import { getSettings } from "@/lib/rehearsal/profile";
import { importBusyAsUnavailable, syncProfileUpcoming } from "@/lib/rehearsal/google-sync";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Google OAuth コールバック。state の署名とログイン中プロフィールの一致を確認してからトークンを保存する
export async function GET(req: NextRequest) {
  const back = `${SITE_URL}/me/settings`;
  if (!googleConfigured()) return NextResponse.redirect(`${back}?google=not_configured`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (req.nextUrl.searchParams.get("error") || !code) return NextResponse.redirect(`${back}?google=denied`);

  const profileId = verifyState(state);
  const me = await getSessionUser();
  if (!profileId || !me || me.id !== profileId) return NextResponse.redirect(`${back}?google=state_mismatch`);

  try {
    const { refreshToken, email } = await exchangeCode(code);
    await getSettings(me.id);
    const { error } = await supabaseAdmin()
      .from("core_identities")
      .upsert(
        { profile_id: me.id, provider: "google_calendar", provider_uid: email ?? me.id, email, secret_enc: encryptToken(refreshToken), connected_at: new Date().toISOString() },
        { onConflict: "profile_id,provider" },
      );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("google connect failed", e);
    return NextResponse.redirect(`${back}?google=error`);
  }
  await syncProfileUpcoming(me.id);
  await importBusyAsUnavailable(me.id);
  return NextResponse.redirect(`${back}?google=connected`);
}
