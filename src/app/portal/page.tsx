import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { getSessionUser } from "@/lib/core/session";

// ログイン後の振り分け。チケットシステムのロールを持つ人は従来どおり、それ以外は稽古管理の個人ビューへ
export const dynamic = "force-dynamic";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const sp = await searchParams;
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (sp.to === "ticket") {
    const user = await getAppUser();
    if (user?.role === "admin") redirect("/admin");
    if (user?.role === "cast") redirect("/cast");
    if (user?.role === "staff") redirect("/reception");
  }
  redirect("/me");
}
