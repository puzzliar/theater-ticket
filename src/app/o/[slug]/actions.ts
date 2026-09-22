"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit, requireOrgById } from "@/lib/core/session";
import { createInvitation, leaveOrganization, OrgError } from "@/lib/core/orgs";
import type { OrgRole, Part } from "@/lib/core/types";
import { claimParticipant, ensureParticipant } from "@/lib/rehearsal/profile";
import { jstToIso } from "@/lib/rehearsal/time";
import { notifySessionMembers, openSubstitution, fillSubstitution } from "@/lib/rehearsal/core";
import { syncSession, removeEventForParticipant } from "@/lib/rehearsal/google-sync";
import type { SessionKind } from "@/lib/rehearsal/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
const PARTS: Part[] = ["cast", "staff", "director", "organizer"];

// すべてのアクションは orgId で組織を特定し、requireOrgById で所属・権限を検証してから service role で書き込む

// ---------- 組織設定 / メンバー ----------

export async function updateOrg(orgId: string, formData: FormData) {
  const { org, user } = await requireOrgById(orgId, "admin");
  const name = str(formData, "name");
  if (!name) throw new Error("団体名を入力してください");
  const kind = str(formData, "kind");
  await supabaseAdmin()
    .from("core_organizations")
    .update({ name, kind: ["troupe", "producer", "individual", "other"].includes(kind) ? kind : org.kind, region: str(formData, "region") || null, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  await audit("org.update", { orgId, actorProfileId: user.id });
  revalidatePath(`/o/${org.slug}`, "layout");
}

export async function archiveOrg(orgId: string) {
  const { org, membership, user } = await requireOrgById(orgId, "admin");
  if (membership.role !== "owner") throw new Error("オーナーのみ操作できます");
  await supabaseAdmin().from("core_organizations").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", orgId);
  await audit("org.archive", { orgId, actorProfileId: user.id, detail: { slug: org.slug } });
  redirect("/me");
}

export async function setMemberRole(orgId: string, profileId: string, role: OrgRole) {
  const { org, membership, user } = await requireOrgById(orgId, "admin");
  if (!["owner", "admin", "member"].includes(role)) throw new Error("ロールが不正です");
  if (role === "owner" && membership.role !== "owner") throw new Error("オーナーの任命はオーナーのみ行えます");
  const admin = supabaseAdmin();
  const { data: target } = await admin.from("core_org_members").select("role").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  if (!target) throw new Error("メンバーが見つかりません");
  if (target.role === "owner" && role !== "owner") {
    const { count } = await admin.from("core_org_members").select("profile_id", { count: "exact", head: true }).eq("org_id", orgId).eq("role", "owner").eq("status", "active");
    if ((count ?? 0) <= 1) throw new Error("唯一のオーナーは降格できません");
  }
  await admin.from("core_org_members").update({ role }).eq("org_id", orgId).eq("profile_id", profileId);
  await audit("member.role", { orgId, actorProfileId: user.id, target: profileId, detail: { role } });
  revalidatePath(`/o/${org.slug}/members`);
}

export async function removeMember(orgId: string, profileId: string) {
  const { org, user } = await requireOrgById(orgId, "admin");
  if (profileId === user.id) throw new Error("自分自身は除名できません(設定から離脱してください)");
  const admin = supabaseAdmin();
  const { data: target } = await admin.from("core_org_members").select("role").eq("org_id", orgId).eq("profile_id", profileId).maybeSingle();
  if (target?.role === "owner") throw new Error("オーナーは除名できません");
  await admin.from("core_org_members").update({ status: "removed" }).eq("org_id", orgId).eq("profile_id", profileId);
  await admin.from("rh_participants").update({ is_active: false }).eq("org_id", orgId).eq("profile_id", profileId);
  await audit("member.remove", { orgId, actorProfileId: user.id, target: profileId });
  revalidatePath(`/o/${org.slug}/members`);
}

export async function leaveOrg(orgId: string) {
  const { user } = await requireOrgById(orgId);
  try {
    await leaveOrganization(orgId, user.id);
  } catch (e) {
    if (e instanceof OrgError) throw new Error(e.message);
    throw e;
  }
  redirect("/me");
}

// ---------- 招待 ----------

export async function newInvitation(orgId: string, formData: FormData) {
  const { org, user } = await requireOrgById(orgId, "admin");
  const role = str(formData, "role") === "admin" ? "admin" : "member";
  const part = str(formData, "part") as Part;
  const maxUses = Number(formData.get("max_uses") ?? 0);
  await createInvitation(orgId, user.id, {
    role,
    part: PARTS.includes(part) ? part : null,
    label: str(formData, "label"),
    maxUses: maxUses > 0 ? maxUses : null,
    days: Number(formData.get("days") ?? 14) || 14,
  });
  revalidatePath(`/o/${org.slug}/members`);
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  const { org, user } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("core_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId).eq("org_id", orgId);
  await audit("invitation.revoke", { orgId, actorProfileId: user.id, target: invitationId });
  revalidatePath(`/o/${org.slug}/members`);
}

// ---------- 参加者(仮メンバー) ----------

export async function addPlaceholderParticipant(orgId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const name = str(formData, "display_name");
  if (!name) throw new Error("名前を入力してください");
  const part = str(formData, "part") as Part;
  const { error } = await supabaseAdmin().from("rh_participants").insert({ org_id: orgId, display_name: name, part: PARTS.includes(part) ? part : "cast" });
  if (error) throw new Error(error.message);
  revalidatePath(`/o/${org.slug}/members`);
}

// admin が仮メンバーを既存メンバー(アカウント)に紐づける
export async function linkParticipant(orgId: string, participantId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const profileId = str(formData, "profile_id");
  if (!profileId) throw new Error("メンバーを選択してください");
  const { data: m } = await supabaseAdmin().from("core_org_members").select("profile_id").eq("org_id", orgId).eq("profile_id", profileId).eq("status", "active").maybeSingle();
  if (!m) throw new Error("この組織のメンバーではありません");
  await claimParticipant(orgId, participantId, profileId);
  revalidatePath(`/o/${org.slug}/members`);
}

// 本人が仮メンバーを「これは私です」と紐づける
export async function claimMe(orgId: string, participantId: string) {
  const { org, user } = await requireOrgById(orgId);
  await claimParticipant(orgId, participantId, user.id);
  revalidatePath(`/o/${org.slug}`);
  revalidatePath("/me");
}

export async function setParticipantActive(orgId: string, participantId: string, active: boolean) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_participants").update({ is_active: active }).eq("id", participantId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}/members`);
}

export async function ensureMyParticipant(orgId: string) {
  const { org, user, membership } = await requireOrgById(orgId);
  await ensureParticipant(orgId, user.id, user.profile.display_name, membership.part);
  revalidatePath(`/o/${org.slug}`);
}

// ---------- プロダクション ----------

export async function createProduction(orgId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const { data, error } = await supabaseAdmin()
    .from("rh_productions")
    .insert({
      org_id: orgId,
      name: str(formData, "name"),
      default_location: str(formData, "default_location"),
      rehearsal_starts_on: str(formData, "rehearsal_starts_on") || null,
      opens_on: str(formData, "opens_on") || null,
      note: str(formData, "note"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/o/${org.slug}/p/${data.id}`);
}

export async function updateProductionStatus(orgId: string, productionId: string, status: string) {
  const { org } = await requireOrgById(orgId, "admin");
  if (!["planning", "rehearsing", "running", "closed"].includes(status)) throw new Error("状態が不正です");
  await supabaseAdmin().from("rh_productions").update({ status }).eq("id", productionId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}`);
}

export async function addProductionMember(orgId: string, productionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const participantId = str(formData, "participant_id");
  if (!participantId) throw new Error("参加者を選択してください");
  const { error } = await supabaseAdmin()
    .from("rh_production_members")
    .upsert({ production_id: productionId, participant_id: participantId, org_id: orgId, role_name: str(formData, "role_name") }, { onConflict: "production_id,participant_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function removeProductionMember(orgId: string, productionId: string, participantId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_production_members").delete().eq("production_id", productionId).eq("participant_id", participantId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

// ---------- シーン ----------

export async function createScene(orgId: string, productionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const admin = supabaseAdmin();
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!code || !name) throw new Error("シーンのコードと名称を入力してください");
  const { data: last } = await admin.from("rh_scenes").select("sort_order").eq("production_id", productionId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: scene, error } = await admin
    .from("rh_scenes")
    .insert({ org_id: orgId, production_id: productionId, code, name, sort_order: (last?.sort_order ?? 0) + 10, target_count: Math.max(1, Number(formData.get("target_count") ?? 1) || 1), note: str(formData, "note") })
    .select("id")
    .single();
  if (error) throw new Error(error.code === "23505" ? "同じコードのシーンが既にあります" : error.message);
  const ids = list(formData, "participant_ids");
  if (ids.length) await admin.from("rh_scene_members").insert(ids.map((p) => ({ scene_id: scene.id, participant_id: p, org_id: orgId })));
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function setSceneMembers(orgId: string, productionId: string, sceneId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const admin = supabaseAdmin();
  const ids = list(formData, "participant_ids");
  await admin.from("rh_scene_members").delete().eq("scene_id", sceneId).eq("org_id", orgId);
  if (ids.length) await admin.from("rh_scene_members").insert(ids.map((p) => ({ scene_id: sceneId, participant_id: p, org_id: orgId })));
  const target = Number(formData.get("target_count"));
  if (target >= 1) await admin.from("rh_scenes").update({ target_count: target }).eq("id", sceneId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function deleteScene(orgId: string, productionId: string, sceneId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_scenes").delete().eq("id", sceneId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

// ---------- 稽古枠 ----------

function parseSlot(formData: FormData): { startsAt: string; endsAt: string } {
  const date = str(formData, "date");
  const from = str(formData, "from");
  const to = str(formData, "to");
  if (!date || !from || !to) throw new Error("日付と時間を入力してください");
  const startsAt = jstToIso(`${date}T${from}`);
  const endsAt = jstToIso(`${date}T${to}`);
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("終了は開始より後にしてください");
  return { startsAt, endsAt };
}

export async function checkSessionSlot(orgId: string, productionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const q = new URLSearchParams();
  for (const k of ["kind", "title", "date", "from", "to", "location", "note"]) q.set(k, str(formData, k));
  for (const s of list(formData, "scene_ids")) q.append("scene_ids", s);
  for (const p of list(formData, "participant_ids")) q.append("participant_ids", p);
  q.set("check", "1");
  redirect(`/o/${org.slug}/p/${productionId}?${q.toString()}#new-session`);
}

export async function createSession(orgId: string, productionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const admin = supabaseAdmin();
  const { startsAt, endsAt } = parseSlot(formData);
  const kind = (str(formData, "kind") || "rehearsal") as SessionKind;
  if (!["rehearsal", "performance", "other"].includes(kind)) throw new Error("種別が不正です");
  const sceneIds = list(formData, "scene_ids");
  const extra = list(formData, "participant_ids");

  const { data: session, error } = await admin
    .from("rh_sessions")
    .insert({ org_id: orgId, production_id: productionId, kind, title: str(formData, "title"), starts_at: startsAt, ends_at: endsAt, location: str(formData, "location"), note: str(formData, "note") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (sceneIds.length) await admin.from("rh_session_scenes").insert(sceneIds.map((s) => ({ session_id: session.id, scene_id: s, org_id: orgId })));
  const ids = new Set(extra);
  if (sceneIds.length) {
    const { data: sm } = await admin.from("rh_scene_members").select("participant_id").in("scene_id", sceneIds);
    for (const r of sm ?? []) ids.add(r.participant_id);
  }
  if (ids.size) await admin.from("rh_session_members").insert([...ids].map((p) => ({ session_id: session.id, participant_id: p, org_id: orgId })));
  if (formData.get("notify") === "on") await notifySessionMembers(session.id, "invite");
  await syncSession(session.id);
  redirect(`/o/${org.slug}/p/${productionId}/s/${session.id}`);
}

export async function updateSession(orgId: string, productionId: string, sessionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const { startsAt, endsAt } = parseSlot(formData);
  const { error } = await supabaseAdmin()
    .from("rh_sessions")
    .update({ title: str(formData, "title"), starts_at: startsAt, ends_at: endsAt, location: str(formData, "location"), note: str(formData, "note"), updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  if (formData.get("notify") === "on") await notifySessionMembers(sessionId, "update");
  await syncSession(sessionId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function cancelSession(orgId: string, productionId: string, sessionId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  const admin = supabaseAdmin();
  await admin.from("rh_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", sessionId).eq("org_id", orgId);
  await admin.from("rh_substitution_requests").update({ status: "cancelled" }).eq("session_id", sessionId).eq("status", "open");
  await notifySessionMembers(sessionId, "cancel");
  await syncSession(sessionId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function reopenSession(orgId: string, productionId: string, sessionId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_sessions").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", sessionId).eq("org_id", orgId);
  await syncSession(sessionId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function saveSessionRecord(orgId: string, productionId: string, sessionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const admin = supabaseAdmin();
  const { data: members } = await admin.from("rh_session_members").select("participant_id").eq("session_id", sessionId);
  for (const m of members ?? []) {
    const att = str(formData, `att_${m.participant_id}`);
    const patch: { required: boolean; attendance?: string } = { required: formData.has(`req_${m.participant_id}`) };
    if (["unknown", "present", "absent", "late"].includes(att)) patch.attendance = att;
    await admin.from("rh_session_members").update(patch).eq("session_id", sessionId).eq("participant_id", m.participant_id);
  }
  const { data: scenes } = await admin.from("rh_session_scenes").select("scene_id").eq("session_id", sessionId);
  for (const sc of scenes ?? []) {
    const st = str(formData, `scene_${sc.scene_id}`);
    if (["planned", "done", "skipped"].includes(st)) await admin.from("rh_session_scenes").update({ status: st }).eq("session_id", sessionId).eq("scene_id", sc.scene_id);
  }
  if (formData.get("finish") === "on") {
    await admin.from("rh_session_scenes").update({ status: "done" }).eq("session_id", sessionId).eq("status", "planned");
    await admin.from("rh_sessions").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", sessionId).eq("org_id", orgId);
  }
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/o/${org.slug}/p/${productionId}`);
}

export async function addSessionScene(orgId: string, productionId: string, sessionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const sceneId = str(formData, "scene_id");
  if (!sceneId) return;
  const admin = supabaseAdmin();
  await admin.from("rh_session_scenes").upsert({ session_id: sessionId, scene_id: sceneId, org_id: orgId }, { onConflict: "session_id,scene_id" });
  const { data: sm } = await admin.from("rh_scene_members").select("participant_id").eq("scene_id", sceneId);
  if (sm?.length) {
    await admin.from("rh_session_members").upsert(sm.map((r) => ({ session_id: sessionId, participant_id: r.participant_id, org_id: orgId })), { onConflict: "session_id,participant_id", ignoreDuplicates: true });
  }
  await syncSession(sessionId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function removeSessionScene(orgId: string, productionId: string, sessionId: string, sceneId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_session_scenes").delete().eq("session_id", sessionId).eq("scene_id", sceneId).eq("org_id", orgId);
  await syncSession(sessionId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function addSessionMember(orgId: string, productionId: string, sessionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const participantId = str(formData, "participant_id");
  if (!participantId) return;
  await supabaseAdmin().from("rh_session_members").upsert({ session_id: sessionId, participant_id: participantId, org_id: orgId }, { onConflict: "session_id,participant_id", ignoreDuplicates: true });
  if (formData.get("notify") === "on") await notifySessionMembers(sessionId, "invite", [participantId]);
  await syncSession(sessionId, [participantId]);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function removeSessionMember(orgId: string, productionId: string, sessionId: string, participantId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await removeEventForParticipant(sessionId, participantId);
  await supabaseAdmin().from("rh_session_members").delete().eq("session_id", sessionId).eq("participant_id", participantId).eq("org_id", orgId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function sendInvites(orgId: string, productionId: string, sessionId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await notifySessionMembers(sessionId, "invite");
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

// ---------- 代役 ----------

export async function requestSubstitution(orgId: string, productionId: string, sessionId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const absent = str(formData, "absent_participant_id");
  if (!absent) throw new Error("欠ける人を選択してください");
  await openSubstitution(sessionId, absent, str(formData, "reason"));
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function fillSubstitutionManually(orgId: string, productionId: string, sessionId: string, requestId: string, formData: FormData) {
  const { org } = await requireOrgById(orgId, "admin");
  const participantId = str(formData, "participant_id");
  if (!participantId) throw new Error("参加者を選択してください");
  await fillSubstitution(requestId, participantId);
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}

export async function cancelSubstitution(orgId: string, productionId: string, sessionId: string, requestId: string) {
  const { org } = await requireOrgById(orgId, "admin");
  await supabaseAdmin().from("rh_substitution_requests").update({ status: "cancelled" }).eq("id", requestId).eq("org_id", orgId).eq("status", "open");
  revalidatePath(`/o/${org.slug}/p/${productionId}/s/${sessionId}`);
}
