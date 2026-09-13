"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/core/session";
import { deleteAccount, leaveOrganization } from "@/lib/core/orgs";
import { getSettings, issueLineLinkCode } from "@/lib/rehearsal/profile";
import { deleteAllEventsForProfile, importBusyAsUnavailable } from "@/lib/rehearsal/google-sync";
import { revokeToken } from "@/lib/google-calendar";
import type { Part } from "@/lib/core/types";
import type { NotifyChannel } from "@/lib/rehearsal/types";

const CHANNELS: NotifyChannel[] = ["line", "webpush", "email", "none"];

async function requireMe() {
  const me = await getSessionUser();
  if (!me) throw new Error("ログインが必要です");
  return me;
}

export async function updateProfile(formData: FormData) {
  const me = await requireMe();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const part = String(formData.get("default_part") ?? "cast") as Part;
  if (!displayName) throw new Error("表示名を入力してください");
  const admin = supabaseAdmin();
  await admin.from("core_profiles").update({ display_name: displayName, default_part: part, updated_at: new Date().toISOString() }).eq("id", me.id);
  await admin.from("rh_participants").update({ display_name: displayName }).eq("profile_id", me.id);
  revalidatePath("/me/settings");
}

export async function updateNotifyPrefs(formData: FormData) {
  const me = await requireMe();
  await getSettings(me.id);
  const pick = (k: string): NotifyChannel => {
    const v = String(formData.get(k) ?? "email") as NotifyChannel;
    return CHANNELS.includes(v) ? v : "email";
  };
  await supabaseAdmin()
    .from("rh_profile_settings")
    .update({ notify_digest: pick("notify_digest"), notify_reminder: pick("notify_reminder"), notify_invite: pick("notify_invite"), notify_substitution: pick("notify_substitution"), updated_at: new Date().toISOString() })
    .eq("profile_id", me.id);
  revalidatePath("/me/settings");
}

export async function newLineCode() {
  const me = await requireMe();
  await issueLineLinkCode(me.id);
  revalidatePath("/me/settings");
}

export async function unlinkLine() {
  const me = await requireMe();
  await supabaseAdmin().from("core_identities").delete().eq("profile_id", me.id).eq("provider", "line");
  revalidatePath("/me/settings");
}

export async function importGoogleBusy() {
  const me = await requireMe();
  await importBusyAsUnavailable(me.id);
  revalidatePath("/me/settings");
  revalidatePath("/me");
}

export async function setFreebusyImport(enabled: boolean) {
  const me = await requireMe();
  await getSettings(me.id);
  const admin = supabaseAdmin();
  await admin.from("rh_profile_settings").update({ google_freebusy_import: enabled }).eq("profile_id", me.id);
  if (!enabled) await admin.from("rh_availability").delete().eq("profile_id", me.id).eq("source", "calendar");
  revalidatePath("/me/settings");
}

export async function disconnectGoogle() {
  const me = await requireMe();
  const admin = supabaseAdmin();
  await deleteAllEventsForProfile(me.id);
  const { data: ident } = await admin.from("core_identities").select("secret_enc").eq("profile_id", me.id).eq("provider", "google_calendar").maybeSingle();
  if (ident?.secret_enc) await revokeToken(ident.secret_enc);
  await admin.from("core_identities").delete().eq("profile_id", me.id).eq("provider", "google_calendar");
  await admin.from("rh_availability").delete().eq("profile_id", me.id).eq("source", "calendar");
  revalidatePath("/me/settings");
}

export async function leaveOrg(orgId: string) {
  const me = await requireMe();
  await leaveOrganization(orgId, me.id);
  revalidatePath("/me/settings");
  revalidatePath("/me");
}

export async function deleteMyAccount(formData: FormData) {
  const me = await requireMe();
  if (String(formData.get("confirm") ?? "") !== "退会") throw new Error("確認のため「退会」と入力してください");
  await deleteAccount(me.id);
  const supa = await supabaseServer();
  await supa.auth.signOut();
  redirect("/rehearsal?deleted=1");
}

export async function signOut() {
  const supa = await supabaseServer();
  await supa.auth.signOut();
  redirect("/login");
}
