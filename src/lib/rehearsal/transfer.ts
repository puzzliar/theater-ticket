import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit, type SessionUser } from "@/lib/core/session";
import type { OrgRole, Part } from "@/lib/core/types";
import { ensureParticipant } from "./profile";
import type { ProductionTransferRow } from "./types";

// 公演の引き渡し: セルフ公演(個人座組)で管理していた公演を、主催者の座組へ丸ごと移す。
// 予定・シーン・召集・出欠記録・代役募集を保ったまま org_id を書き換え、参加者は移動先の参加者レコードに付け替える。
// 本人登録済みの参加者は移動先の座組にメンバーとして加わる(キャストごと引き渡す)。

export class TransferError extends Error {}
const TRANSFER_DAYS = 14;

export async function createTransfer(productionId: string, fromOrgId: string, actorId: string): Promise<ProductionTransferRow> {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  await admin.from("rh_production_transfers").update({ revoked_at: now }).eq("production_id", productionId).is("accepted_at", null).is("revoked_at", null);
  const { data, error } = await admin
    .from("rh_production_transfers")
    .insert({ production_id: productionId, from_org_id: fromOrgId, created_by: actorId, expires_at: new Date(Date.now() + TRANSFER_DAYS * 24 * 3600 * 1000).toISOString() })
    .select("*")
    .single();
  if (error) throw new TransferError(error.message);
  await audit("production.transfer.create", { orgId: fromOrgId, actorProfileId: actorId, target: productionId });
  return data as ProductionTransferRow;
}

export async function revokeTransfer(id: string, fromOrgId: string): Promise<void> {
  await supabaseAdmin().from("rh_production_transfers").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("from_org_id", fromOrgId).is("accepted_at", null);
}

export async function openTransferFor(productionId: string): Promise<ProductionTransferRow | null> {
  const { data } = await supabaseAdmin()
    .from("rh_production_transfers")
    .select("*")
    .eq("production_id", productionId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ProductionTransferRow | null) ?? null;
}

export interface TransferWithNames extends ProductionTransferRow {
  production: { name: string; status: string; opens_on: string | null } | null;
  fromOrg: { name: string; kind: string } | null;
  memberCount: number;
}

export async function getTransfer(token: string): Promise<TransferWithNames | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("rh_production_transfers")
    .select("*, rh_productions(name, status, opens_on), from_org:core_organizations!rh_production_transfers_from_org_id_fkey(name, kind)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { rh_productions, from_org, ...t } = data as ProductionTransferRow & { rh_productions: TransferWithNames["production"]; from_org: TransferWithNames["fromOrg"] };
  const { count } = await admin.from("rh_production_members").select("participant_id", { count: "exact", head: true }).eq("production_id", t.production_id);
  return { ...t, production: rh_productions, fromOrg: from_org, memberCount: count ?? 0 };
}

export function transferUsable(t: ProductionTransferRow): { ok: boolean; reason?: string } {
  if (t.accepted_at) return { ok: false, reason: "この引き渡しは既に完了しています" };
  if (t.revoked_at) return { ok: false, reason: "この引き渡しリンクは無効化されています" };
  if (new Date(t.expires_at).getTime() < Date.now()) return { ok: false, reason: "この引き渡しリンクは期限切れです" };
  return { ok: true };
}

const uniqBy = <T>(rows: T[], key: (r: T) => string): T[] => {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
};

