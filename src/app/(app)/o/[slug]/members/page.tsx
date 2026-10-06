import QRCode from "qrcode";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/core/session";
import { invitationUsable } from "@/lib/core/orgs";
import { PART_LABEL, ROLE_LABEL, type InvitationRow, type OrgMemberRow, type OrgRole, type Part } from "@/lib/core/types";
import { fmtDate } from "@/lib/rehearsal/time";
import type { ParticipantRow } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";
import { newInvitation, revokeInvitation, setMemberRole, removeMember, addPlaceholderParticipant, linkParticipant, setParticipantActive, setParticipantProductions } from "../actions";

export const dynamic = "force-dynamic";

// メンバー(アカウント所属)・招待リンク・参加者(仮メンバー含む)の管理
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, user, isAdmin, membership } = await requireOrg(slug);
  const db = await supabaseServer();
  const [{ data: members }, { data: invitations }, { data: participants }, { data: productions }, { data: pmRows }] = await Promise.all([
    db.from("core_org_members").select("*, core_profiles(display_name, email)").eq("org_id", org.id).eq("status", "active").order("joined_at"),
    isAdmin
      ? db.from("core_invitations").select("*, rh_invitation_productions(rh_productions(id, name))").eq("org_id", org.id).is("revoked_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from("rh_participants").select("*").eq("org_id", org.id).order("display_name"),
    db.from("rh_productions").select("id, name, status").eq("org_id", org.id).neq("status", "closed").order("created_at", { ascending: false }),
    db.from("rh_production_members").select("production_id, participant_id").eq("org_id", org.id),
  ]);
  const prods = (productions ?? []) as { id: string; name: string; status: string }[];
  const membershipByParticipant = new Map<string, Set<string>>();
  for (const r of (pmRows ?? []) as { production_id: string; participant_id: string }[]) {
    membershipByParticipant.set(r.participant_id, new Set([...(membershipByParticipant.get(r.participant_id) ?? []), r.production_id]));
  }
  type InvWithProds = InvitationRow & { rh_invitation_productions?: { rh_productions: { id: string; name: string } | null }[] };
  const invProductions = (i: InvWithProds) => (i.rh_invitation_productions ?? []).map((x) => x.rh_productions?.name).filter(Boolean) as string[];
  type M = OrgMemberRow & { core_profiles: { display_name: string; email: string | null } | null };
  const memberRows = (members ?? []) as unknown as M[];
  const invs = ((invitations ?? []) as InvWithProds[]).filter((i) => invitationUsable(i).ok);
  const qrs = isAdmin ? await Promise.all(invs.map((i) => QRCode.toDataURL(`${SITE_URL}/join/${i.token}`, { margin: 1, width: 120 }))) : [];
  const parts = (participants ?? []) as ParticipantRow[];
  const placeholders = parts.filter((p) => !p.profile_id && p.is_active);
  const input = "rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm";
  const selectCls = "rounded border border-line-strong bg-surface-2 px-2 py-1 text-xs";

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">メンバー ({memberRows.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted"><tr><th className="p-2">名前</th><th className="p-2">区分</th><th className="p-2">ロール</th>{isAdmin && <th className="p-2"></th>}</tr></thead>
            <tbody>
              {memberRows.map((m) => (
                <tr key={m.profile_id} className="border-t border-line">
                  <td className="p-2">{m.core_profiles?.display_name ?? "?"}{m.profile_id === user.id && <span className="ml-1 text-xs text-dim">(自分)</span>}</td>
                  <td className="p-2 text-xs">{PART_LABEL[m.part]}</td>
                  <td className="p-2 text-xs">
                    {isAdmin && m.profile_id !== user.id ? (
                      <div className="flex gap-1">
                        {(["owner", "admin", "member"] as OrgRole[]).map((r) => (
                          <form key={r} action={setMemberRole.bind(null, org.id, m.profile_id, r)}>
                            <button disabled={r === "owner" && membership.role !== "owner"} className={`rounded px-2 py-0.5 ${m.role === r ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted hover:bg-surface-3"} disabled:opacity-40`}>{ROLE_LABEL[r]}</button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      ROLE_LABEL[m.role]
                    )}
                  </td>
                  {isAdmin && <td className="p-2 text-right">{m.profile_id !== user.id && m.role !== "owner" && <form action={removeMember.bind(null, org.id, m.profile_id)}><button className="text-xs text-dim/70 hover:text-red-600">除名</button></form>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">招待リンク</h2>
          <p className="text-sm text-muted">リンクまたは QR を LINE グループなどで配ると、受け取った人が自分でアカウントを作って参加します。</p>
          <div className="grid gap-3 md:grid-cols-2">
            {invs.map((i, idx) => (
              <div key={i.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrs[idx]} alt="QR" className="h-24 w-24 rounded bg-white" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{i.label || (i.role === "admin" ? "管理者用" : "メンバー用")} <span className="text-xs text-dim">{ROLE_LABEL[i.role]}{i.part && `／${PART_LABEL[i.part]}`}</span></p>
                  <p className="text-xs text-muted">{invProductions(i).length ? `参加する公演: ${invProductions(i).join("、")}` : "公演の指定なし(団体のみ参加)"}</p>
                  <p className="break-all font-mono text-xs text-accent-text">{SITE_URL}/join/{i.token}</p>
                  <p className="text-xs text-dim">期限 {fmtDate(i.expires_at)} ／ 使用 {i.used_count}{i.max_uses ? `/${i.max_uses}` : ""}</p>
                  <form action={revokeInvitation.bind(null, org.id, i.id)}><button className="text-xs text-dim hover:text-red-600">無効化</button></form>
                </div>
              </div>
            ))}
          </div>
          <form action={newInvitation.bind(null, org.id)} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input name="label" placeholder="ラベル(例: 秋公演キャスト)" className={input} />
              <select name="role" className={input}><option value="member">メンバー</option><option value="admin">管理者</option></select>
              <select name="part" className={input}><option value="">区分は本人が選ぶ</option>{(Object.keys(PART_LABEL) as Part[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}</select>
              <input name="max_uses" type="number" min={0} placeholder="回数(空=無制限)" className={`${input} w-36`} />
              <input name="days" type="number" min={1} defaultValue={14} title="有効日数" className={`${input} w-20`} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-fg-2">
              <span className="text-muted">この招待で参加する公演:</span>
              {prods.length === 0 && <span className="text-dim">(公演がまだありません。団体のみの招待になります)</span>}
              {prods.map((p) => (
                <label key={p.id} className="flex items-center gap-1"><input type="checkbox" name="production_ids" value={p.id} />{p.name}</label>
              ))}
            </div>
            <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover">発行</button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">参加者台帳 ({parts.filter((p) => p.is_active).length})</h2>
        <p className="text-sm text-muted">シーンや予定に割り当てる単位です。本人がまだ登録していなくても「仮メンバー」として先に登録し、後から本人のアカウントに紐づけられます。1 人の参加者は複数の公演に所属できます。</p>
        <div className="grid gap-1 text-sm">
          {parts.map((p) => (
            <div key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-1.5 ${p.is_active ? "" : "text-dim/70"}`}>
              <span className="min-w-40">
                {p.display_name} <span className="text-xs text-dim">{PART_LABEL[p.part]}</span>
                {p.profile_id ? <span className="ml-1 text-xs text-emerald-600">登録済</span> : <span className="ml-1 text-xs text-amber-600">未登録</span>}
              </span>
              {prods.length > 0 && (
                isAdmin && p.is_active ? (
                  <form action={setParticipantProductions.bind(null, org.id, p.id)} className="flex flex-wrap items-center gap-2 text-xs">
                    {prods.map((pr) => (
                      <label key={pr.id} className="flex items-center gap-1"><input type="checkbox" name="production_ids" value={pr.id} defaultChecked={membershipByParticipant.get(p.id)?.has(pr.id) ?? false} />{pr.name}</label>
                    ))}
                    <button className="rounded bg-surface-3 px-2 py-0.5 hover:bg-line-strong">公演を保存</button>
                  </form>
                ) : (
                  <span className="text-xs text-muted">{prods.filter((pr) => membershipByParticipant.get(p.id)?.has(pr.id)).map((pr) => pr.name).join("、") || "公演未所属"}</span>
                )
              )}
              {isAdmin && (
                <span className="flex items-center gap-2">
                  {!p.profile_id && p.is_active && (
                    <form action={linkParticipant.bind(null, org.id, p.id)} className="flex items-center gap-1">
                      <select name="profile_id" className={selectCls}><option value="">本人を選ぶ</option>{memberRows.filter((m) => !parts.some((x) => x.profile_id === m.profile_id)).map((m) => <option key={m.profile_id} value={m.profile_id}>{m.core_profiles?.display_name}</option>)}</select>
                      <button className="rounded bg-surface-3 px-2 py-0.5 text-xs hover:bg-line-strong">紐づけ</button>
                    </form>
                  )}
                  <form action={setParticipantActive.bind(null, org.id, p.id, !p.is_active)}><button className="text-xs text-dim hover:text-fg">{p.is_active ? "無効化" : "有効化"}</button></form>
                </span>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <form action={addPlaceholderParticipant.bind(null, org.id)} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
            <input name="display_name" required placeholder="仮メンバーの名前" className={input} />
            <select name="part" className={input}>{(Object.keys(PART_LABEL) as Part[]).map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}</select>
            <button className="rounded-lg bg-surface-3 px-3 py-2 text-sm hover:bg-line-strong">仮メンバーを追加</button>
            {placeholders.length > 0 && <span className="text-xs text-dim">未登録 {placeholders.length} 名。本人が招待から参加すると自分で紐づけできます</span>}
          </form>
        )}
      </section>
    </div>
  );
}
