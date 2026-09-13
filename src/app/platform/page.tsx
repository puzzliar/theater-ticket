import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/core/session";
import { organizerCodeRequired } from "@/lib/core/orgs";
import type { OrganizationRow, OrganizerCodeRow } from "@/lib/core/types";
import { fmtDate } from "@/lib/rehearsal/time";
import { createOrganizerCode, deleteOrganizerCode, setOrgStatus } from "./actions";

export const dynamic = "force-dynamic";

// 運営画面: 主催者コード(招待制)の発行と組織一覧
export default async function PlatformPage() {
  await requirePlatformAdmin();
  const admin = supabaseAdmin();
  const [{ data: codes }, { data: orgs }, { count: profiles }] = await Promise.all([
    admin.from("core_organizer_codes").select("*").order("created_at", { ascending: false }),
    admin.from("core_organizations").select("*, core_org_members(profile_id)").order("created_at", { ascending: false }),
    admin.from("core_profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const input = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">運営</h1>
        <p className="text-sm text-neutral-400">アカウント {profiles ?? 0} 件 ／ 組織 {(orgs ?? []).length} 件 ／ 組織作成: {organizerCodeRequired() ? "招待制(主催者コード必須)" : "誰でも可(ORG_CREATION_OPEN=true)"}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">主催者コード</h2>
        <form action={createOrganizerCode} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <input name="note" placeholder="メモ(渡す相手など)" className={input} />
          <input name="max_uses" type="number" min={1} defaultValue={1} title="使用回数" className={`${input} w-20`} />
          <input name="days" type="number" min={0} defaultValue={30} title="有効日数(0=無期限)" className={`${input} w-20`} />
          <button className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400">発行</button>
        </form>
        <div className="space-y-1 text-sm">
          {((codes ?? []) as OrganizerCodeRow[]).map((c) => (
            <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-800 px-3 py-1.5">
              <span><span className="font-mono text-amber-300">{c.code}</span> <span className="text-neutral-400">{c.note}</span></span>
              <span className="text-xs text-neutral-500">{c.used_count}/{c.max_uses} 使用{c.expires_at && ` ／ 期限 ${fmtDate(c.expires_at)}`}</span>
              <form action={deleteOrganizerCode.bind(null, c.code)}><button className="text-xs text-neutral-500 hover:text-red-400">削除</button></form>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">組織</h2>
        <div className="space-y-1 text-sm">
          {((orgs ?? []) as (OrganizationRow & { core_org_members: { profile_id: string }[] })[]).map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-800 px-3 py-1.5">
              <span>{o.name} <span className="text-xs text-neutral-500">/{o.slug} ／ {o.core_org_members.length}名 ／ {o.status}</span></span>
              <div className="flex gap-2 text-xs">
                {o.status !== "active" && <form action={setOrgStatus.bind(null, o.id, "active")}><button className="text-emerald-400 hover:underline">有効化</button></form>}
                {o.status === "active" && <form action={setOrgStatus.bind(null, o.id, "suspended")}><button className="text-neutral-500 hover:text-red-400">凍結</button></form>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