// 受け入れ側(移動先の admin)が実行する
export async function acceptTransfer(token: string, toOrgId: string, actor: SessionUser): Promise<{ toOrgSlug: string; productionId: string }> {
  const admin = supabaseAdmin();
  const t = await getTransfer(token);
  if (!t) throw new TransferError("引き渡しが見つかりません");
  const usable = transferUsable(t);
  if (!usable.ok) throw new TransferError(usable.reason!);
  if (toOrgId === t.from_org_id) throw new TransferError("同じ座組には引き渡せません");
  const [{ data: toOrg }, { data: myMembership }] = await Promise.all([
    admin.from("core_organizations").select("id, slug, status, kind").eq("id", toOrgId).maybeSingle(),
    admin.from("core_org_members").select("role").eq("org_id", toOrgId).eq("profile_id", actor.id).eq("status", "active").maybeSingle(),
  ]);
  if (!toOrg || toOrg.status !== "active") throw new TransferError("移動先の座組が利用できません");
  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) throw new TransferError("移動先の座組の管理者である必要があります");

  const pid = t.production_id;
  const [{ data: scenes }, { data: sessions }] = await Promise.all([
    admin.from("rh_scenes").select("id").eq("production_id", pid),
    admin.from("rh_sessions").select("id").eq("production_id", pid),
  ]);
  const sceneIds = (scenes ?? []).map((s) => s.id);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const [{ data: pm }, { data: scm }, { data: ssm }, { data: reqs }] = await Promise.all([
    admin.from("rh_production_members").select("participant_id, role_name").eq("production_id", pid),
    sceneIds.length ? admin.from("rh_scene_members").select("scene_id, participant_id").in("scene_id", sceneIds) : Promise.resolve({ data: [] as { scene_id: string; participant_id: string }[] }),
    sessionIds.length
      ? admin.from("rh_session_members").select("session_id, participant_id, required, response, attendance, note, notified_at, google_event_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string; participant_id: string; required: boolean; response: string; attendance: string; note: string; notified_at: string | null; google_event_id: string | null }[] }),
    sessionIds.length ? admin.from("rh_substitution_requests").select("id, absent_participant_id, filled_by_participant_id").in("session_id", sessionIds) : Promise.resolve({ data: [] as { id: string; absent_participant_id: string; filled_by_participant_id: string | null }[] }),
  ]);
  const reqIds = (reqs ?? []).map((r) => r.id);
  const { data: cands } = reqIds.length ? await admin.from("rh_substitution_candidates").select("request_id, participant_id, applied_at").in("request_id", reqIds) : { data: [] as { request_id: string; participant_id: string; applied_at: string | null }[] };

  const fromIds = new Set<string>();
  for (const r of pm ?? []) fromIds.add(r.participant_id);
  for (const r of scm ?? []) fromIds.add(r.participant_id);
  for (const r of ssm ?? []) fromIds.add(r.participant_id);
  for (const r of reqs ?? []) {
    fromIds.add(r.absent_participant_id);
    if (r.filled_by_participant_id) fromIds.add(r.filled_by_participant_id);
  }
  for (const r of cands ?? []) fromIds.add(r.participant_id);

  // 参加者の付け替え表(移動元 → 移動先)
  const map = new Map<string, string>();
  if (fromIds.size) {
    const { data: fromParts } = await admin.from("rh_participants").select("id, profile_id, display_name, part").in("id", [...fromIds]);
    for (const fp of (fromParts ?? []) as { id: string; profile_id: string | null; display_name: string; part: Part }[]) {
      if (fp.profile_id) {
        const { data: m } = await admin.from("core_org_members").select("role, status").eq("org_id", toOrgId).eq("profile_id", fp.profile_id).maybeSingle();
        if (!m || m.status !== "active") {
          const role: OrgRole = m?.role === "owner" ? "owner" : "member";
          await admin.from("core_org_members").upsert({ org_id: toOrgId, profile_id: fp.profile_id, role, part: fp.part, status: "active", joined_at: new Date().toISOString() }, { onConflict: "org_id,profile_id" });
        }
        const p = await ensureParticipant(toOrgId, fp.profile_id, fp.display_name, fp.part);
        map.set(fp.id, p.id);
      } else {
        const { data: created, error } = await admin.from("rh_participants").insert({ org_id: toOrgId, display_name: fp.display_name, part: fp.part }).select("id").single();
        if (error) throw new TransferError(error.message);
        map.set(fp.id, created.id);
      }
    }
  }
  const mp = (id: string) => map.get(id) ?? id;

  // 本体と従属データの org_id を移す
  await admin.from("rh_productions").update({ org_id: toOrgId }).eq("id", pid);
  await admin.from("rh_scenes").update({ org_id: toOrgId }).eq("production_id", pid);
  await admin.from("rh_sessions").update({ org_id: toOrgId }).eq("production_id", pid);
  if (sessionIds.length) await admin.from("rh_session_scenes").update({ org_id: toOrgId }).in("session_id", sessionIds);

  // 参加者を参照する行は、削除して付け替え後の行を入れ直す(同一人物に統合されても重複しない)
  await admin.from("rh_production_members").delete().eq("production_id", pid);
  const pmRows = uniqBy((pm ?? []).map((r) => ({ production_id: pid, participant_id: mp(r.participant_id), org_id: toOrgId, role_name: r.role_name })), (r) => r.participant_id);
  if (pmRows.length) await admin.from("rh_production_members").insert(pmRows);

  if (sceneIds.length) {
    await admin.from("rh_scene_members").delete().in("scene_id", sceneIds);
    const rows = uniqBy((scm ?? []).map((r) => ({ scene_id: r.scene_id, participant_id: mp(r.participant_id), org_id: toOrgId })), (r) => `${r.scene_id}:${r.participant_id}`);
    if (rows.length) await admin.from("rh_scene_members").insert(rows);
  }
  if (sessionIds.length) {
    await admin.from("rh_session_members").delete().in("session_id", sessionIds);
    const rows = uniqBy(
      (ssm ?? []).map((r) => ({ ...r, participant_id: mp(r.participant_id), org_id: toOrgId })),
      (r) => `${r.session_id}:${r.participant_id}`,
    );
    if (rows.length) await admin.from("rh_session_members").insert(rows);
  }
  for (const r of reqs ?? []) {
    await admin
      .from("rh_substitution_requests")
      .update({ org_id: toOrgId, absent_participant_id: mp(r.absent_participant_id), filled_by_participant_id: r.filled_by_participant_id ? mp(r.filled_by_participant_id) : null })
      .eq("id", r.id);
  }
  if (reqIds.length) {
    await admin.from("rh_substitution_candidates").delete().in("request_id", reqIds);
    const rows = uniqBy((cands ?? []).map((r) => ({ request_id: r.request_id, participant_id: mp(r.participant_id), org_id: toOrgId, applied_at: r.applied_at })), (r) => `${r.request_id}:${r.participant_id}`);
    if (rows.length) await admin.from("rh_substitution_candidates").insert(rows);
  }
  // 移動元の招待に紐づいていた公演指定は意味を失うので外す
  await admin.from("rh_invitation_productions").delete().eq("production_id", pid);

  await admin
    .from("rh_production_transfers")
    .update({ accepted_at: new Date().toISOString(), accepted_by: actor.id, to_org_id: toOrgId })
    .eq("id", t.id);
  await audit("production.transfer.accept", { orgId: toOrgId, actorProfileId: actor.id, target: pid, detail: { from: t.from_org_id, participants: map.size } });
  await audit("production.transfer.out", { orgId: t.from_org_id, actorProfileId: actor.id, target: pid, detail: { to: toOrgId } });
  return { toOrgSlug: toOrg.slug, productionId: pid };
}
