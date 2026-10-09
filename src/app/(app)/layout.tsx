import Link from "next/link";
import { getSessionUser, listMyOrgs } from "@/lib/core/session";
import { getMode } from "@/lib/core/mode";
import { isAdminRole } from "@/lib/core/types";
import { MobileNav, SidebarNav, type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

// ログイン後の画面共通のシェル: 左サイドバー(デスクトップ) / 下部タブ(モバイル)。
// 出演者モードと主催者モードでメニューが変わる。未ログインのときは各ページがログインへ送るので素通しする
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) return <>{children}</>;
  const [orgs, mode] = await Promise.all([listMyOrgs(session.id), getMode(session)]);
  const personal = orgs.find((o) => o.org.kind === "personal");
  const troupes = orgs.filter((o) => o.org.kind !== "personal");
  const adminTroupes = troupes.filter((o) => isAdminRole(o.role));

  const castItems: NavItem[] = [
    { href: "/me", label: "マイスケジュール", icon: "予" },
    { href: "/me/availability", label: "空き状況を伝える", icon: "○" },
    { href: personal ? `/o/${personal.org.slug}` : "/me#self", label: "セルフ公演", icon: "自" },
    { href: "/me/site", label: "公式サイト", icon: "頁" },
    { href: "/me/settings", label: "設定", icon: "設" },
  ];
  const organizerItems: NavItem[] = [
    { href: "/manage", label: "主催ホーム", icon: "主" },
    ...adminTroupes.slice(0, 6).map((o) => ({ href: `/o/${o.org.slug}`, label: o.org.name, icon: "座", match: "prefix" as const })),
    { href: "/me/settings", label: "設定", icon: "設" },
  ];
  const items = mode === "organizer" ? organizerItems : castItems;
  const mobile: NavItem[] = mode === "organizer" ? [organizerItems[0], ...adminTroupes.slice(0, 2).map((o) => ({ href: `/o/${o.org.slug}`, label: o.org.name.slice(0, 6), icon: "座", match: "prefix" as const })), { href: "/me/settings", label: "設定", icon: "設" }] : [castItems[0], castItems[1], castItems[3], castItems[4]];

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 pb-20 pt-6 md:pb-10">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-20 space-y-6">
          <SidebarNav items={items} />
          {mode === "cast" ? (
            <div>
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-dim">参加している座組</p>
              <div className="flex flex-col gap-0.5">
                {troupes.length === 0 && <p className="px-2.5 py-1 text-xs text-dim">まだ参加していません</p>}
                {troupes.map((o) => (
                  <Link key={o.org.id} href={`/o/${o.org.slug}`} className="truncate rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">{o.org.name}</Link>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-dim">主催者メニュー</p>
              <div className="flex flex-col gap-0.5">
                <Link href="/orgs/new" className="rounded-lg px-2.5 py-1.5 text-xs text-dim hover:text-fg">＋ 座組を作る</Link>
                {session.profile.is_platform_admin && <Link href="/platform" className="rounded-lg px-2.5 py-1.5 text-xs text-dim hover:text-fg">運営</Link>}
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <MobileNav items={mobile} />
    </div>
  );
}
