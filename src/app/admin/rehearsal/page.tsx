import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MEMBER_KIND_LABEL, type MemberRow, type ProductionRow } from "@/lib/rehearsal/types";
import { createProduction, createMember, toggleMemberActive, updateProductionStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ProductionRow["status"], string> = {
  planning: "準備中",
  rehearsing: "稽古中",
  running: "公演中",
  closed: "終了",
};

export default async function RehearsalAdminHome() {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");
  const admin = supabaseAdmin();
  const [{ data: productions }, { data: members }, { data: events }] = await Promise.all([
    admin.from("rh_productions").select("*, rh_production_members(member_id)").order("created_at", { ascending: false }),
    admin.from("rh_members").select("*").order("name"),
    admin.from("tk_events").select("id, name").order("created_at", { ascending: false }),
  ]);
  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-neutral-500">
          <Link href="/admin" className="hover:text-neutral-300">← 主催ダッシュボード</Link>
          {" ／ "}
          <Link href="/admin/rehearsal/availability" className="text-amber-400 hover:underline">空き時間マトリクス</Link>
          {" ／ "}
          <Link href="/me" className="text-amber-400 hover:underline">自分の予定</Link>
        </p>
        <h1 className="text-2xl font-bold">稽古・シフト管理</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">プロダクション</h2>
        {(productions ?? []).length === 0 && <p className="text-sm text-neutral-400">まだありません。下のフォームから作成してください。</p>}
        <div className="grid gap-3">
          {((productions ?? []) as (ProductionRow & { rh_production_members: { member_id: string }[] })[]).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <Link href={`/admin/rehearsal/p/${p.id}`} className="hover:text-amber-300">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{p.rh_production_members.length}名{p.opens_on && ` ／ 初日 ${p.opens_on}`}</span>
              </Link>
              <div className="flex items-center gap-2 text-xs">
                {(Object.keys(STATUS_LABEL) as ProductionRow["status"][]).map((s) => (
                  <form key={s} action={updateProductionStatus.bind(null, p.id, s)}>
                    <button className={`rounded px-2 py-1 ${p.status === s ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}>{STATUS_LABEL[s]}</button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
        <form action={createProduction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 font-medium">新しいプロダクション</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" required placeholder="公演名(例: 秋公演『○○』)" className={inputCls} />
            <select name="tk_event_id" className={inputCls}>
              <option value="">チケット公演と紐づけない</option>
              {(events ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <label className="text-xs text-neutral-400">稽古開始日<input name="rehearsal_starts_on" type="date" className={`${inputCls} mt-1 w-full`} /></label>
            <label className="text-xs text-neutral-400">初日<input name="opens_on" type="date" className={`${inputCls} mt-1 w-full`} /></label>
            <input name="default_location" placeholder="既定の稽古場所" className={inputCls} />
            <input name="note" placeholder="メモ" className={inputCls} />
          </div>
          <button className="mt-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">作成</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">メンバー(公演横断)</h2>
        <p className="text-sm text-neutral-400">キャスト・スタッフは組織内で1人1レコード。複数のプロダクションに参加できます。ログインアカウント(メール)を紐づけると本人が予定を見られます。</p>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs text-neutral-400">
              <tr><th className="p-2">氏名</th><th className="p-2">区分</th><th className="p-2">ログイン</th><th className="p-2">LINE</th><th className="p-2">状態</th></tr>
            </thead>
            <tbody>
              {((members ?? []) as MemberRow[]).map((m) => (
                <tr key={m.id} className={`border-t border-neutral-800 ${m.is_active ? "" : "text-neutral-600"}`}>
                  <td className="p-2">{m.name}</td>
                  <td className="p-2">{MEMBER_KIND_LABEL[m.kind]}</td>
                  <td className="p-2 text-xs">{m.user_id ? <span className="text-emerald-400">紐づけ済み</span> : m.email ? <span className="text-yellow-500">未登録({m.email})</span> : <span className="text-neutral-500">なし</span>}</td>
                  <td className="p-2 text-xs">{m.line_user_id ? <span className="text-emerald-400">連携済み</span> : <span className="text-neutral-500">未連携</span>}</td>
                  <td className="p-2 text-xs">
                    <form action={toggleMemberActive.bind(null, m.id, !m.is_active)}>
                      <button className="text-neutral-500 hover:text-neutral-300 hover:underline">{m.is_active ? "無効にする" : "有効にする"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={createMember} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 font-medium">メンバーを追加</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="name" required placeholder="氏名" className={inputCls} />
            <select name="kind" className={inputCls}>
              <option value="cast">キャスト</option>
              <option value="staff">スタッフ</option>
              <option value="director">演出</option>
            </select>
            <input name="email" type="email" placeholder="ログイン用メール(任意)" className={inputCls} />
            <button className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">追加</button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">メールが既存のアカウント(主催ダッシュボードで発行)と一致すれば自動で紐づきます。一致しない場合はメール通知先として保持します。</p>
        </form>
      </section>
    </div>
  );
}
