import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, IS_REHEARSAL } from "@/lib/app";
import { getSessionUser, listMyOrgs } from "@/lib/core/session";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

// サービスごとに独立したヘッダー。ZAGUMIスケジュールと ZAGUMIチケットは ZAGUMIアカウントを共有するが相互リンクは置かない
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {IS_REHEARSAL ? <RehearsalHeader /> : <TicketHeader />}
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl space-x-3 px-4 py-10 text-center text-xs text-neutral-600">
          <span>© PUZZLIAR</span>
          {IS_REHEARSAL && (
            <>
              <Link href="/terms" className="hover:text-neutral-400">利用規約</Link>
              <Link href="/privacy" className="hover:text-neutral-400">プライバシーポリシー</Link>
            </>
          )}
        </footer>
      </body>
    </html>
  );
}

function TicketHeader() {
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-wide">
          🎫 ZAGUMIチケット
        </Link>
        <nav className="text-sm text-neutral-400">
          <Link href="/login" className="hover:text-neutral-100">
            関係者ログイン
          </Link>
        </nav>
      </div>
    </header>
  );
}

async function RehearsalHeader() {
  const session = await getSessionUser();
  const orgs = session ? await listMyOrgs(session.id) : [];
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-wide">
          🎭 ZAGUMIスケジュール
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
          {session ? (
            <>
              <Link href="/me" className="hover:text-neutral-100">マイスケジュール</Link>
              {orgs.map((o) => (
                <Link key={o.org.id} href={`/o/${o.org.slug}`} className="rounded border border-neutral-800 px-2 py-0.5 hover:text-neutral-100">{o.org.name}</Link>
              ))}
              {session.profile.is_platform_admin && <Link href="/platform" className="hover:text-neutral-100">運営</Link>}
              <Link href="/me/settings" className="hover:text-neutral-100">{session.profile.display_name || "設定"}</Link>
            </>
          ) : (
            <>
              <Link href="/signup" className="hover:text-neutral-100">無料登録</Link>
              <Link href="/login" className="hover:text-neutral-100">ログイン</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
