import Link from "next/link";
import { requireOrg } from "@/lib/core/session";

export const dynamic = "force-dynamic";

// 組織スコープのレイアウト。メンバーシップが無ければ 404
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, isAdmin } = await requireOrg(slug);
  const link = "rounded px-2 py-1 hover:bg-neutral-800";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div>
          <p className="text-xs text-neutral-500"><Link href="/me" className="hover:text-neutral-300">← 自分の予定</Link></p>
          <h1 className="text-xl font-bold">{org.name}</h1>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm text-neutral-300">
          <Link href={`/o/${slug}`} className={link}>プロダクション</Link>
          <Link href={`/o/${slug}/members`} className={link}>メンバー</Link>
          {isAdmin && <Link href={`/o/${slug}/availability`} className={link}>空き時間</Link>}
          {isAdmin && <Link href={`/o/${slug}/settings`} className={link}>設定</Link>}
        </nav>
      </div>
      {children}
    </div>
  );
}
