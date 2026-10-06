import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, IS_REHEARSAL } from "@/lib/app";
import { getSessionUser } from "@/lib/core/session";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
};

// サービスごとに独立したシェル。ZAGUMIスケジュールと ZAGUMIチケットは ZAGUMIアカウントを共有するが相互リンクは置かない
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {IS_REHEARSAL ? <RehearsalTopBar /> : <TicketTopBar />}
        <main className={IS_REHEARSAL ? "" : "mx-auto max-w-4xl px-4 py-8"}>{children}</main>
        <footer className="mx-auto max-w-7xl space-x-4 px-4 py-10 text-center text-xs text-dim">
          <span>© PUZZLIAR</span>
          {IS_REHEARSAL && (
            <>
              <Link href="/terms" className="hover:text-fg">利用規約</Link>
              <Link href="/privacy" className="hover:text-fg">プライバシーポリシー</Link>
            </>
          )}
        </footer>
      </body>
    </html>
  );
}

function TicketTopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="ZAGUMIチケット" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/zagumi-ticket.svg" alt="ZAGUMIチケット" className="h-9 w-auto" />
        </Link>
        <nav className="text-sm text-muted">
          <Link href="/login" className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2 hover:text-fg">関係者ログイン</Link>
        </nav>
      </div>
    </header>
  );
}

async function RehearsalTopBar() {
  const session = await getSessionUser();
  const initial = (session?.profile.display_name ?? "?").slice(0, 1);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href={session ? "/me" : "/"} aria-label="ZAGUMIスケジュール" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/zagumi-schedule.svg" alt="ZAGUMIスケジュール" className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link href="/me/settings" className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-fg-2 hover:bg-surface-2 hover:text-fg">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{initial}</span>
              <span className="max-w-32 truncate">{session.profile.display_name || "設定"}</span>
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg">ログイン</Link>
              <Link href="/signup" className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink hover:bg-accent-hover">無料ではじめる</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
