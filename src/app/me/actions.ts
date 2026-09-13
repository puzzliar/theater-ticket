"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { applySubstitution, respondToSession } from "@/lib/rehearsal/core";
import { jstToIso } from "@/lib/rehearsal/time";
import type { Response } from "@/lib/rehearsal/types";

async function requireMe() {
  const me = await getSessionUser();
  if (!me) throw new Error("ログインが必要です");
  return me;
}

export async function respond(sessionId: string, response: Response) {
  const me = await requireMe();
  await respondToSession(me.id, sessionId, response);
  revalidatePath("/me");
}

export async function apply(requestId: string) {
  const me = await requireMe();
  await applySubstitution(me.id, requestId);
  revalidatePath("/me");
}

export async function addAvailability(formData: FormData) {
  const me = await requireMe();
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
  const { error } = await supabaseAdmin().from("rh_availability").insert({ profile_id: me.id, starts_at: startsAt, ends_at: endsAt, status, note: String(formData.get("note") ?? "").trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/me");
}

export async function deleteAvailability(id: string) {
  const me = await requireMe();
  await supabaseAdmin().from("rh_availability").delete().eq("id", id).eq("profile_id", me.id);
  revalidatePath("/me");
}
