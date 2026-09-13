import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Part } from "@/lib/core/types";
import type { ParticipantRow, ProfileSettingsRow } from "./types";

// 個人(プロフィール)単位の稽古管理設定と、組織内の参加者レコードのヘルパー

export async function getSettings(profileId: string): Promise<ProfileSettingsRow> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("rh_profile_settings").select("*").eq("profile_id", profileId).maybeSingle();
  if (data) return data as ProfileSettingsRow;
  const { data: created, error } = await admin.from("rh_profile_settings").upsert({ profile_id: profileId }, { onConflict: "profile_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return created as ProfileSettingsRow;
}

// 6桁の LINE 連携コードを発行(10分有効)。LINE ログインを使わない人向け
export async function issueLineLinkCode(profileId: string): Promise<string> {
  const admin = supabaseAdmin();
  await getSettings(profileId);
  for (let i = 0; i < 5; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await admin
      .from("rh_profile_settings")
      .update({ line_link_code: code, line_link_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .eq("profile_id", profileId);
    if (!error) return code;
  }
  throw new Error("連携コードを発行できませんでした");
}

// 組織に参加した人の参加者レコードを用意する(既にあればそれを返す)
export async function ensureParticipant(orgId: string, profileId: string, displayName: string, part: Part): Promise<ParticipantRow> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("rh_participants").select("*").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  if (existing) {
    if (!existing.is_active) await admin.from("rh_participants").update({ is_active: true }).eq("id", existing.id);
    return existing as ParticipantRow;
  }
  const { data, error } = await admin
    .from("rh_participants")
    .insert({ org_id: orgId, profile_id: profileId, display_name: displayName, part })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ParticipantRow;
}

// 仮メンバーを本人に紐づける。本人用に自動作成された参加者があれば、参照が無いことを確認して統合する
export async function claimParticipant(orgId: string, participantId: string, profileId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: target } = await admin.from("rh_participants").select("*").eq("id", participantId).eq("org_id", orgId).maybeSingle();
  if (!target) throw new Error("参加者が見つかりません");
  if (target.profile_id && target.profile_id !== profileId) throw new Error("この参加者は既に別のアカウントに紐づいています");
  const { data: mine } = await admin.from("rh_participants").select("id").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  if (mine && mine.id !== participantId) {
    // 自動作成分の参照(召集・シーン)を仮メンバー側へ付け替えてから削除
    await admin.from("rh_session_members").update({ participant_id: participantId }).eq("participant_id", mine.id);
    await admin.from("rh_scene_members").update({ participant_id: participantId }).eq("participant_id", mine.id);
    await admin.from("rh_production_members").update({ participant_id: participantId }).eq("participant_id", mine.id);
    await admin.from("rh_participants").delete().eq("id", mine.id);
  }
  const { error } = await admin.from("rh_participants").update({ profile_id: profileId, is_active: true }).eq("id", participantId);
  if (error) throw new Error(error.message);
}

// 自分に紐づく参加者ID(全組織)
export async function myParticipantIds(profileId: string): Promise<string[]> {
  const { data } = await supabaseAdmin().from("rh_participants").select("id").eq("profile_id", profileId).eq("is_active", true);
  return (data ?? []).map((r) => r.id);
}

export async function participantForProfile(orgId: string, profileId: string): Promise<ParticipantRow | null> {
  const { data } = await supabaseAdmin().from("rh_participants").select("*").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  return (data as ParticipantRow | null) ?? null;
}
