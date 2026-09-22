// 共通アカウント基盤 (core_) の型 (docs/account-platform.md)

export type OrgRole = "owner" | "admin" | "member";
export type Part = "cast" | "staff" | "director" | "organizer";
export type OrgKind = "troupe" | "producer" | "individual" | "other";

export interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  default_part: Part;
  is_platform_admin: boolean;
  onboarded_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  region: string | null;
  status: "active" | "archived" | "suspended";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMemberRow {
  org_id: string;
  profile_id: string;
  role: OrgRole;
  part: Part;
  status: "active" | "left" | "removed";
  joined_at: string;
}

export interface InvitationRow {
  id: string;
  org_id: string;
  token: string;
  role: "admin" | "member";
  part: Part | null;
  label: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string;
  created_by: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface IdentityRow {
  profile_id: string;
  provider: "line" | "google_calendar";
  provider_uid: string;
  email: string | null;
  display_name: string | null;
  secret_enc: string | null;
  meta: Record<string, unknown>;
  connected_at: string;
}

export interface OrganizerCodeRow {
  code: string;
  note: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export const PART_LABEL: Record<Part, string> = {
  cast: "キャスト",
  staff: "スタッフ",
  director: "演出",
  organizer: "主催・制作",
};

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

export const ORG_KIND_LABEL: Record<OrgKind, string> = {
  troupe: "劇団",
  producer: "制作会社・団体",
  individual: "個人主催",
  other: "その他",
};

export function isAdminRole(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

// 規約・プライバシーポリシーの版。改定時に上げると再同意を求める
export const TERMS_VERSION = "2026-09-13";
export const PRIVACY_VERSION = "2026-09-13";
