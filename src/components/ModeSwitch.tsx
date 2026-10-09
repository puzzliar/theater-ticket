"use client";

import { usePathname } from "next/navigation";
import { switchMode } from "@/app/actions/mode";
import { MODE_LABEL, type Mode } from "@/lib/core/types";

// ヘッダーの出演者/主催者切り替え。座組ページ(/o/...)では同じページに留まり、それ以外はモードのホームへ
export default function ModeSwitch({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  const stay = pathname.startsWith("/o/") || pathname.startsWith("/me/settings");
  const modes: Mode[] = ["cast", "organizer"];
  return (
    <form action={switchMode} className="flex items-center rounded-full border border-line bg-surface p-0.5 text-xs" aria-label="利用モード">
      {stay && <input type="hidden" name="next" value={pathname} />}
      {modes.map((m) => (
        <button
          key={m}
          name="mode"
          value={m}
          aria-pressed={mode === m}
          className={`rounded-full px-3 py-1 font-medium ${mode === m ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </form>
  );
}
