import Link from "next/link";
import { getSessionUser, listMyOrgs } from "@/lib/core/session";
import { isAdminRole } from "@/lib/core/types";
import { getTransfer, transferUsable } from "@/lib/rehearsal/transfer";
import { fmtDate } from "@/lib/rehearsal/time";
import { accept } from "./actions";

export const dynamic = "force-dynamic";

// セルフ公演の引き渡しを受ける(主催者側)。自分が管理者の座組を選んで引き受ける
export default async function HandoverPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await getTransfer(token);
  const me = await getSessionUser();
  const next = encodeURIComponent(`/handover/${token}`);
  if (!t) return <div className="mx-auto max-w-md"><h1 className="text-xl font-bold">引き渡しが見つかりません</h1><p className="mt-2 text-sm text-muted">リンクが正しいか、送ってくれた人に確認してください。</p></div>;
  const usable = transferUsable(t);
  const myAdminOrgs = me ? (await listMyOrgs(me.id)).filter((o) => isAdminRole(o.role) && o.org.id !== t.from_org_id && o.org.kind !== "personal") : [];
  const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-sm text-muted">公演の引き渡し</p>
        <h1 className="text-2xl font-bold">{t.production?.name ?? "公演"}</h1>
        <p className="mt-1 text-sm text-fg-2">{t.fromOrg?.name ?? "キャスト"} で管理されていた公演を、あなたの座組へ引き渡します。予定・シーン・出欠の記録と、参加している {t.memberCount} 名がそのまま移り、以降はあなたの座組の管理者が管理します。</p>
        <p className="mt-1 text-xs text-dim">リンクの期限 {fmtDate(t.expires_at)}</p>
      </div>
      {!usable.ok && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{usable.reason}</p>}
      {sp.error && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{sp.error}</p>}
      {usable.ok && !me && (
        <div className="space-y-2">
          <Link href={`/login?next=${next}`} className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center font-semibold text-accent-ink hover:bg-accent-hover">ログインして引き受ける</Link>
          <Link href={`/signup?next=${next}`} className="block w-full rounded-lg border border-line-strong px-4 py-2.5 text-center hover:bg-surface">はじめての方はこちら(無料登録)</Link>
        </div>
      )}
      {usable.ok && me && myAdminOrgs.length === 0 && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <p>引き受けるには、あなたが管理者の座組(劇団・団体)が必要です。</p>
          <Link href={`/orgs/new?next=${next}`} className="inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-accent-hover">座組を作る</Link>
          <p className="text-xs text-dim">現在は招待制のため、座組の作成には運営が発行する主催者コードが必要です。作成後にこのリンクをもう一度開いてください。</p>
        </div>
      )}
      {usable.ok && me && myAdminOrgs.length > 0 && (
        <form action={accept.bind(null, token)} className="space-y-3">
          <label className="block text-sm">
            引き受ける座組
            <select name="org_id" className={`${input} mt-1`}>
              {myAdminOrgs.map((o) => <option key={o.org.id} value={o.org.id}>{o.org.name}</option>)}
            </select>
          </label>
          <button className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:bg-accent-hover">この座組で引き受ける</button>
          <p className="text-xs text-dim">参加しているキャストは、あなたの座組のメンバーとして追加されます。まだ ZAGUMI に登録していない人は仮メンバーとして移ります。</p>
        </form>
      )}
    </div>
  );
}
