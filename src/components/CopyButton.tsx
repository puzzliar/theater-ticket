"use client";

import { useState } from "react";

// テキストをクリップボードにコピーするボタン(空き状況テキストなど)
export default function CopyButton({ text, label = "コピー", className = "" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" onClick={copy} className={className || "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"}>
      {state === "done" ? "コピーしました" : state === "error" ? "コピーできませんでした" : label}
    </button>
  );
}
