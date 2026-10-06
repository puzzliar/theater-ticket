import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/core/session";
import { PART_LABEL, type Part } from "@/lib/core/types";
import { completeOnboarding } from "./actions";

export const dynamic = "force-dynamic";

// 初回設定: 表示名・区分・規約同意・空き時間共有の同意・マーケティング同意(任意)
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/me";
  const me = await requireSessionUser(`/onboarding?next=${encodeURIComponent(next)}`, { allowNotOnboarded: true });
  if (me.profile.onboarded_at) redirect(next);
  const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-bold">はじめに</h1>
        <p className="mt-1 text-sm text-muted">劇団のメンバーに表示される名前と、通知の前提を確認してください。</p>
      </div>
      <form action={completeOnboarding.bind(null, next)} className="space-y-4">
        <label className="block text-sm">
          表示名(芸名可)
          <input name="display_name" required defaultValue={me.profile.display_name} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm">
          主な関わり方
          <select name="default_part" defaultValue={me.profile.default_part} className={`${input} mt-1`}>
            {(Object.keys(PART_LABEL) as Part[]).map((p) => (
              <option key={p} value={p}>{PART_LABEL[p]}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="terms" required className="mt-0.5" />
            <span>
              <Link href="/terms" target="_blank" className="text-accent hover:underline">利用規約</Link> と <Link href="/privacy" target="_blank" className="text-accent hover:underline">プライバシーポリシー</Link> に同意します(必須)
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="sharing" required className="mt-0.5" />
            <span>登録した空き時間は、所属するすべての劇団の主催者に「来られる／来られない」の判定としてのみ共有されることを理解しました。他の劇団の予定の内容は共有されません(必須)</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="marketing" className="mt-0.5" />
            <span>ZAGUMI の他のサービス(チケット・物販・精算など)の案内を受け取る(任意)</span>
          </label>
        </div>
        <button className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:bg-accent-hover">はじめる</button>
      </form>
    </div>
  );
}
