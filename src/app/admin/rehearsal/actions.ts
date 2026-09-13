"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";
import { jstToIso } from "@/lib/rehearsal/time";
import { notifySessionMembers, openSubstitution, fillSubstitution } from "@/lib/rehearsal/core";
import { syncSession, removeEventForMember } from "@/lib/rehearsal/google-sync";
import type { MemberKind, SessionKind } from "@/lib/rehearsal/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

// ---------- プロダクション / メンバー ----------

export async function createProduction(formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rh_productions")
    .insert({
      org_id: ORG_ID,
      name: str(formData, "name"),
      tk_event_id: str(formData, "tk_event_id") || null,
      default_location: str(formData, "default_location"),
      rehearsal_starts_on: str(formData, "rehearsal_starts_on") || null,
      opens_on: str(formData, "opens_on") || null,
      note: str(formData, "note"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/rehearsal");
  redirect(`/admin/rehearsal/p/${data.id}`);
}

export async function updateProductionStatus(productionId: string, status: string) {
  await requireRole("admin");
  if (!["planning", "rehearsing", "running", "closed"].includes(status)) throw new Error("状態が不正です");
  const admin = supabaseAdmin();
  await admin.from("rh_productions").update({ status }).eq("id", productionId);
  revalidatePath("/admin/rehearsal");
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

// メンバー作成。email を指定すると既存ログインアカウントを紐づける(未登録なら通知先メールとしてのみ保持)
export async function createMember(formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const name = str(formData, "name");
  const kind = str(formData, "kind") as MemberKind;
  const email = str(formData, "email").toLowerCase();
  if (!name) throw new Error("氏名を入力してください");
  if (!["cast", "staff", "director"].includes(kind)) throw new Error("区分が不正です");

  let userId: string | null = null;
  if (email) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  const { error } = await admin.from("rh_members").insert({ org_id: ORG_ID, name, kind, email: email || null, user_id: userId });
  if (error) throw new Error(error.code === "23505" ? "そのアカウントは既に別のメンバーに紐づいています" : error.message);
  revalidatePath("/admin/rehearsal");
}

export async function toggleMemberActive(memberId: string, active: boolean) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_members").update({ is_active: active }).eq("id", memberId);
  revalidatePath("/admin/rehearsal");
}

export async function addProductionMember(productionId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const memberId = str(formData, "member_id");
  if (!memberId) throw new Error("メンバーを選択してください");
  const { error } = await admin.from("rh_production_members").upsert(
    { production_id: productionId, member_id: memberId, org_id: ORG_ID, part: str(formData, "part") || "cast", role_name: str(formData, "role_name") },
    { onConflict: "production_id,member_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function removeProductionMember(productionId: string, memberId: string) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_production_members").delete().eq("production_id", productionId).eq("member_id", memberId);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

// ---------- シーン ----------

export async function createScene(productionId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const code = str(formData, "code");
  const name = str(formData, "name");
  if (!code || !name) throw new Error("シーンのコードと名称を入力してください");
  const { data: last } = await admin.from("rh_scenes").select("sort_order").eq("production_id", productionId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: scene, error } = await admin
    .from("rh_scenes")
    .insert({
      org_id: ORG_ID,
      production_id: productionId,
      code,
      name,
      sort_order: (last?.sort_order ?? 0) + 10,
      target_count: Math.max(1, Number(formData.get("target_count") ?? 1) || 1),
      note: str(formData, "note"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.code === "23505" ? "同じコードのシーンが既にあります" : error.message);
  const memberIds = list(formData, "member_ids");
  if (memberIds.length) {
    await admin.from("rh_scene_members").insert(memberIds.map((m) => ({ scene_id: scene.id, member_id: m, org_id: ORG_ID })));
  }
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function setSceneMembers(productionId: string, sceneId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const memberIds = list(formData, "member_ids");
  await admin.from("rh_scene_members").delete().eq("scene_id", sceneId);
  if (memberIds.length) {
    await admin.from("rh_scene_members").insert(memberIds.map((m) => ({ scene_id: sceneId, member_id: m, org_id: ORG_ID })));
  }
  const target = Number(formData.get("target_count"));
  if (target >= 1) await admin.from("rh_scenes").update({ target_count: target }).eq("id", sceneId);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function deleteScene(productionId: string, sceneId: string) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_scenes").delete().eq("id", sceneId);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
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

// 作成前の参加可否チェック: 入力内容をクエリに載せて同じ画面へ戻す(要件 5.3)
export async function checkSessionSlot(productionId: string, formData: FormData) {
  await requireRole("admin");
  const q = new URLSearchParams();
  for (const k of ["kind", "title", "date", "from", "to", "location", "note"]) q.set(k, str(formData, k));
  for (const s of list(formData, "scene_ids")) q.append("scene_ids", s);
  for (const m of list(formData, "member_ids")) q.append("member_ids", m);
  q.set("check", "1");
  redirect(`/admin/rehearsal/p/${productionId}?${q.toString()}#new-session`);
}

export async function createSession(productionId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const { startsAt, endsAt } = parseSlot(formData);
  const kind = (str(formData, "kind") || "rehearsal") as SessionKind;
  if (!["rehearsal", "performance", "other"].includes(kind)) throw new Error("種別が不正です");
  const sceneIds = list(formData, "scene_ids");
  const extraMemberIds = list(formData, "member_ids");

  const { data: session, error } = await admin
    .from("rh_sessions")
    .insert({
      org_id: ORG_ID,
      production_id: productionId,
      kind,
      title: str(formData, "title"),
      starts_at: startsAt,
      ends_at: endsAt,
      location: str(formData, "location"),
      note: str(formData, "note"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (sceneIds.length) {
    await admin.from("rh_session_scenes").insert(sceneIds.map((s) => ({ session_id: session.id, scene_id: s, org_id: ORG_ID })));
  }
  // 召集: 予定シーンの必要メンバー ∪ 手動指定
  const memberIds = new Set(extraMemberIds);
  if (sceneIds.length) {
    const { data: sm } = await admin.from("rh_scene_members").select("member_id").in("scene_id", sceneIds);
    for (const r of sm ?? []) memberIds.add(r.member_id);
  }
  if (memberIds.size) {
    await admin.from("rh_session_members").insert([...memberIds].map((m) => ({ session_id: session.id, member_id: m, org_id: ORG_ID })));
  }
  if (formData.get("notify") === "on") await notifySessionMembers(session.id, "invite");
  await syncSession(session.id);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
  redirect(`/admin/rehearsal/p/${productionId}/s/${session.id}`);
}

export async function updateSession(productionId: string, sessionId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const { startsAt, endsAt } = parseSlot(formData);
  const { error } = await admin
    .from("rh_sessions")
    .update({
      title: str(formData, "title"),
      starts_at: startsAt,
      ends_at: endsAt,
      location: str(formData, "location"),
      note: str(formData, "note"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
  if (formData.get("notify") === "on") await notifySessionMembers(sessionId, "update");
  await syncSession(sessionId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function cancelSession(productionId: string, sessionId: string) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  await admin.from("rh_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", sessionId);
  await admin.from("rh_substitution_requests").update({ status: "cancelled" }).eq("session_id", sessionId).eq("status", "open");
  await notifySessionMembers(sessionId, "cancel");
  await syncSession(sessionId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function reopenSession(productionId: string, sessionId: string) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_sessions").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", sessionId);
  await syncSession(sessionId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

// 出席・実施シーンの記録。finish=on で完了(進捗に反映)
export async function saveSessionRecord(productionId: string, sessionId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const { data: members } = await admin.from("rh_session_members").select("member_id").eq("session_id", sessionId);
  for (const m of members ?? []) {
    const att = String(formData.get(`att_${m.member_id}`) ?? "");
    const patch: { required: boolean; attendance?: string } = { required: formData.has(`req_${m.member_id}`) };
    if (["unknown", "present", "absent", "late"].includes(att)) patch.attendance = att;
    await admin.from("rh_session_members").update(patch).eq("session_id", sessionId).eq("member_id", m.member_id);
  }
  const { data: scenes } = await admin.from("rh_session_scenes").select("scene_id").eq("session_id", sessionId);
  for (const sc of scenes ?? []) {
    const st = String(formData.get(`scene_${sc.scene_id}`) ?? "");
    if (["planned", "done", "skipped"].includes(st)) {
      await admin.from("rh_session_scenes").update({ status: st }).eq("session_id", sessionId).eq("scene_id", sc.scene_id);
    }
  }
  if (formData.get("finish") === "on") {
    // 未記録の予定シーンは実施済みとみなす
    await admin.from("rh_session_scenes").update({ status: "done" }).eq("session_id", sessionId).eq("status", "planned");
    await admin.from("rh_sessions").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", sessionId);
  }
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
  revalidatePath(`/admin/rehearsal/p/${productionId}`);
}

export async function addSessionScene(productionId: string, sessionId: string, formData: FormData) {
  await requireRole("admin");
  const sceneId = str(formData, "scene_id");
  if (!sceneId) return;
  const admin = supabaseAdmin();
  await admin.from("rh_session_scenes").upsert({ session_id: sessionId, scene_id: sceneId, org_id: ORG_ID }, { onConflict: "session_id,scene_id" });
  // そのシーンの必要メンバーも召集に追加(既存は維持)
  const { data: sm } = await admin.from("rh_scene_members").select("member_id").eq("scene_id", sceneId);
  if (sm?.length) {
    await admin.from("rh_session_members").upsert(
      sm.map((r) => ({ session_id: sessionId, member_id: r.member_id, org_id: ORG_ID })),
      { onConflict: "session_id,member_id", ignoreDuplicates: true },
    );
  }
  await syncSession(sessionId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function removeSessionScene(productionId: string, sessionId: string, sceneId: string) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_session_scenes").delete().eq("session_id", sessionId).eq("scene_id", sceneId);
  await syncSession(sessionId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function addSessionMember(productionId: string, sessionId: string, formData: FormData) {
  await requireRole("admin");
  const memberId = str(formData, "member_id");
  if (!memberId) return;
  const admin = supabaseAdmin();
  await admin.from("rh_session_members").upsert({ session_id: sessionId, member_id: memberId, org_id: ORG_ID }, { onConflict: "session_id,member_id", ignoreDuplicates: true });
  if (formData.get("notify") === "on") await notifySessionMembers(sessionId, "invite", [memberId]);
  await syncSession(sessionId, [memberId]);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function removeSessionMember(productionId: string, sessionId: string, memberId: string) {
  await requireRole("admin");
  await removeEventForMember(sessionId, memberId);
  await supabaseAdmin().from("rh_session_members").delete().eq("session_id", sessionId).eq("member_id", memberId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function sendInvites(productionId: string, sessionId: string) {
  await requireRole("admin");
  await notifySessionMembers(sessionId, "invite");
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

// ---------- 代役 ----------

export async function requestSubstitution(productionId: string, sessionId: string, formData: FormData) {
  await requireRole("admin");
  const absent = str(formData, "absent_member_id");
  if (!absent) throw new Error("欠ける人を選択してください");
  await openSubstitution(sessionId, absent, str(formData, "reason"));
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function fillSubstitutionManually(productionId: string, sessionId: string, requestId: string, formData: FormData) {
  await requireRole("admin");
  const memberId = str(formData, "member_id");
  if (!memberId) throw new Error("メンバーを選択してください");
  await fillSubstitution(requestId, memberId);
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}

export async function cancelSubstitution(productionId: string, sessionId: string, requestId: string) {
  await requireRole("admin");
  await supabaseAdmin().from("rh_substitution_requests").update({ status: "cancelled" }).eq("id", requestId).eq("status", "open");
  revalidatePath(`/admin/rehearsal/p/${productionId}/s/${sessionId}`);
}
