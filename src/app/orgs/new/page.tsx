import Link from "next/link";
import { requireSessionUser } from "@/lib/core/session";
import { organizerCodeRequired } from "@/lib/core/orgs";
import { ORG_KIND_LABEL, type OrgKind } from "@/lib/core/types";
import { createOrg } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewOrgPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireSessionUser("/orgs/new");
  const sp = await searchParams;
  const needCode = organizerCodeRequired() && !me.profile.is_platform_admin;
  const input = "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-sm text-neutral-500"><Link href="/me" className="hover:text-neutral-300">← 稽古予定</Link></p>
        <h1 className="text-xl font-bold">劇団・団体を作成</h1>
        <p className="mt-1 text-sm text-neutral-400">作成した人がオーナーになります。メンバーは招待リンクで参加します。</p>
      </div>
      {sp.error && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{sp.error}</p>}
      <form action={createOrg} className="space-y-3">
        <label className="block text-sm">団体名<input name="name" required className={`${input} mt-1`} placeholder="例: 劇団○○" /></label>
        <label className="block text-sm">
          URL 名(英小文字・数字・ハイフン)
          <input name="slug" className={`${input} mt-1`} placeholder="例: gekidan-maru(空欄なら自動)" pattern="[a-z0-9][a-z0-9-]{1,30}" />
        </label>
        <label className="block text-sm">
          種別
          <select name="kind" className={`${input} mt-1`}>
            {(Object.keys(ORG_KIND_LABEL) as OrgKind[]).map((k) => <option key={k} value={k}>{ORG_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="block text-sm">活動地域(任意)<input name="region" className={`${input} mt-1`} placeholder="例: 東京" /></label>
        {needCode && (
          <label className="block text-sm">
            主催者コード
            <input name="code" required className={`${input} mt-1 font-mono`} placeholder="運営から受け取ったコード" />
            <span className="text-xs text-neutral-500">現在は招待制で運用しています。コードをお持ちでない方は運営までお問い合わせください。</span>
          </label>
        )}
        <button className="w-full rounded-md bg-amber-500 px-4 py-2.5 font-semibold text-black hover:bg-amber-400">作成する</button>
      </form>
    </div>
  );
}
