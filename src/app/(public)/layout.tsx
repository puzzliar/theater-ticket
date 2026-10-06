import { IS_REHEARSAL } from "@/lib/app";

// ログイン前・公開ページの共通コンテナ(チケットモードでは root 側がコンテナを持つ)
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  if (!IS_REHEARSAL) return <>{children}</>;
  return <div className="mx-auto w-full max-w-4xl px-4 py-10">{children}</div>;
}
