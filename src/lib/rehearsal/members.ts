import "server-only";
import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MemberRow } from "./types";

// ログイン中ユーザーに紐づく稽古メンバー。未紐づけなら null
export async function getCurrentMember(): Promise<{ user: AppUser; member: MemberRow | null } | null> {
  const user = await getAppUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.from("rh_members").select("*").eq("user_id", user.userId).maybeSingle();
  return { user, member: (data as MemberRow | null) ?? null };
}

// メンバー画面用: 未ログインならログインへ
export async function requireCurrentMember(): Promise<{ user: AppUser; member: MemberRow | null }> {
  const ctx = await getCurrentMember();
  if (!ctx) redirect("/login");
  return ctx;
}

// 6桁の LINE 連携コードを発行(10分有効)
export async function issueLineLinkCode(memberId: string): Promise<string> {
  const admin = supabaseAdmin();
  for (let i = 0; i < 5; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await admin
      .from("rh_members")
      .update({ line_link_code: code, line_link_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .eq("id", memberId);
    if (!error) return code;
  }
  throw new Error("連携コードを発行できませんでした");
}
