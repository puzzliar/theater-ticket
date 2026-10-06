"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { PRIVACY_VERSION, TERMS_VERSION, type Part } from "@/lib/core/types";
import { getSettings } from "@/lib/rehearsal/profile";

export async function completeOnboarding(next: string, formData: FormData) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const part = String(formData.get("default_part") ?? "cast") as Part;
  if (!displayName) throw new Error("表示名を入力してください");
  if (formData.get("terms") !== "on" || formData.get("sharing") !== "on") throw new Error("利用規約・プライバシーポリシーと空き時間の共有への同意が必要です");
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  await admin.from("core_profiles").update({ display_name: displayName, default_part: part, onboarded_at: me.profile.onboarded_at ?? now, updated_at: now }).eq("id", me.id);
  await admin.from("core_consents").insert([
    { profile_id: me.id, kind: "terms", version: TERMS_VERSION, granted: true },
    { profile_id: me.id, kind: "privacy", version: PRIVACY_VERSION, granted: true },
    { profile_id: me.id, kind: "availability_sharing", version: TERMS_VERSION, granted: true },
    { profile_id: me.id, kind: "marketing", version: TERMS_VERSION, granted: formData.get("marketing") === "on" },
  ]);
  await getSettings(me.id);
  // 参加者レコードの表示名も追従(本人紐づけ済み分)
  await admin.from("rh_participants").update({ display_name: displayName }).eq("profile_id", me.id);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/me");
}
