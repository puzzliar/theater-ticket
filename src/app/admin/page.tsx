import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createEvent, createAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");

  const admin = supabaseAdmin();
  const [{ data: events }, { data: casts }] = await Promise.all([
    admin.from("tk_events").select("id, name, venue_name, is_published, created_at").order("created_at", { ascending: false }),
    admin.from("tk_casts").select("id, name, event_id, user_id"),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">主催ダッシュボード</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">公演</h2>
        <div className="grid gap-3">
          {(events ?? []).map((e) => (
            <Link
              key={e.id}
              href={`/admin/e/${e.id}`}
              className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 hover:border-accent/50"
            >
              <span>{e.name}</span>
              <span className={`text-sm ${e.is_published ? "text-emerald-400" : "text-dim"}`}>
                {e.is_published ? "公開中" : "非公開"}
              </span>
            </Link>
          ))}
        </div>
        <form action={createEvent} className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 font-medium">新しい公演を作成</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" required placeholder="公演名" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2" />
            <input name="venue_name" placeholder="会場名" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2" />
          </div>
          <textarea name="description" placeholder="公演説明(任意)" className="mt-2 w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2" rows={2} />
          <button className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">作成</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">アカウント発行(キャスト・スタッフ)</h2>
        <form action={createAccount} className="rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="email" type="email" required placeholder="メールアドレス" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2" />
            <input name="password" type="text" required placeholder="初期パスワード(8文字以上)" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2" />
            <input name="display_name" placeholder="表示名" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2" />
            <select name="role" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2">
              <option value="cast">キャスト</option>
              <option value="staff">受付スタッフ</option>
              <option value="admin">管理者</option>
            </select>
            <select name="cast_id" className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 sm:col-span-2">
              <option value="">(キャストの場合)紐づけるキャストを選択</option>
              {(casts ?? []).filter((c) => !c.user_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">アカウント作成</button>
          <p className="mt-2 text-xs text-dim">作成したメールアドレスとパスワードを本人に共有してください(招待制)。</p>
        </form>
      </section>
    </div>
  );
}
