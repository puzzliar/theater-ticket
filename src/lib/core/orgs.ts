import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureParticipant } from "@/lib/rehearsal/profile";
import { audit } from "./session";
import type { InvitationRow, OrganizationRow, OrgRole, Part, ProfileRow } from "./types";

// 組織の作成・招待・所属の業務ロジック(docs/account-platform.md)

export class OrgError extends Error {}

export const MAX_ORGS_PER_PROFILE = 10;
export const INVITATION_DEFAULT_DAYS = 14;

export function organizerCodeRequired(): boolean {
  // 招待制(β)。一般公開時は ORG_CREATION_OPEN=true にする
  return process.env.ORG_CREATION_OPEN !== "true";
}

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);
}

export function randomSlug(): string {
  return `org-${Math.random().toString(36).slice(2, 8)}`;
}

// 組織作成。招待制の間は主催者コードが必要
export async function createOrganization(
  profile: ProfileRow,
  input: { name: string; slug: string; kind: OrganizationRow["kind"]; region: string; code: string },
): Promise<OrganizationRow> {
  const admin = supabaseAdmin();
  if (!input.name.trim()) throw new OrgError("組織名を入力してください");
  const slug = normalizeSlug(input.slug) || randomSlug();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) throw new OrgError("URL 名は英小文字・数字・ハイフンで 2〜31 文字にしてください");

  const { count } = await admin.from("core_organizations").select("id", { count: "exact", head: true }).eq("created_by", profile.id);
  if ((count ?? 0) >= MAX_ORGS_PER_PROFILE) throw new OrgError("作成できる組織数の上限に達しています");

  if (organizerCodeRequired() && !profile.is_platform_admin) {
    const code = input.code.trim();
    if (!code) throw new OrgError("現在は招待制です。運営から受け取った主催者コードを入力してください");
    const { data: oc } = await admin.from("core_organizer_codes").select("*").eq("code", code).maybeSingle();
    if (!oc || oc.used_count >= oc.max_uses || (oc.expires_at && new Date(oc.expires_at).getTime() < Date.now())) {
      throw new OrgError("主催者コードが無効か、使用回数・期限を超えています");
    }
    const { data: consumed } = await admin
      .from("core_organizer_codes")
      .update({ used_count: oc.used_count + 1 })
      .eq("code", code)
      .eq("used_count", oc.used_count)
      .select("code")
      .maybeSingle();
    if (!consumed) throw new OrgError("主催者コードの消費に失敗しました。もう一度お試しください");
  }

  const { data: org, error } = await admin
    .from("core_organizations")
    .insert({ slug, name: input.name.trim(), kind: input.kind, region: input.region.trim() || null, created_by: profile.id })
    .select("*")
    .single();
  if (error) throw new OrgError(error.code === "23505" ? "その URL 名は既に使われています" : error.message);
  await admin.from("core_org_members").insert({ org_id: org.id, profile_id: profile.id, role: "owner", part: "organizer" });
  await ensureParticipant(org.id, profile.id, profile.display_name, "organizer");
  await audit("org.create", { orgId: org.id, actorProfileId: profile.id, detail: { slug } });
  return org as OrganizationRow;
}

export async function createInvitation(
  orgId: string,
  actorProfileId: string,
  input: { role: "admin" | "member"; part: Part | null; label: string; maxUses: number | null; days: number },
): Promise<InvitationRow> {
  const { data, error } = await supabaseAdmin()
    .from("core_invitations")
    .insert({
      org_id: orgId,
      role: input.role,
      part: input.part,
      label: input.label,
      max_uses: input.maxUses,
      expires_at: new Date(Date.now() + Math.max(1, input.days) * 24 * 3600 * 1000).toISOString(),
      created_by: actorProfileId,
    })
    .select("*")
    .single();
  if (error) throw new OrgError(error.message);
  await audit("invitation.create", { orgId, actorProfileId, target: data.id, detail: { role: input.role } });
  return data as InvitationRow;
}

export async function getInvitation(token: string): Promise<(InvitationRow & { org: OrganizationRow }) | null> {
  const { data } = await supabaseAdmin().from("core_invitations").select("*, core_organizations(*)").eq("token", token).maybeSingle();
  if (!data) return null;
  const { core_organizations, ...inv } = data as InvitationRow & { core_organizations: OrganizationRow };
  return { ...inv, org: core_organizations };
}

