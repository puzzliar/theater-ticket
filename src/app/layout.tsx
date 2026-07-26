import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PUZZLIAR チケット",
  description: "小劇場公演のチケット販売",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-wide">
              🎫 PUZZLIAR チケット
            </Link>
            <nav className="text-sm text-neutral-400">
              <Link href="/login" className="hover:text-neutral-100">
                関係者ログイン
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 py-10 text-center text-xs text-neutral-600">
          © PUZZLIAR
        </footer>
      </body>
    </html>
  );
}
