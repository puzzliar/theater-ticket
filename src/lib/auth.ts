import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export interface AppUser {
  userId: string;
  email: string | null;
  role: Role;
  displayName: string;
  castIds: string[]; // role=cast のとき、本人に紐づく tk_casts.id 一覧
}

// ログイン中ユーザーとアプリロールを取得。未ログイン/未登録は null
export async function getAppUser(): Promise<AppUser | null> {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null;

  const admin = supabaseAdmin();
  const { data: appUser } = await admin
    .from("tk_app_users")
    .select("role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!appUser) return null;

  let castIds: string[] = [];
  if (appUser.role === "cast") {
    const { data: casts } = await admin
      .from("tk_casts")
      .select("id")
      .eq("user_id", user.id);
    castIds = (casts ?? []).map((c) => c.id);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: appUser.role as Role,
    displayName: appUser.display_name,
    castIds,
  };
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await getAppUser();
  if (!user || !roles.includes(user.role)) {
    throw new Error("権限がありません");
  }
  return user;
}
