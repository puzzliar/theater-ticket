"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/core/session";
import { createShare, normalizeOptions, revokeShare } from "@/lib/rehearsal/availability-text";
import { jstDateString } from "@/lib/rehearsal/time";

async function requireMe() {
  const me = await getSessionUser();
  if (!me) throw new Error("ログインが必要です");
  return me;
}

export async function newShare(formData: FormData) {
  const me = await requireMe();
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const opts = normalizeOptions({ fromDate: s("from"), toDate: s("to"), windowFrom: s("window_from"), windowTo: s("window_to"), emptyMark: s("empty") === "−" ? "−" : "○" }, jstDateString());
  await createShare(me.id, opts, s("label"), Number(formData.get("days") ?? 14) || 14);
  revalidatePath("/me/availability");
}

export async function removeShare(id: string) {
  const me = await requireMe();
  await revokeShare(id, me.id);
  revalidatePath("/me/availability");
}
