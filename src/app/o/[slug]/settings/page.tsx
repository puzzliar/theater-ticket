import { requireOrg } from "@/lib/core/session";
import { ORG_KIND_LABEL, type OrgKind } from "@/lib/core/types";
import { updateOrg, archiveOrg, leaveOrg } from "../actions";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, membership } = await requireOrg(slug, "admin");
  const input = "w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="max-w-md space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">団体の設定</h2>
        <form action={updateOrg.bind(null, org.id)} className="space-y-3">
          <label className="block text-sm">団体名<input name="name" required defaultValue={org.name} className={`${input} mt-1`} /></label>
          <label className="block text-sm">種別<select name="kind" defaultValue={org.kind} className={`${input} mt-1`}>{(Object.keys(ORG_KIND_LABEL) as OrgKind[]).map((k) => <option key={k} value={k}>{ORG_KIND_LABEL[k]}</option>)}</select></label>
          <label className="block text-sm">活動地域<input name="region" defaultValue={org.region ?? ""} className={`${input} mt-1`} /></label>
          <p className="text-xs text-neutral-500">URL 名: /o/{org.slug}(変更できません)</p>
          <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">保存</button>
        </form>
      </section>
      <section className="space-y-2 border-t border-neutral-800 pt-6">
        <h2 className="text-lg font-semibold">この団体から離脱</h2>
        <p className="text-sm text-neutral-400">離脱しても過去の出欠記録は団体に残ります。唯一のオーナーは離脱できません。</p>
        <form action={leaveOrg.bind(null, org.id)}><button className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">離脱する</button></form>
      </section>
      {membership.role === "owner" && (
        <section className="space-y-2 border-t border-neutral-800 pt-6">
          <h2 className="text-lg font-semibold text-red-400">団体をアーカイブ</h2>
          <p className="text-sm text-neutral-400">団体を非表示にします。メンバーの稽古予定からも消えます。運営に依頼すれば復元できます。</p>
          <form action={archiveOrg.bind(null, org.id)}><button className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">アーカイブする</button></form>
        </section>
      )}
    </div>
  );
}
