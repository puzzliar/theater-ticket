"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";
import { getCurrentMember, issueLineLinkCode } from "@/lib/rehearsal/members";
import { applySubstitution, respondToSession } from "@/lib/rehearsal/core";
import { jstToIso } from "@/lib/rehearsal/time";
import { deleteAllEventsForMember, importBusyAsUnavailable } from "@/lib/rehearsal/google-sync";
import { revokeToken } from "@/lib/google-calendar";
import type { Response } from "@/lib/rehearsal/types";

async function requireMember() {
  const ctx = await getCurrentMember();
  if (!ctx || !ctx.member) throw new Error("メンバー登録がありません");
  return ctx.member;
}

export async function respond(sessionId: string, response: Response) {
  const member = await requireMember();
  await respondToSession(member.id, sessionId, response);
  revalidatePath("/me");
}

export async function apply(requestId: string) {
  const member = await requireMember();
  await applySubstitution(member.id, requestId);
  revalidatePath("/me");
}

export async function addAvailability(formData: FormData) {
  const member = await requireMember();
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const status = String(formData.get("status") ?? "available");
  const allDay = formData.get("all_day") === "on";
  if (!date) throw new Error("日付を入力してください");
  if (!["available", "unavailable"].includes(status)) throw new Error("区分が不正です");
  const startsAt = jstToIso(`${date}T${allDay ? "00:00" : from}`);
  const endsAt = allDay ? jstToIso(`${date}T23:59`) : jstToIso(`${date}T${to}`);
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("終了は開始より後にしてください");
  const admin = supabaseAdmin();
  const { error } = await admin.from("rh_availability").insert({
    org_id: ORG_ID,
    member_id: member.id,
    starts_at: startsAt,
    ends_at: endsAt,
    status,
    note: String(formData.get("note") ?? "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/me");
}

export async function deleteAvailability(id: string) {
  const member = await requireMember();
  const admin = supabaseAdmin();
  await admin.from("rh_availability").delete().eq("id", id).eq("member_id", member.id);
  revalidatePath("/me");
}

export async function newLineCode() {
  const member = await requireMember();
  await issueLineLinkCode(member.id);
  revalidatePath("/me");
}

export async function importGoogleBusy() {
  const member = await requireMember();
  await importBusyAsUnavailable(member.id);
  revalidatePath("/me");
}

export async function setFreebusyImport(enabled: boolean) {
  const member = await requireMember();
  const admin = supabaseAdmin();
  await admin.from("rh_members").update({ google_freebusy_import: enabled }).eq("id", member.id);
  if (!enabled) await admin.from("rh_availability").delete().eq("member_id", member.id).eq("source", "calendar");
  revalidatePath("/me");
}

export async function disconnectGoogle() {
  const member = await requireMember();
  const admin = supabaseAdmin();
  await deleteAllEventsForMember(member.id);
  if (member.google_refresh_token_enc) await revokeToken(member.google_refresh_token_enc);
  await admin
    .from("rh_members")
    .update({ google_refresh_token_enc: null, google_email: null, google_connected_at: null })
    .eq("id", member.id);
  await admin.from("rh_availability").delete().eq("member_id", member.id).eq("source", "calendar");
  revalidatePath("/me");
}

export async function unlinkLine() {
  const member = await requireMember();
  const admin = supabaseAdmin();
  await admin.from("rh_members").update({ line_user_id: null }).eq("id", member.id);
  revalidatePath("/me");
}
