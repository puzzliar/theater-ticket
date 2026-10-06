"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/core/session";
import { acceptTransfer, TransferError } from "@/lib/rehearsal/transfer";

export async function accept(token: string, formData: FormData) {
  const me = await getSessionUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/handover/${token}`)}`);
  const toOrgId = String(formData.get("org_id") ?? "");
  if (!toOrgId) throw new Error("引き受ける座組を選んでください");
  let result: { toOrgSlug: string; productionId: string };
  try {
    result = await acceptTransfer(token, toOrgId, me);
  } catch (e) {
    if (e instanceof TransferError) redirect(`/handover/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/o/${result.toOrgSlug}/p/${result.productionId}?handover=1`);
}
