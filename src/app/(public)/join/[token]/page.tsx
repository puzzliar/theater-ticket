import Link from "next/link";
import { getSessionUser } from "@/lib/core/session";
import { getInvitation, invitationUsable } from "@/lib/core/orgs";
import { PART_LABEL, type Part } from "@/lib/core/types";
import { accept } from "./actions";

export const dynamic = "force-dynamic";

// 招待リンクの受け口。未ログインでも団体名は見せ、ログイン/登録後に戻ってくる
export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await getInvitation(token);
  const me = await getSessionUser();
  const next = encodeURIComponent(`/join/${token}`);

  if (!inv) {
    return <div className="mx-auto max-w-md"><h1 className="text-xl font-bold">招待が見つかりません</h1><p className="mt-2 text-sm text-muted">リンクが正しいか、主催者に確認してください。</p></div>;
  }
  const usable = invitationUsable(inv);
  const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-sm text-muted">招待</p>
        <h1 className="text-2xl font-bold">{inv.org.name}</h1>
        {inv.label && <p className="text-sm text-muted">{inv.label}</p>}
        <p className="mt-1 text-sm text-fg-2">{inv.role === "admin" ? "管理者" : "メンバー"}として参加します。参加すると、この団体の稽古や本番の召集があなたのマイスケジュールに表示されます。</p>
        {inv.productions.length > 0 && (
          <p className="mt-2 text-sm text-fg-2">
            参加する公演: <span className="text-accent">{inv.productions.map((p) => p.name).join("、")}</span>
            <span className="block text-xs text-dim">すでにこの団体に参加している方も、この公演に追加されます。</span>
          </p>
        )}
      </div>
      {!usable.ok && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{usable.reason}</p>}
      {sp.error && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{sp.error}</p>}
      {usable.ok && !me && (
        <div className="space-y-2">
          <Link href={`/login?next=${next}`} className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center font-semibold text-accent-ink hover:bg-accent-hover">ログインして参加</Link>
          <Link href={`/signup?next=${next}`} className="block w-full rounded-lg border border-line-strong px-4 py-2.5 text-center hover:bg-surface">はじめての方はこちら(無料登録)</Link>
        </div>
      )}
      {usable.ok && me && (
        <form action={accept.bind(null, token)} className="space-y-3">
          <p className="text-sm text-muted">{me.profile.display_name} として参加します。</p>
          <label className="block text-sm">
            この団体での関わり方
            <select name="part" defaultValue={inv.part ?? me.profile.default_part} className={`${input} mt-1`}>
              {(Object.keys(PART_LABEL) as Part[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
            </select>
          </label>
          <button className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:bg-accent-hover">参加する</button>
        </form>
      )}
    </div>
  );
}
