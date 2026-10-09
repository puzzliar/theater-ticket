"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { isMode, MODE_COOKIE, modeHome } from "@/lib/core/mode";

// 出演者/主催者モードの切り替え。next を渡すと同じ画面に留まる(座組ページなど)
export async function switchMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "");
  if (!isMode(mode)) throw new Error("モードが不正です");
  const next = String(formData.get("next") ?? "");
  const me = await getSessionUser();
  if (!me) redirect("/login");
  (await cookies()).set(MODE_COOKIE, mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  await supabaseAdmin().from("core_profiles").update({ active_mode: mode, updated_at: new Date().toISOString() }).eq("id", me.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : modeHome(mode));
}
