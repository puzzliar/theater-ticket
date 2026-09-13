import "server-only";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRole, type OrganizationRow, type OrgMemberRow, type OrgRole, type Part, type ProfileRow } from "./types";

// ログインセッションと共通プロフィール・組織コンテキストの解決。
// プロフィールは service role で読む(RLS の自己参照ポリシーでも読めるが、未作成時の自動作成を兼ねる)。

export interface SessionUser {
  id: string;
  email: string | null;
  profile: ProfileRow;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  let { data: profile } = await admin.from("core_profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const { data: created } = await admin
      .from("core_profiles")
      .upsert({ id: user.id, display_name: meta.full_name ?? meta.name ?? (user.email ?? "").split("@")[0], email: user.email ?? null }, { onConflict: "id" })
      .select("*")
      .single();
    profile = created;
  }
  if (!profile || profile.deleted_at) return null;
  return { id: user.id, email: user.email ?? null, profile: profile as ProfileRow };
}

// 未ログインならログインへ。オンボーディング未完了ならオンボーディングへ
export async function requireSessionUser(next?: string, opts: { allowNotOnboarded?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!opts.allowNotOnboarded && !user.profile.onboarded_at) redirect(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export interface MyOrg {
  org: OrganizationRow;
  role: OrgRole;
  part: Part;
}

export async function listMyOrgs(profileId: string): Promise<MyOrg[]> {
  const { data } = await supabaseAdmin()
    .from("core_org_members")
    .select("role, part, core_organizations!inner(*)")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .eq("core_organizations.status", "active");
  return ((data ?? []) as unknown as { role: OrgRole; part: Part; core_organizations: OrganizationRow }[])
    .map((r) => ({ org: r.core_organizations, role: r.role, part: r.part }))
    .sort((a, b) => a.org.name.localeCompare(b.org.name, "ja"));
}

export interface OrgContext {
  user: SessionUser;
  org: OrganizationRow;
  membership: OrgMemberRow;
  isAdmin: boolean;
}

// 組織スコープの画面・アクション用。level=admin は owner/admin のみ
export async function requireOrg(slug: string, level: "member" | "admin" = "member"): Promise<OrgContext> {
  const user = await requireSessionUser(`/o/${slug}`);
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("core_organizations").select("*").eq("slug", slug).maybeSingle();
  if (!org) notFound();
  const { data: membership } = await admin
    .from("core_org_members")
    .select("*")
    .eq("org_id", org.id)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) notFound();
  const isAdmin = isAdminRole(membership.role);
  if (level === "admin" && !isAdmin) redirect(`/o/${slug}?denied=1`);
  return { user, org: org as OrganizationRow, membership: membership as OrgMemberRow, isAdmin };
}

// Server Action 用(redirect ではなく例外)
export async function requireOrgById(orgId: string, level: "member" | "admin" = "member"): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) throw new Error("ログインが必要です");
  const admin = supabaseAdmin();
  const [{ data: org }, { data: membership }] = await Promise.all([
    admin.from("core_organizations").select("*").eq("id", orgId).maybeSingle(),
    admin.from("core_org_members").select("*").eq("org_id", orgId).eq("profile_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  if (!org || !membership) throw new Error("この組織へのアクセス権がありません");
  const isAdmin = isAdminRole(membership.role);
  if (level === "admin" && !isAdmin) throw new Error("管理者権限が必要です");
  return { user, org: org as OrganizationRow, membership: membership as OrgMemberRow, isAdmin };
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser("/platform");
  if (!user.profile.is_platform_admin) notFound();
  return user;
}

export async function audit(action: string, params: { orgId?: string | null; actorProfileId?: string | null; target?: string; detail?: Record<string, unknown> }): Promise<void> {
  await supabaseAdmin().from("core_audit_logs").insert({
    org_id: params.orgId ?? null,
    actor_profile_id: params.actorProfileId ?? null,
    action,
    target: params.target ?? null,
    detail: params.detail ?? null,
  });
}
