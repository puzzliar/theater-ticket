"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/core/session";
import { acceptInvitation, OrgError } from "@/lib/core/orgs";
import type { Part } from "@/lib/core/types";

export async function accept(token: string, formData: FormData) {
  const me = await getSessionUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  if (!me.profile.onboarded_at) redirect(`/onboarding?next=${encodeURIComponent(`/join/${token}`)}`);
  const part = String(formData.get("part") ?? me.profile.default_part) as Part;
  let org;
  try {
    org = await acceptInvitation(token, me.profile, ["cast", "staff", "director", "organizer"].includes(part) ? part : "cast");
  } catch (e) {
    if (e instanceof OrgError) redirect(`/join/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/o/${org.slug}?joined=1`);
}
