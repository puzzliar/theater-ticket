import Link from "next/link";
import { requireSessionUser } from "@/lib/core/session";
import { getMySite, listCredits, syncAutoCredits, LINK_KEYS, LINK_LABEL } from "@/lib/rehearsal/site";
import { CREDIT_KIND_LABEL, type CreditKind } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";
import CopyButton from "@/components/CopyButton";
import { saveSite, uploadPhoto, removePhoto, saveCredit, deleteCredit, toggleCredit } from "./actions";

export const dynamic = "force-dynamic";

// キャスト公式サイトの編集。URL 名・紹介・写真・リンク・出演履歴(公演から自動 + 手入力)
export default async function MySitePage() {
  const me = await requireSessionUser("/me/site");
  await syncAutoCredits(me.id);
  const [site, credits] = await Promise.all([getMySite(me.id), listCredits(me.id)]);
  const input = "w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm";
  const small = "rounded-lg border border-line-strong bg-surface-2 px-2 py-1 text-xs";
  const url = site ? `${SITE_URL}/${site.handle}` : null;
  const kinds = Object.keys(CREDIT_KIND_LABEL) as CreditKind[];

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-dim"><Link href="/me" className="hover:text-fg">← マイスケジュール</Link></p>
        <h1 className="text-2xl font-bold">公式サイト</h1>
        <p className="mt-1 text-sm text-muted">あなたの出演履歴と近日の出演をまとめた公開ページを作れます。出演履歴は参加した公演から自動で積み上がり、ZAGUMI 以前の経歴は手で追加できます。</p>
        {url && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs ${site!.is_public ? "bg-emerald-500/20 text-emerald-300" : "bg-surface-2 text-muted"}`}>{site!.is_public ? "公開中" : "非公開"}</span>
            <a href={url} target="_blank" rel="noopener" className="break-all font-mono text-accent hover:underline">{url}</a>
            <CopyButton text={url} label="URL をコピー" className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs hover:bg-line-strong" />
          </div>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">基本情報</h2>
        <form action={saveSite} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
          <label className="text-sm">URL 名
            <div className="mt-1 flex items-center gap-1 text-sm text-muted"><span className="shrink-0">{SITE_URL.replace(/^https?:\/\//, "")}/</span><input name="handle" required defaultValue={site?.handle ?? ""} placeholder="hanako" pattern="[a-z0-9][a-z0-9_-]{2,29}" className={input} /></div>
          </label>
          <label className="text-sm">肩書き・ひとこと<input name="headline" defaultValue={site?.headline ?? ""} placeholder="俳優 ／ 東京を中心に小劇場・イマーシブで活動" className={`${input} mt-1`} /></label>
          <label className="text-sm sm:col-span-2">プロフィール文<textarea name="bio" rows={6} defaultValue={site?.bio ?? ""} placeholder="経歴、得意なこと、出演のご依頼について など" className={`${input} mt-1`} /></label>
          {LINK_KEYS.map((k) => (
            <label key={k} className="text-sm">{LINK_LABEL[k]}<input name={`link_${k}`} defaultValue={site?.links?.[k] ?? ""} placeholder="https://" className={`${input} mt-1`} /></label>
          ))}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="show_upcoming" defaultChecked={site?.show_upcoming ?? true} /> 近日の出演(本番の予定)を載せる</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_public" defaultChecked={site?.is_public ?? false} /> ページを公開する</label>
          <div className="sm:col-span-2"><button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">保存</button></div>
          <p className="text-xs text-dim sm:col-span-2">表示名は <Link href="/me/settings" className="underline">アカウント設定</Link> の表示名が使われます。近日の出演には、公開中の出演履歴に含まれる公演の本番だけが載ります(仮押さえや不参加のものは載りません)。</p>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">写真</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {site?.photo_url ? <img src={site.photo_url} alt="" className="h-32 w-32 rounded-full object-cover" /> : <div className="flex h-32 w-32 items-center justify-center rounded-full bg-surface-2 text-xs text-dim">写真なし</div>}
          <div className="space-y-2 text-sm">
            {site ? (
              <>
                <form action={uploadPhoto} className="flex flex-wrap items-center gap-2">
                  <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="text-xs" />
                  <button className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs hover:bg-line-strong">アップロード</button>
                </form>
                {site.photo_url && <form action={removePhoto}><button className="text-xs text-dim hover:text-red-400">写真を削除</button></form>}
                <p className="text-xs text-dim">JPEG・PNG・WebP、3MB まで。正方形に近い画像がきれいに表示されます。</p>
              </>
            ) : (
              <p className="text-xs text-dim">先に基本情報を保存すると写真を登録できます。</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">出演履歴 ({credits.length})</h2>
        <p className="text-sm text-muted">参加している公演は自動で並びます(公演名・団体名・期間は公演の情報に追従。役名と公開設定はここで編集)。載せたくないものは非公開にできます。</p>
        <div className="space-y-2">
          {credits.map((c) => (
            <details key={c.id} className={`rounded-xl border border-line bg-surface p-3 text-sm ${c.is_public ? "" : "opacity-60"}`}>
              <summary className="cursor-pointer">
                <span className="font-medium">{c.title}</span>
                <span className="ml-2 text-xs text-muted">{c.role_name && `${c.role_name} ／ `}{c.org_name && `${c.org_name} ／ `}{c.started_on ?? "日程未定"}{c.ended_on && c.ended_on !== c.started_on && `〜${c.ended_on}`} ／ {CREDIT_KIND_LABEL[c.kind]}</span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${c.source === "auto" ? "bg-sky-500/20 text-sky-300" : "bg-surface-2 text-muted"}`}>{c.source === "auto" ? "公演から自動" : "手入力"}</span>
                {!c.is_public && <span className="ml-2 text-xs text-dim">非公開</span>}
              </summary>
              <form action={saveCredit.bind(null, c.id)} className="mt-3 grid gap-2 sm:grid-cols-3">
                {c.source === "manual" && <input name="title" required defaultValue={c.title} placeholder="作品名" className={`${small} sm:col-span-2`} />}
                {c.source === "manual" && <input name="org_name" defaultValue={c.org_name} placeholder="団体・主催" className={small} />}
                {c.source === "manual" && <label className="text-xs text-muted">開始<input name="started_on" type="date" defaultValue={c.started_on ?? ""} className={`${small} mt-1 w-full`} /></label>}
                {c.source === "manual" && <label className="text-xs text-muted">終了<input name="ended_on" type="date" defaultValue={c.ended_on ?? ""} className={`${small} mt-1 w-full`} /></label>}
                <input name="role_name" defaultValue={c.role_name} placeholder="役名" className={small} />
                <select name="kind" defaultValue={c.kind} className={small}>{kinds.map((k) => <option key={k} value={k}>{CREDIT_KIND_LABEL[k]}</option>)}</select>
                <input name="venue" defaultValue={c.venue} placeholder="会場" className={small} />
                <input name="url" defaultValue={c.url} placeholder="公演サイトなどの URL" className={small} />
                <input name="note" defaultValue={c.note} placeholder="メモ(例: 主演、作・演出も担当)" className={`${small} sm:col-span-2`} />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_public" defaultChecked={c.is_public} /> 公開</label>
                <div className="flex items-center gap-3 sm:col-span-3">
                  <button className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs hover:bg-line-strong">保存</button>
                  <button formAction={toggleCredit.bind(null, c.id, !c.is_public)} className="text-xs text-muted hover:underline">{c.is_public ? "非公開にする" : "公開にする"}</button>
                  {c.source === "manual" && <button formAction={deleteCredit.bind(null, c.id)} className="text-xs text-dim hover:text-red-400">削除</button>}
                </div>
              </form>
            </details>
          ))}
        </div>
        <form action={saveCredit.bind(null, null)} className="grid gap-2 rounded-xl border border-dashed border-line-strong p-4 text-sm sm:grid-cols-3">
          <p className="font-medium sm:col-span-3">過去の出演を追加</p>
          <input name="title" required placeholder="作品名" className={`${small} sm:col-span-2`} />
          <input name="org_name" placeholder="団体・主催" className={small} />
          <input name="role_name" placeholder="役名" className={small} />
          <select name="kind" defaultValue="stage" className={small}>{kinds.map((k) => <option key={k} value={k}>{CREDIT_KIND_LABEL[k]}</option>)}</select>
          <input name="venue" placeholder="会場" className={small} />
          <label className="text-xs text-muted">開始<input name="started_on" type="date" className={`${small} mt-1 w-full`} /></label>
          <label className="text-xs text-muted">終了<input name="ended_on" type="date" className={`${small} mt-1 w-full`} /></label>
          <input name="url" placeholder="URL(任意)" className={small} />
          <input name="note" placeholder="メモ" className={`${small} sm:col-span-2`} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_public" defaultChecked /> 公開</label>
          <div className="sm:col-span-3"><button className="rounded-lg bg-surface-3 px-4 py-2 text-sm hover:bg-line-strong">追加</button></div>
        </form>
      </section>
    </div>
  );
}
