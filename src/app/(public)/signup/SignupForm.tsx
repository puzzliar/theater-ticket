"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignupForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") && sp.get("next")!.startsWith("/") ? sp.get("next")! : "/me";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return setError("利用規約とプライバシーポリシーへの同意が必要です。");
    if (password.length < 8) return setError("パスワードは 8 文字以上にしてください。");
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message.includes("already") ? "このメールアドレスは既に登録されています。ログインしてください。" : "登録に失敗しました。時間をおいて再度お試しください。");
      setBusy(false);
      return;
    }
    if (data.session) {
      router.push(`/onboarding?next=${encodeURIComponent(next)}`);
      router.refresh();
      return;
    }
    setSent(true);
    setBusy(false);
  }

  async function google() {
    setBusy(true);
    await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-xl font-bold">確認メールを送信しました</h1>
        <p className="text-sm text-fg-2">{email} 宛に確認メールを送りました。メール内のリンクを開くと登録が完了します。</p>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2";
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-bold">新規登録</h1>
        <p className="mt-1 text-sm text-muted">ZAGUMIスケジュールは無料で使えます。1 つの ZAGUMIアカウントで複数の座組(劇団)に参加できます。</p>
      </div>
      <button onClick={google} disabled={busy} className="w-full rounded-lg bg-white px-4 py-2.5 font-semibold text-accent-ink hover:bg-neutral-200 disabled:opacity-50">Google で登録</button>
      {process.env.NEXT_PUBLIC_LINE_LOGIN_ENABLED === "true" && (
        <a href={`/auth/line?next=${encodeURIComponent(next)}`} className="block w-full rounded-lg bg-[#06C755] px-4 py-2.5 text-center font-semibold text-white hover:opacity-90">LINE で登録</a>
      )}
      <div className="flex items-center gap-3 text-xs text-dim"><span className="h-px flex-1 bg-surface-2" />または<span className="h-px flex-1 bg-surface-2" /></div>
      <form onSubmit={signup} className="space-y-3">
        <input className={input} placeholder="表示名(芸名可)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={input} type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="パスワード(8文字以上)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <label className="flex items-start gap-2 text-xs text-fg-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>
            <Link href="/terms" target="_blank" className="text-accent hover:underline">利用規約</Link> と <Link href="/privacy" target="_blank" className="text-accent hover:underline">プライバシーポリシー</Link> に同意します
          </span>
        </label>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50">{busy ? "登録中..." : "メールで登録"}</button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      <p className="text-center text-sm text-muted">
        登録済みの方は <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">ログイン</Link>
      </p>
    </div>
  );
}
