import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionUser, listMyOrgs } from "@/lib/core/session";
import { getAppUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PUZZLIAR チケット",
  description: "小劇場公演のチケット販売",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  const orgs = session ? await listMyOrgs(session.id) : [];
  const ticketUser = session ? await getAppUser() : null;
  return (
    <html lang="ja">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-wide">
              🎫 PUZZLIAR チケット
            </Link>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
              {session ? (
                <>
                  <Link href="/me" className="hover:text-neutral-100">稽古予定</Link>
                  {orgs.map((o) => (
                    <Link key={o.org.id} href={`/o/${o.org.slug}`} className="rounded border border-neutral-800 px-2 py-0.5 hover:text-neutral-100">{o.org.name}</Link>
                  ))}
                  {ticketUser && <Link href="/portal?to=ticket" className="hover:text-neutral-100">チケット</Link>}
                  {session.profile.is_platform_admin && <Link href="/platform" className="hover:text-neutral-100">運営</Link>}
                  <Link href="/me/settings" className="hover:text-neutral-100">{session.profile.display_name || "設定"}</Link>
                </>
              ) : (
                <>
                  <Link href="/rehearsal" className="hover:text-neutral-100">稽古管理とは</Link>
                  <Link href="/login" className="hover:text-neutral-100">ログイン</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl space-x-3 px-4 py-10 text-center text-xs text-neutral-600">
          <span>© PUZZLIAR</span>
          <Link href="/terms" className="hover:text-neutral-400">利用規約</Link>
          <Link href="/privacy" className="hover:text-neutral-400">プライバシーポリシー</Link>
        </footer>
      </body>
    </html>
  );
}
