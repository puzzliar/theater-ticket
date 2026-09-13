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
    return <div className="mx-auto max-w-md"><h1 className="text-xl font-bold">招待が見つかりません</h1><p className="mt-2 text-sm text-neutral-400">リンクが正しいか、主催者に確認してください。</p></div>;
  }
  const usable = invitationUsable(inv);
  const input = "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-sm text-neutral-400">招待</p>
        <h1 className="text-2xl font-bold">{inv.org.name}</h1>
        {inv.label && <p className="text-sm text-neutral-400">{inv.label}</p>}
        <p className="mt-1 text-sm text-neutral-300">{inv.role === "admin" ? "管理者" : "メンバー"}として参加します。参加すると、この団体の稽古枠の召集や予定があなたの稽古予定に表示されます。</p>
      </div>
      {!usable.ok && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{usable.reason}</p>}
      {sp.error && <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{sp.error}</p>}
      {usable.ok && !me && (
        <div className="space-y-2">
          <Link href={`/login?next=${next}`} className="block w-full rounded-md bg-amber-500 px-4 py-2.5 text-center font-semibold text-black hover:bg-amber-400">ログインして参加</Link>
          <Link href={`/signup?next=${next}`} className="block w-full rounded-md border border-neutral-700 px-4 py-2.5 text-center hover:bg-neutral-900">はじめての方はこちら(無料登録)</Link>
        </div>
      )}
      {usable.ok && me && (
        <form action={accept.bind(null, token)} className="space-y-3">
          <p className="text-sm text-neutral-400">{me.profile.display_name} として参加します。</p>
          <label className="block text-sm">
            この団体での関わり方
            <select name="part" defaultValue={inv.part ?? me.profile.default_part} className={`${input} mt-1`}>
              {(Object.keys(PART_LABEL) as Part[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
            </select>
          </label>
          <button className="w-full rounded-md bg-amber-500 px-4 py-2.5 font-semibold text-black hover:bg-amber-400">参加する</button>
        </form>
      )}
    </div>
  );
}
