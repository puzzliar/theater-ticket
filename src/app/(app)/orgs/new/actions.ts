"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/core/session";
import { createOrganization, OrgError } from "@/lib/core/orgs";
import type { OrgKind } from "@/lib/core/types";

export async function createOrg(formData: FormData) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/orgs/new");
  const kind = String(formData.get("kind") ?? "troupe") as OrgKind;
  let org;
  try {
    org = await createOrganization(me.profile, {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      kind: ["troupe", "producer", "individual", "other"].includes(kind) ? kind : "troupe",
      region: String(formData.get("region") ?? ""),
      code: String(formData.get("code") ?? ""),
    });
  } catch (e) {
    if (e instanceof OrgError) redirect(`/orgs/new?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/o/${org.slug}?created=1`);
}
