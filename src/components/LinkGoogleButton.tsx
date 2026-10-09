"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// ログインに使う Google アカウントを追加する(Supabase Auth の identity linking)。
// ログアウトせずに別の Google アカウントを同じ ZAGUMIアカウントに結びつける
export default function LinkGoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function link() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/me/settings?google_login=linked")}`, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setError(/manual linking/i.test(error.message) ? "この環境ではアカウントの追加が有効になっていません(Supabase の Manual linking を ON にしてください)。" : `追加できませんでした: ${error.message}`);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={link} disabled={busy} className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2 disabled:opacity-50">Google アカウントを追加</button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
