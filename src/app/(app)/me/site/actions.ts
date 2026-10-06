"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { handleProblem, LINK_KEYS, normalizeHandle, publicPhotoUrl } from "@/lib/rehearsal/site";
import type { CreditKind } from "@/lib/rehearsal/types";

async function requireMe() {
  const me = await getSessionUser();
  if (!me) throw new Error("ログインが必要です");
  return me;
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const CREDIT_KINDS: CreditKind[] = ["stage", "immersive", "film", "tv", "voice", "dance", "music", "other"];

function normalizeUrl(v: string): string {
  if (!v) return "";
  const u = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export async function saveSite(formData: FormData) {
  const me = await requireMe();
  const handle = normalizeHandle(str(formData, "handle"));
  const problem = handleProblem(handle);
  if (problem) throw new Error(problem);
  const links: Record<string, string> = {};
  for (const k of LINK_KEYS) {
    const v = normalizeUrl(str(formData, `link_${k}`));
    if (v) links[k] = v;
  }
  const { error } = await supabaseAdmin()
    .from("rh_public_profiles")
    .upsert(
      {
        profile_id: me.id,
        handle,
        is_public: formData.get("is_public") === "on",
        headline: str(formData, "headline").slice(0, 80),
        bio: str(formData, "bio").slice(0, 2000),
        links,
        show_upcoming: formData.get("show_upcoming") === "on",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
  if (error) throw new Error(error.code === "23505" ? "その URL 名は既に使われています" : error.message);
  revalidatePath("/me/site");
  revalidatePath(`/${handle}`);
}

export async function uploadPhoto(formData: FormData) {
  const me = await requireMe();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new Error("画像を選んでください");
  if (file.size > 3 * 1024 * 1024) throw new Error("画像は 3MB 以下にしてください");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : null;
  if (!ext) throw new Error("JPEG・PNG・WebP の画像を選んでください");
  const admin = supabaseAdmin();
  const path = `profiles/${me.id}/photo-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from("zagumi-public").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
  const { data: current } = await admin.from("rh_public_profiles").select("photo_url").eq("profile_id", me.id).maybeSingle();
  const { error: upErr } = await admin.from("rh_public_profiles").update({ photo_url: publicPhotoUrl(path), updated_at: new Date().toISOString() }).eq("profile_id", me.id);
  if (upErr) throw new Error("先に URL 名を保存してください");
  // 古い写真は消す
  const old = current?.photo_url?.split("/zagumi-public/")[1];
  if (old && old !== path) await admin.storage.from("zagumi-public").remove([old]);
  revalidatePath("/me/site");
}

export async function removePhoto() {
  const me = await requireMe();
  const admin = supabaseAdmin();
  const { data: current } = await admin.from("rh_public_profiles").select("photo_url").eq("profile_id", me.id).maybeSingle();
  const old = current?.photo_url?.split("/zagumi-public/")[1];
  if (old) await admin.storage.from("zagumi-public").remove([old]);
  await admin.from("rh_public_profiles").update({ photo_url: null, updated_at: new Date().toISOString() }).eq("profile_id", me.id);
  revalidatePath("/me/site");
}

// 出演履歴の追加・編集。自動行(公演由来)は役名・公開・種別・URL・メモだけ編集できる
export async function saveCredit(creditId: string | null, formData: FormData) {
  const me = await requireMe();
  const admin = supabaseAdmin();
  const kind = str(formData, "kind") as CreditKind;
  const common = {
    role_name: str(formData, "role_name").slice(0, 80),
    kind: CREDIT_KINDS.includes(kind) ? kind : "stage",
    url: normalizeUrl(str(formData, "url")),
    note: str(formData, "note").slice(0, 300),
    is_public: formData.get("is_public") === "on",
    updated_at: new Date().toISOString(),
  };
  const manual = {
    title: str(formData, "title").slice(0, 120),
    org_name: str(formData, "org_name").slice(0, 80),
    venue: str(formData, "venue").slice(0, 80),
    started_on: str(formData, "started_on") || null,
    ended_on: str(formData, "ended_on") || null,
  };
  if (creditId) {
    const { data: cur } = await admin.from("rh_credits").select("source").eq("id", creditId).eq("profile_id", me.id).maybeSingle();
    if (!cur) throw new Error("履歴が見つかりません");
    const patch = cur.source === "auto" ? { ...common, venue: manual.venue } : { ...common, ...manual };
    if (cur.source === "manual" && !manual.title) throw new Error("作品名を入力してください");
    const { error } = await admin.from("rh_credits").update(patch).eq("id", creditId).eq("profile_id", me.id);
    if (error) throw new Error(error.message);
  } else {
    if (!manual.title) throw new Error("作品名を入力してください");
    const { error } = await admin.from("rh_credits").insert({ profile_id: me.id, source: "manual", ...common, ...manual });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/me/site");
}

export async function deleteCredit(creditId: string) {
  const me = await requireMe();
  await supabaseAdmin().from("rh_credits").delete().eq("id", creditId).eq("profile_id", me.id).eq("source", "manual");
  revalidatePath("/me/site");
}

export async function toggleCredit(creditId: string, isPublic: boolean) {
  const me = await requireMe();
  await supabaseAdmin().from("rh_credits").update({ is_public: isPublic, updated_at: new Date().toISOString() }).eq("id", creditId).eq("profile_id", me.id);
  revalidatePath("/me/site");
}