export function invitationUsable(inv: InvitationRow): { ok: boolean; reason?: string } {
  if (inv.revoked_at) return { ok: false, reason: "この招待は無効化されています" };
  if (new Date(inv.expires_at).getTime() < Date.now()) return { ok: false, reason: "この招待は期限切れです" };
  if (inv.max_uses !== null && inv.used_count >= inv.max_uses) return { ok: false, reason: "この招待は使用回数の上限に達しています" };
  return { ok: true };
}

// 招待の受諾: 所属を作り、参加者レコードを用意する
export async function acceptInvitation(token: string, profile: ProfileRow, part: Part): Promise<OrganizationRow> {
  const admin = supabaseAdmin();
  const inv = await getInvitation(token);
  if (!inv) throw new OrgError("招待が見つかりません");
  const usable = invitationUsable(inv);
  if (!usable.ok) throw new OrgError(usable.reason!);
  if (inv.org.status !== "active") throw new OrgError("この組織は現在利用できません");

  const { data: existing } = await admin.from("core_org_members").select("*").eq("org_id", inv.org_id).eq("profile_id", profile.id).maybeSingle();
  if (existing?.status === "active") return inv.org; // 既に所属
  const role: OrgRole = existing?.role === "owner" ? "owner" : inv.role;
  const { error } = await admin
    .from("core_org_members")
    .upsert({ org_id: inv.org_id, profile_id: profile.id, role, part, status: "active", joined_at: new Date().toISOString() }, { onConflict: "org_id,profile_id" });
  if (error) throw new OrgError(error.message);
  await admin.from("core_invitations").update({ used_count: inv.used_count + 1 }).eq("id", inv.id);
  await ensureParticipant(inv.org_id, profile.id, profile.display_name, part);
  await audit("member.join", { orgId: inv.org_id, actorProfileId: profile.id, target: inv.id, detail: { role, part } });
  return inv.org;
}

export async function leaveOrganization(orgId: string, profileId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: me } = await admin.from("core_org_members").select("role").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  if (!me) return;
  if (me.role === "owner") {
    const { count } = await admin.from("core_org_members").select("profile_id", { count: "exact", head: true }).eq("org_id", orgId).eq("role", "owner").eq("status", "active");
    if ((count ?? 0) <= 1) throw new OrgError("唯一のオーナーは離脱できません。先に別のメンバーをオーナーにしてください");
  }
  await admin.from("core_org_members").update({ status: "left" }).eq("org_id", orgId).eq("profile_id", profileId);
  await admin.from("rh_participants").update({ is_active: false }).eq("org_id", orgId).eq("profile_id", profileId);
  await audit("member.leave", { orgId, actorProfileId: profileId });
}

// 退会(匿名化 + 認証ユーザー削除)。組織側には「退会済みユーザー」として記録が残る(Q25)
export async function deleteAccount(profileId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: owned } = await admin.from("core_org_members").select("org_id").eq("profile_id", profileId).eq("role", "owner").eq("status", "active");
  for (const o of owned ?? []) {
    const { count } = await admin.from("core_org_members").select("profile_id", { count: "exact", head: true }).eq("org_id", o.org_id).eq("role", "owner").eq("status", "active");
    if ((count ?? 0) <= 1) {
      // 他に admin がいれば自動移譲、いなければ組織を凍結(Q26)
      const { data: next } = await admin.from("core_org_members").select("profile_id").eq("org_id", o.org_id).eq("role", "admin").eq("status", "active").limit(1).maybeSingle();
      if (next) await admin.from("core_org_members").update({ role: "owner" }).eq("org_id", o.org_id).eq("profile_id", next.profile_id);
      else await admin.from("core_organizations").update({ status: "suspended" }).eq("id", o.org_id);
    }
  }
  await admin.from("rh_participants").update({ display_name: "退会済みユーザー", profile_id: null, is_active: false }).eq("profile_id", profileId);
  await admin.from("core_org_members").update({ status: "left" }).eq("profile_id", profileId);
  await audit("account.delete", { actorProfileId: profileId });
  // auth.users の削除で core_profiles / identities / consents / availability / settings は cascade 削除される
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) throw new OrgError(error.message);
}
