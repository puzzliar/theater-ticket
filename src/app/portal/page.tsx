import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";

// ログイン後のロール別振り分け
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  if (user.role === "cast") redirect("/cast");
  redirect("/reception");
}
