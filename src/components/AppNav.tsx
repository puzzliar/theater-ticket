"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // 1 文字の記号(絵文字は使わない)
  match?: "exact" | "prefix";
}

// サイドバー / モバイル下部タブ。現在地の強調だけクライアントで行う
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.match === "prefix" ? pathname.startsWith(it.href) : pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-xs ${active ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg-2"}`}>{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-bg/90 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => {
        const active = it.match === "prefix" ? pathname.startsWith(it.href) : pathname === it.href;
        return (
          <Link key={it.href} href={it.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${active ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg-2"}`}>{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
