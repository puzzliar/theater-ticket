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
import type { Mode, Part } from "@/lib/core/types";
import { isMode } from "@/lib/core/mode";
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

export async function disconnectGoogle(modeRaw: string) {
  const me = await requireMe();
  const mode: Mode = isMode(modeRaw) ? modeRaw : "cast";
  const admin = supabaseAdmin();
  await deleteAllEventsForProfile(me.id, mode);
  const { data: ident } = await admin.from("core_identities").select("secret_enc").eq("profile_id", me.id).eq("provider", "google_calendar").eq("mode", mode).maybeSingle();
  if (ident?.secret_enc) await revokeToken(ident.secret_enc);
  await admin.from("core_identities").delete().eq("profile_id", me.id).eq("provider", "google_calendar").eq("mode", mode);
  if (mode === "cast") await admin.from("rh_availability").delete().eq("profile_id", me.id).eq("source", "calendar");
  revalidatePath("/me/settings");
}

// ログインに使う Google アカウントの解除(Supabase Auth の identity)。最後の 1 つは外せない
export async function unlinkGoogleLogin(identityId: string) {
  await requireMe();
  const supa = await supabaseServer();
  const { data, error } = await supa.auth.getUserIdentities();
  if (error || !data) throw new Error("ログイン情報を取得できませんでした");
  const target = data.identities.find((i) => i.identity_id === identityId);
  if (!target) throw new Error("対象のアカウントが見つかりません");
  if (data.identities.length <= 1) throw new Error("ログイン手段が 1 つしかないため解除できません");
  const { error: e2 } = await supa.auth.unlinkIdentity(target);
  if (e2) throw new Error(e2.message);
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
  redirect("/?deleted=1");
}

export async function signOut() {
  const supa = await supabaseServer();
  await supa.auth.signOut();
  redirect("/login");
}
