import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMyOrgs, requireSessionUser } from "@/lib/core/session";
import { PART_LABEL, ROLE_LABEL, type IdentityRow, type Part } from "@/lib/core/types";
import { getSettings } from "@/lib/rehearsal/profile";
import { CHANNEL_LABEL, NOTIFY_KIND_LABEL, type NotifyChannel, type NotifyKind } from "@/lib/rehearsal/types";
import { googleConfigured } from "@/lib/google-calendar";
import { lineConfigured, lineAddFriendUrl } from "@/lib/line";
import { lineLoginConfigured } from "@/lib/line-login";
import { webpushConfigured } from "@/lib/webpush";
import { nowMs } from "@/lib/rehearsal/time";
import { SITE_URL } from "@/lib/constants";
import PushToggle from "./PushToggle";
import { updateProfile, updateNotifyPrefs, newLineCode, unlinkLine, importGoogleBusy, setFreebusyImport, disconnectGoogle, leaveOrg, deleteMyAccount, signOut } from "./actions";

export const dynamic = "force-dynamic";

const GOOGLE_MSG: Record<string, { cls: string; text: string }> = {
  connected: { cls: "text-emerald-400", text: "Google カレンダーと連携しました。今後の召集を登録し、カレンダーの予定を「不可」として取り込みました。" },
  denied: { cls: "text-yellow-500", text: "Google の認可がキャンセルされました。" },
  error: { cls: "text-red-400", text: "Google 連携に失敗しました。時間をおいて再度お試しください。" },
  state_mismatch: { cls: "text-red-400", text: "連携の確認に失敗しました。もう一度やり直してください。" },
  not_configured: { cls: "text-yellow-500", text: "Google 連携はこの環境では設定されていません。" },
};
const LINE_MSG: Record<string, { cls: string; text: string }> = {
  linked: { cls: "text-emerald-400", text: "LINE を連携しました。" },
  taken: { cls: "text-red-400", text: "その LINE アカウントは別のユーザーに連携されています。" },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; line?: string }> }) {
  const me = await requireSessionUser("/me/settings");
  const sp = await searchParams;
  const admin = supabaseAdmin();
  const [settings, orgs, { data: identities }] = await Promise.all([getSettings(me.id), listMyOrgs(me.id), admin.from("core_identities").select("*").eq("profile_id", me.id)]);
  const idents = (identities ?? []) as IdentityRow[];
  const line = idents.find((i) => i.provider === "line");
  const google = idents.find((i) => i.provider === "google_calendar");
  const lineCodeValid = settings.line_link_code && settings.line_link_expires_at && new Date(settings.line_link_expires_at).getTime() > nowMs();
  const icalUrl = `${SITE_URL}/api/ical/${settings.ical_token}`;
  const googleMsg = sp.google ? GOOGLE_MSG[sp.google] : undefined;
  const lineMsg = sp.line ? LINE_MSG[sp.line] : undefined;
  const input = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";
  const btn = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const kinds: NotifyKind[] = ["invite", "substitution", "digest", "reminder"];
  const channels: NotifyChannel[] = ["line", "webpush", "email", "none"];

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-neutral-500"><Link href="/me" className="hover:text-neutral-300">← 稽古予定</Link></p>
          <h1 className="text-2xl font-bold">アカウント設定</h1>
        </div>
        <form action={signOut}><button className="text-sm text-neutral-400 hover:underline">ログアウト</button></form>
      </div>

      <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">プロフィール</h2>
        <p className="text-xs text-neutral-500">{me.email ?? "(メールアドレス未登録)"}</p>
        <form action={updateProfile} className="flex flex-wrap items-center gap-2">
          <input name="display_name" defaultValue={me.profile.display_name} required className={input} placeholder="表示名" />
          <select name="default_part" defaultValue={me.profile.default_part} className={input}>
            {(Object.keys(PART_LABEL) as Part[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
          </select>
          <button className={`${btn} bg-neutral-700 hover:bg-neutral-600`}>保存</button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">通知の受け取り方</h2>
        <p className="text-xs text-neutral-400">種類ごとに希望のチャネルを選べます。選んだチャネルが使えない場合は LINE → プッシュ通知 → メールの順で代替します。LINE は無料枠の範囲で送るため、届かない場合はメールに切り替わります。</p>
        <form action={updateNotifyPrefs} className="grid gap-2 sm:grid-cols-2">
          {kinds.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-3 py-2 text-sm">
              {NOTIFY_KIND_LABEL[k]}
              <select name={`notify_${k}`} defaultValue={settings[`notify_${k}` as keyof typeof settings] as string} className={`${input} py-1`}>
                {channels.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </label>
          ))}
          <button className={`${btn} bg-neutral-700 hover:bg-neutral-600 sm:col-span-2`}>保存</button>
        </form>
        <div className="border-t border-neutral-800 pt-3">
          <p className="mb-1 text-sm font-medium">プッシュ通知(この端末)</p>
          {webpushConfigured() ? <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} /> : <p className="text-xs text-neutral-500">(この環境ではプッシュ通知は未設定です)</p>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">LINE</h2>
          {lineMsg && <p className={`text-sm ${lineMsg.cls}`}>{lineMsg.text}</p>}
          {line ? (
            <>
              <p className="text-sm text-emerald-400">連携済み{line.display_name && `(${line.display_name})`}。LINE で「今日」「今週」「参加」「不参加」「入れます」と送ると応答します。</p>
              {!lineConfigured() && <p className="text-xs text-yellow-500">(公式アカウントが未設定のため、通知はメール等で届きます)</p>}
              <form action={unlinkLine}><button className="text-xs text-neutral-500 hover:text-red-400">連携を解除</button></form>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-300">公式アカウントを友だち追加すると、LINE から予定の確認や出欠回答ができます。{lineAddFriendUrl() && <a href={lineAddFriendUrl()!} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">(友だち追加)</a>}</p>
              {lineLoginConfigured() && <a href="/auth/line?mode=link&next=/me/settings" className={`inline-block ${btn} bg-[#06C755] text-white`}>LINE アカウントで連携</a>}
              <div className="text-xs text-neutral-400">
                または、下のコードを LINE で「連携 123456」の形式で送信:
                {lineCodeValid ? <span className="ml-2 font-mono text-lg tracking-widest text-amber-300">{settings.line_link_code}</span> : <form action={newLineCode} className="mt-1"><button className={`${btn} bg-neutral-700 hover:bg-neutral-600`}>連携コードを発行(10分有効)</button></form>}
              </div>
            </>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">Google カレンダー</h2>
          {googleMsg && <p className={`text-sm ${googleMsg.cls}`}>{googleMsg.text}</p>}
          {googleConfigured() ? (
            google ? (
              <>
                <p className="text-sm text-emerald-400">連携済み{google.email && `(${google.email})`}。召集予定は即時にカレンダーへ登録・更新・削除されます。</p>
                <div className="flex items-center gap-2 text-sm text-neutral-300">
                  <form action={setFreebusyImport.bind(null, !settings.google_freebusy_import)}>
                    <button className={`rounded px-2 py-0.5 text-xs ${settings.google_freebusy_import ? "bg-emerald-500 text-black" : "bg-neutral-700"}`}>{settings.google_freebusy_import ? "ON" : "OFF"}</button>
                  </form>
                  <span>カレンダーの「予定あり」を空き時間の「不可」として毎朝取り込む(内容は取得しません)</span>
                </div>
                <div className="flex gap-3 text-xs">
                  {settings.google_freebusy_import && <form action={importGoogleBusy}><button className="text-amber-400 hover:underline">今すぐ取り込む</button></form>}
                  <form action={disconnectGoogle}><button className="text-neutral-500 hover:text-red-400">連携を解除(登録した予定も削除)</button></form>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-300">認可すると、所属するすべての劇団の召集が Google カレンダーに即時反映され、カレンダーの予定を空き時間として自動で取り込めます。</p>
                <a href="/api/google/connect" className={`inline-block ${btn} bg-amber-500 text-black hover:bg-amber-400`}>Google カレンダーと連携する</a>
              </>
            )
          ) : (
            <p className="text-xs text-yellow-500">(この環境では Google API 連携は未設定です。下の購読 URL をご利用ください)</p>
          )}
          <details className="pt-2">
            <summary className="cursor-pointer text-sm text-neutral-300">購読 URL で表示する(Google / Apple / Outlook)</summary>
            <p className="mt-1 break-all rounded bg-neutral-800 p-2 font-mono text-xs text-amber-300">{icalUrl}</p>
            <p className="text-xs text-neutral-500">本人専用の URL です。Google 側の更新は数時間遅れることがあります。</p>
          </details>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">所属している劇団</h2>
        {orgs.length === 0 && <p className="text-sm text-neutral-400">なし</p>}
        {orgs.map((o) => (
          <div key={o.org.id} className="flex items-center justify-between text-sm">
            <span><Link href={`/o/${o.org.slug}`} className="hover:underline">{o.org.name}</Link> <span className="text-xs text-neutral-500">{ROLE_LABEL[o.role]}／{PART_LABEL[o.part]}</span></span>
            <form action={leaveOrg.bind(null, o.org.id)}><button className="text-xs text-neutral-500 hover:text-red-400">離脱</button></form>
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">データと退会</h2>
        <p className="text-sm"><a href="/api/me/export" className="text-amber-400 hover:underline">自分の予定・出欠・空き時間を CSV でダウンロード</a></p>
        <details>
          <summary className="cursor-pointer text-sm text-red-400">アカウントを削除(退会)</summary>
          <form action={deleteMyAccount} className="mt-2 space-y-2 text-sm">
            <p className="text-neutral-400">空き時間・連携情報などの個人データは即時に削除されます。参加していた劇団の出欠記録は「退会済みユーザー」として残ります。取り消せません。</p>
            <div className="flex items-center gap-2">
              <input name="confirm" placeholder="「退会」と入力" className={input} />
              <button className={`${btn} bg-red-600 text-white hover:bg-red-500`}>退会する</button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
