"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignupPage() {
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
        <p className="text-sm text-neutral-300">{email} 宛に確認メールを送りました。メール内のリンクを開くと登録が完了します。</p>
      </div>
    );
  }

  const input = "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2";
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-bold">新規登録</h1>
        <p className="mt-1 text-sm text-neutral-400">稽古管理は無料で使えます。1 つのアカウントで複数の劇団に参加できます。</p>
      </div>
      <button onClick={google} disabled={busy} className="w-full rounded-md bg-white px-4 py-2.5 font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">Google で登録</button>
      {process.env.NEXT_PUBLIC_LINE_LOGIN_ENABLED === "true" && (
        <a href={`/auth/line?next=${encodeURIComponent(next)}`} className="block w-full rounded-md bg-[#06C755] px-4 py-2.5 text-center font-semibold text-white hover:opacity-90">LINE で登録</a>
      )}
      <div className="flex items-center gap-3 text-xs text-neutral-500"><span className="h-px flex-1 bg-neutral-800" />または<span className="h-px flex-1 bg-neutral-800" /></div>
      <form onSubmit={signup} className="space-y-3">
        <input className={input} placeholder="表示名(芸名可)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={input} type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="パスワード(8文字以上)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <label className="flex items-start gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>
            <Link href="/terms" target="_blank" className="text-amber-400 hover:underline">利用規約</Link> と <Link href="/privacy" target="_blank" className="text-amber-400 hover:underline">プライバシーポリシー</Link> に同意します
          </span>
        </label>
        <button type="submit" disabled={busy} className="w-full rounded-md bg-amber-500 px-4 py-2.5 font-semibold text-black hover:bg-amber-400 disabled:opacity-50">{busy ? "登録中..." : "メールで登録"}</button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      <p className="text-center text-sm text-neutral-400">
        登録済みの方は <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-amber-400 hover:underline">ログイン</Link>
      </p>
    </div>
  );
}
