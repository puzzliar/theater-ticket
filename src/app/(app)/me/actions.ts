"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { applySubstitution, respondToSession } from "@/lib/rehearsal/core";
import { jstToIso } from "@/lib/rehearsal/time";
import { redirect } from "next/navigation";
import { ensurePersonalOrg } from "@/lib/rehearsal/personal";
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

// セルフ公演: 主催者未登録でも自分で公演を作る(個人座組を自動作成)。作成後は公演ページへ
export async function createSelfProduction(formData: FormData) {
  const me = await requireMe();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("公演名を入力してください");
  const org = await ensurePersonalOrg(me);
  const { data, error } = await supabaseAdmin()
    .from("rh_productions")
    .insert({ org_id: org.id, name, default_location: String(formData.get("default_location") ?? "").trim(), opens_on: String(formData.get("opens_on") ?? "").trim() || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // 自分を公演メンバーにしておく(召集対象になる)
  const { data: p } = await supabaseAdmin().from("rh_participants").select("id").eq("org_id", org.id).eq("profile_id", me.id).maybeSingle();
  if (p) await supabaseAdmin().from("rh_production_members").upsert({ production_id: data.id, participant_id: p.id, org_id: org.id }, { onConflict: "production_id,participant_id", ignoreDuplicates: true });
  revalidatePath("/me");
  redirect(`/o/${org.slug}/p/${data.id}?self=1`);
}
