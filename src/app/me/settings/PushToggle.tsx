"use client";

import { useEffect, useState } from "react";

// Web プッシュの購読 ON/OFF(無料の通知チャネル)。iOS はホーム画面に追加した PWA でのみ利用可
export default function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<"unsupported" | "checking" | "off" | "on" | "denied">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      await Promise.resolve(); // 外部システム(SW/Push API)の状態確認は非同期に行う
      if (cancelled) return;
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported") return <p className="text-xs text-neutral-500">この端末・ブラウザではプッシュ通知を利用できません(iPhone はホーム画面に追加してから開いてください)。</p>;
  if (state === "denied") return <p className="text-xs text-yellow-500">通知がブロックされています。ブラウザの設定で許可してください。</p>;
  if (state === "checking") return <p className="text-xs text-neutral-500">確認中...</p>;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={state === "on" ? "text-emerald-400" : "text-neutral-400"}>{state === "on" ? "この端末で受信中" : "未設定"}</span>
      {state === "on" ? (
        <button onClick={disable} disabled={busy} className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50">この端末で受信をやめる</button>
      ) : (
        <button onClick={enable} disabled={busy} className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50">この端末で受信する</button>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
