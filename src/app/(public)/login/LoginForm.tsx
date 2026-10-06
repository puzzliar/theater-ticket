"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOME_AFTER_LOGIN, IS_REHEARSAL } from "@/lib/app";

const ERROR_TEXT: Record<string, string> = {
  auth: "ログイン処理に失敗しました。もう一度お試しください。",
  line: "LINE ログインに失敗しました。",
  line_state: "LINE ログインの確認に失敗しました。もう一度お試しください。",
  line_not_configured: "この環境では LINE ログインは利用できません。",
  login_required: "先にログインしてください。",
};

// ログイン画面。ZAGUMIアカウントはスケジュール・チケットで共通(同じ Supabase Auth)だが、画面と遷移先はサービスごと
export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") && sp.get("next")!.startsWith("/") ? sp.get("next")! : HOME_AFTER_LOGIN;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(sp.get("error") ? (ERROR_TEXT[sp.get("error")!] ?? "エラーが発生しました。") : null);
  const [busy, setBusy] = useState(false);
  const lineEnabled = IS_REHEARSAL && process.env.NEXT_PUBLIC_LINE_LOGIN_ENABLED === "true";

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError("ログインに失敗しました。メールアドレスとパスワードをご確認ください。");
      setBusy(false);
      return;
    }
    // スケジュールは初回設定(オンボーディング)を経由。チケットはロール別の振り分けへ
    router.push(IS_REHEARSAL ? `/onboarding?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  async function google() {
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError("Google ログインを開始できませんでした。");
      setBusy(false);
    }
  }

  const btn = "w-full rounded-lg px-4 py-2.5 font-semibold disabled:opacity-50";
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-bold">{IS_REHEARSAL ? "ログイン" : "関係者ログイン"}</h1>
        <p className="mt-1 text-sm text-muted">
          {IS_REHEARSAL ? "ZAGUMIアカウントでログインします。" : "主催・キャスト・受付スタッフ用のログインです。ZAGUMIアカウントでログインします。"}
        </p>
      </div>
      <div className="space-y-2">
        <button onClick={google} disabled={busy} className={`${btn} bg-white text-black hover:bg-neutral-200`}>Google でログイン</button>
        {lineEnabled && (
          <a href={`/auth/line?next=${encodeURIComponent(next)}`} className={`${btn} block bg-[#06C755] text-center text-white hover:opacity-90`}>LINE でログイン</a>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-dim"><span className="h-px flex-1 bg-surface-2" />または<span className="h-px flex-1 bg-surface-2" /></div>
      <form onSubmit={login} className="space-y-3">
        <input className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2" type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" disabled={busy} className={`${btn} bg-accent text-black hover:bg-accent-hover`}>{busy ? "ログイン中..." : "メールでログイン"}</button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      {IS_REHEARSAL && (
        <p className="text-center text-sm text-muted">
          アカウントをお持ちでない方は <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">新規登録</Link>
        </p>
      )}
    </div>
  );
}
