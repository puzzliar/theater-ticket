import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit, type SessionUser } from "@/lib/core/session";
import type { OrganizationRow } from "@/lib/core/types";
import { ensureParticipant } from "./profile";
import type { ProductionRow } from "./types";

// セルフ公演: 主催者が ZAGUMI に登録していなくても、キャスト個人が公演と予定を自分で管理できるようにする。
// 受け皿として 1 人 1 つの「個人座組」(core_organizations.kind='personal') を自動で作る。主催者コードは不要。
// 共演者を招待すれば共同で保守でき、主催者が登録したら公演ごと引き渡せる(transfer.ts)。

export function isPersonalOrg(org: Pick<OrganizationRow, "kind">): boolean {
  return org.kind === "personal";
}

export function personalOrgName(displayName: string): string {
  return `${displayName} のセルフ公演`;
}

export async function findPersonalOrg(profileId: string): Promise<OrganizationRow | null> {
  const { data } = await supabaseAdmin().from("core_organizations").select("*").eq("kind", "personal").eq("created_by", profileId).maybeSingle();
  return (data as OrganizationRow | null) ?? null;
}

export async function ensurePersonalOrg(user: SessionUser): Promise<OrganizationRow> {
  const admin = supabaseAdmin();
  let org = await findPersonalOrg(user.id);
  if (!org) {
    for (let i = 0; i < 5 && !org; i++) {
      const slug = `me-${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await admin
        .from("core_organizations")
        .insert({ slug, name: personalOrgName(user.profile.display_name), kind: "personal", created_by: user.id })
        .select("*")
        .single();
      if (!error) org = data as OrganizationRow;
      else if (error.code === "23505") {
        // slug の衝突は再試行。created_by の部分一意制約に当たった(並行作成)場合は既存を使う
        org = await findPersonalOrg(user.id);
      } else throw new Error(error.message);
    }
    if (!org) throw new Error("セルフ公演の作成に失敗しました");
    await audit("org.create", { orgId: org.id, actorProfileId: user.id, detail: { slug: org.slug, personal: true } });
  } else if (org.status !== "active") {
    await admin.from("core_organizations").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", org.id);
  }
  // オーナー所属と参加者レコード(退会・離脱で崩れていても復元する)
  const { data: m } = await admin.from("core_org_members").select("status, role").eq("org_id", org.id).eq("profile_id", user.id).maybeSingle();
  if (!m || m.status !== "active" || m.role !== "owner") {
    await admin
      .from("core_org_members")
      .upsert({ org_id: org.id, profile_id: user.id, role: "owner", part: user.profile.default_part, status: "active", joined_at: new Date().toISOString() }, { onConflict: "org_id,profile_id" });
  }
  await ensureParticipant(org.id, user.id, user.profile.display_name, user.profile.default_part);
  return org;
}

// 自分の個人座組にある公演(終了含む)
export async function listPersonalProductions(profileId: string): Promise<{ org: OrganizationRow; productions: (ProductionRow & { member_count: number })[] } | null> {
  const org = await findPersonalOrg(profileId);
  if (!org) return null;
  const { data } = await supabaseAdmin().from("rh_productions").select("*, rh_production_members(participant_id)").eq("org_id", org.id).order("created_at", { ascending: false });
  const productions = ((data ?? []) as (ProductionRow & { rh_production_members: { participant_id: string }[] })[]).map(({ rh_production_members, ...p }) => ({ ...p, member_count: rh_production_members.length }));
  return { org, productions };
}
