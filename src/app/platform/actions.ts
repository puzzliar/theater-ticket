"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";

async function requireAdmin() {
  const me = await getSessionUser();
  if (!me?.profile.is_platform_admin) throw new Error("運営権限が必要です");
  return me;
}

export async function createOrganizerCode(formData: FormData) {
  const me = await requireAdmin();
  const days = Number(formData.get("days") ?? 30);
  const code = `PZ-${randomBytes(4).toString("hex").toUpperCase()}`;
  await supabaseAdmin().from("core_organizer_codes").insert({
    code,
    note: String(formData.get("note") ?? "").trim(),
    max_uses: Math.max(1, Number(formData.get("max_uses") ?? 1) || 1),
    expires_at: days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null,
    created_by: me.id,
  });
  revalidatePath("/platform");
}

export async function deleteOrganizerCode(code: string) {
  await requireAdmin();
  await supabaseAdmin().from("core_organizer_codes").delete().eq("code", code);
  revalidatePath("/platform");
}

export async function setOrgStatus(orgId: string, status: "active" | "archived" | "suspended") {
  await requireAdmin();
  await supabaseAdmin().from("core_organizations").update({ status, updated_at: new Date().toISOString() }).eq("id", orgId);
  revalidatePath("/platform");
}
