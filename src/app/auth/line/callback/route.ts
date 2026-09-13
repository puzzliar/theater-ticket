import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exchangeLineCode, lineLoginConfigured, syntheticLineEmail } from "@/lib/line-login";
import { getSessionUser } from "@/lib/core/session";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// LINE ログインのコールバック。
//  login: LINE の sub に紐づくアカウントがあればそれで、なければ新規作成してログイン
//  link : ログイン中のアカウントに LINE を連携(通知先として使う)
// Supabase セッションは admin.generateLink(magiclink) の token_hash を verifyOtp することで発行する(docs/account-platform.md A1)
export async function GET(req: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(`${SITE_URL}/login?error=${code}`);
  if (!lineLoginConfigured()) return fail("line_not_configured");
  const store = await cookies();
  const raw = store.get("line_oauth")?.value;
  store.delete("line_oauth");
  if (!raw) return fail("line_state");
  const saved = JSON.parse(raw) as { state: string; nonce: string; next: string; mode: "login" | "link" };
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || state !== saved.state) return fail("line_state");
  const next = saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/me";

  let line;
  try {
    line = await exchangeLineCode(code, saved.nonce);
  } catch (e) {
    console.error("line login failed", e);
    return fail("line");
  }
  const admin = supabaseAdmin();
  const { data: identity } = await admin.from("core_identities").select("profile_id").eq("provider", "line").eq("provider_uid", line.sub).maybeSingle();

  if (saved.mode === "link") {
    const me = await getSessionUser();
    if (!me) return fail("login_required");
    if (identity && identity.profile_id !== me.id) return NextResponse.redirect(`${SITE_URL}/me/settings?line=taken`);
    await admin
      .from("core_identities")
      .upsert({ profile_id: me.id, provider: "line", provider_uid: line.sub, email: line.email, display_name: line.name, meta: { picture: line.picture } }, { onConflict: "profile_id,provider" });
    return NextResponse.redirect(`${SITE_URL}/me/settings?line=linked`);
  }

  // login
  let userId: string;
  let email: string;
  if (identity) {
    userId = identity.profile_id;
    const { data: u } = await admin.auth.admin.getUserById(userId);
    if (!u.user?.email) return fail("line");
    email = u.user.email;
  } else {
    // 新規: LINE のメールが未使用ならそれを、そうでなければ代替アドレスで作成
    email = line.email ?? syntheticLineEmail(line.sub);
    if (line.email) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (list?.users.some((u) => u.email?.toLowerCase() === line.email!.toLowerCase())) email = syntheticLineEmail(line.sub);
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: line.name ?? "", avatar_url: line.picture ?? undefined, line_sub: line.sub },
    });
    if (error || !created.user) {
      console.error("line user create failed", error?.message);
      return fail("line");
    }
    userId = created.user.id;
    await admin.from("core_profiles").upsert({ id: userId, display_name: line.name ?? "", email: email.endsWith("@line.puzzliar.jp") ? null : email }, { onConflict: "id" });
    await admin.from("core_identities").insert({ profile_id: userId, provider: "line", provider_uid: line.sub, email: line.email, display_name: line.name, meta: { picture: line.picture } });
  }

  // セッション発行
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !linkData.properties?.hashed_token) {
    console.error("generateLink failed", linkErr?.message);
    return fail("line");
  }
  const supa = await supabaseServer();
  const { error: otpErr } = await supa.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: "magiclink" });
  if (otpErr) {
    console.error("verifyOtp failed", otpErr.message);
    return fail("line");
  }
  return NextResponse.redirect(`${SITE_URL}/onboarding?next=${encodeURIComponent(next)}`);
}
