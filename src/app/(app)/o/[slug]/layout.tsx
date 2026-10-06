import { requireOrg } from "@/lib/core/session";
import { ORG_KIND_LABEL } from "@/lib/core/types";
import { SidebarNav, type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

// 座組スコープのレイアウト。メンバーシップが無ければ 404。ページ見出しとタブ
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, isAdmin } = await requireOrg(slug);
  const tabs: NavItem[] = [
    { href: `/o/${slug}`, label: "公演", icon: "公" },
    { href: `/o/${slug}/members`, label: org.kind === "personal" ? "共演者・招待" : "メンバー", icon: "人", match: "prefix" },
    ...(isAdmin ? [{ href: `/o/${slug}/availability`, label: "空き時間", icon: "○", match: "prefix" as const }, { href: `/o/${slug}/settings`, label: "設定", icon: "設", match: "prefix" as const }] : []),
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-xs text-dim">{org.kind === "personal" ? "セルフ公演(自分で管理する公演)" : ORG_KIND_LABEL[org.kind]}</p>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
        </div>
        <div className="-mb-px [&_nav]:flex-row [&_nav]:gap-1">
          <SidebarNav items={tabs} />
        </div>
      </div>
      {children}
    </div>
  );
}
