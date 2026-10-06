import Link from "next/link";
import { getSessionUser, listMyOrgs } from "@/lib/core/session";
import { isAdminRole } from "@/lib/core/types";
import { MobileNav, SidebarNav, type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

// ログイン後の画面共通のシェル: 左サイドバー(デスクトップ) / 下部タブ(モバイル)。
// 未ログインのときは各ページがログインへ送るので、ここでは素通しする
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) return <>{children}</>;
  const orgs = await listMyOrgs(session.id);
  const personal = orgs.find((o) => o.org.kind === "personal");
  const troupes = orgs.filter((o) => o.org.kind !== "personal");
  const items: NavItem[] = [
    { href: "/me", label: "マイスケジュール", icon: "予" },
    { href: "/me/availability", label: "空き状況を伝える", icon: "○" },
    { href: personal ? `/o/${personal.org.slug}` : "/me#self", label: "セルフ公演", icon: "自" },
    { href: "/me/site", label: "公式サイト", icon: "頁" },
    { href: "/me/settings", label: "設定", icon: "設" },
  ];
  const mobile: NavItem[] = [items[0], items[1], items[3], items[4]];

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 pb-20 pt-6 md:pb-10">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-20 space-y-6">
          <SidebarNav items={items} />
          <div>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-dim">座組</p>
            <div className="flex flex-col gap-0.5">
              {troupes.length === 0 && <p className="px-2.5 py-1 text-xs text-dim">まだ参加していません</p>}
              {troupes.map((o) => (
                <Link key={o.org.id} href={`/o/${o.org.slug}`} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  <span className="truncate">{o.org.name}</span>
                  {isAdminRole(o.role) && <span className="shrink-0 rounded bg-surface-3 px-1 text-[10px] text-fg-2">管理</span>}
                </Link>
              ))}
              <Link href="/orgs/new" className="rounded-lg px-2.5 py-1.5 text-xs text-dim hover:text-fg">＋ 座組を作る</Link>
              {session.profile.is_platform_admin && <Link href="/platform" className="rounded-lg px-2.5 py-1.5 text-xs text-dim hover:text-fg">運営</Link>}
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <MobileNav items={mobile} />
    </div>
  );
}
