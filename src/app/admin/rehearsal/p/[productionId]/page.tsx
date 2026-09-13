import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkAvailability, sceneProgress, type AvailabilityVerdict } from "@/lib/rehearsal/schedule";
import { fmtDate, fmtRange, jstDateString, jstToIso, nowMs, ts } from "@/lib/rehearsal/time";
import {
  MEMBER_KIND_LABEL,
  SESSION_KIND_LABEL,
  SESSION_STATUS_LABEL,
  type MemberRow,
  type ProductionRow,
  type SceneRow,
  type SessionRow,
} from "@/lib/rehearsal/types";
import {
  addProductionMember,
  removeProductionMember,
  createScene,
  setSceneMembers,
  deleteScene,
  checkSessionSlot,
  createSession,
} from "../../actions";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function ProductionPage({ params, searchParams }: { params: Promise<{ productionId: string }>; searchParams: Promise<Search> }) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { productionId } = await params;
  const sp = await searchParams;
  const admin = supabaseAdmin();

  const { data: production } = await admin.from("rh_productions").select("*").eq("id", productionId).maybeSingle();
  if (!production) notFound();
  const prod = production as ProductionRow;

  const [{ data: pm }, { data: allMembers }, { data: scenes }, { data: sceneMembers }, { data: sessions }, progress] = await Promise.all([
    admin.from("rh_production_members").select("member_id, part, role_name, rh_members(id, name, kind, is_active)").eq("production_id", productionId),
    admin.from("rh_members").select("id, name, kind").eq("is_active", true).order("name"),
    admin.from("rh_scenes").select("*").eq("production_id", productionId).order("sort_order"),
    admin.from("rh_scene_members").select("scene_id, member_id, rh_scenes!inner(production_id)").eq("rh_scenes.production_id", productionId),
    admin
      .from("rh_sessions")
      .select("*, rh_session_scenes(scene_id, status, rh_scenes(code)), rh_session_members(member_id, response, attendance)")
      .eq("production_id", productionId)
      .order("starts_at"),
    sceneProgress(productionId),
  ]);

  type PM = { member_id: string; part: string; role_name: string; rh_members: Pick<MemberRow, "id" | "name" | "kind" | "is_active"> | null };
  const participants = ((pm ?? []) as unknown as PM[]).filter((p) => p.rh_members).sort((a, b) => a.rh_members!.name.localeCompare(b.rh_members!.name, "ja"));
  const participantIds = new Set(participants.map((p) => p.member_id));
  const nameOf = new Map(participants.map((p) => [p.member_id, p.rh_members!.name]));
  const sceneMemberMap = new Map<string, string[]>();
  for (const sm of (sceneMembers ?? []) as { scene_id: string; member_id: string }[]) {
    sceneMemberMap.set(sm.scene_id, [...(sceneMemberMap.get(sm.scene_id) ?? []), sm.member_id]);
  }
  const remaining = progress.filter((p) => Number(p.done_count) < p.target_count);

  // 作成前チェック(クエリパラメータから)
  const checking = one(sp.check) === "1";
  const draft = {
    kind: one(sp.kind) || "rehearsal",
    title: one(sp.title),
    date: one(sp.date) || jstDateString(),
    from: one(sp.from) || "18:00",
    to: one(sp.to) || "22:00",
    location: one(sp.location) || prod.default_location,
    note: one(sp.note),
    sceneIds: many(sp.scene_ids),
    memberIds: many(sp.member_ids),
  };
  let verdicts: { memberId: string; name: string; verdict: AvailabilityVerdict; reason: string }[] = [];
  let checkError: string | null = null;
  if (checking) {
    try {
      const startsAt = jstToIso(`${draft.date}T${draft.from}`);
      const endsAt = jstToIso(`${draft.date}T${draft.to}`);
      const needed = new Map<string, string>();
      for (const sid of draft.sceneIds) {
        const code = (scenes ?? []).find((s) => s.id === sid)?.code ?? "";
        for (const m of sceneMemberMap.get(sid) ?? []) needed.set(m, needed.has(m) ? `${needed.get(m)}, ${code}` : code);
      }
      for (const m of draft.memberIds) if (!needed.has(m)) needed.set(m, "手動");
      const ids = [...needed.keys()];
      const result = await checkAvailability(ids, startsAt, endsAt);
      verdicts = ids
        .map((id) => ({ memberId: id, name: nameOf.get(id) ?? "?", verdict: result.get(id)!, reason: needed.get(id)! }))
        .sort((a, b) => a.verdict.status.localeCompare(b.verdict.status));
    } catch (e) {
      checkError = e instanceof Error ? e.message : "確認に失敗しました";
    }
  }

  const now = nowMs();
  type S = SessionRow & { rh_session_scenes: { scene_id: string; status: string; rh_scenes: { code: string } | null }[]; rh_session_members: { member_id: string; response: string; attendance: string }[] };
  const allSessions = (sessions ?? []) as unknown as S[];
  const upcoming = allSessions.filter((s) => ts(s.ends_at) >= now && s.status !== "cancelled");
  const past = allSessions.filter((s) => ts(s.ends_at) < now || s.status === "cancelled").reverse();

  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";
  const verdictCls: Record<AvailabilityVerdict["status"], string> = {
    available: "text-emerald-400",
    unavailable: "text-red-400",
    conflict: "text-orange-400",
    unknown: "text-neutral-400",
  };
  const verdictLabel: Record<AvailabilityVerdict["status"], string> = { available: "○ 参加可", unavailable: "× 不可", conflict: "△ 他現場", unknown: "? 未回答" };

  const SessionRowView = ({ s }: { s: S }) => {
    const yes = s.rh_session_members.filter((m) => m.response === "yes").length;
    const no = s.rh_session_members.filter((m) => m.response === "no").length;
    const pending = s.rh_session_members.filter((m) => m.response === "pending").length;
    return (
      <Link href={`/admin/rehearsal/p/${productionId}/s/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm hover:border-neutral-600">
        <div>
          <p>
            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${s.kind === "performance" ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-300"}`}>{SESSION_KIND_LABEL[s.kind]}</span>
            <span className="font-medium">{fmtRange(s.starts_at, s.ends_at)}</span> {s.title}
            {s.status !== "scheduled" && <span className="ml-2 text-xs text-neutral-500">[{SESSION_STATUS_LABEL[s.status]}]</span>}
          </p>
          <p className="text-xs text-neutral-400">
            {s.location && `📍${s.location} `}
            {s.rh_session_scenes.length > 0 && `シーン: ${s.rh_session_scenes.map((x) => `${x.rh_scenes?.code ?? ""}${x.status === "done" ? "✓" : x.status === "skipped" ? "−" : ""}`).join(", ")}`}
          </p>
        </div>
        <p className="text-xs text-neutral-400">
          召集{s.rh_session_members.length} ／ <span className="text-emerald-400">参加{yes}</span> ／ <span className="text-red-400">不参加{no}</span> ／ <span className="text-yellow-400">未回答{pending}</span>
        </p>
      </Link>
    );
  };

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-neutral-500"><Link href="/admin/rehearsal" className="hover:text-neutral-300">← 稽古・シフト管理</Link></p>
        <h1 className="text-2xl font-bold">{prod.name}</h1>
        <p className="text-sm text-neutral-400">
          {prod.rehearsal_starts_on && `稽古開始 ${prod.rehearsal_starts_on} `}
          {prod.opens_on && `／ 初日 ${prod.opens_on} `}
          {prod.default_location && `／ ${prod.default_location}`}
        </p>
      </div>

      {/* 進捗 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">シーン進捗</h2>
          <p className="text-sm">
            全{progress.length}シーン中 <span className="font-semibold text-amber-300">未消化 {remaining.length}</span>
            {remaining.length > 0 && <span className="text-neutral-400">({remaining.map((r) => r.code).join(", ")})</span>}
            {progress.length > 0 && remaining.length === 0 && <span className="text-emerald-400"> 全シーン一巡済み</span>}
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs text-neutral-400">
              <tr><th className="p-2">コード</th><th className="p-2">シーン</th><th className="p-2">必要メンバー</th><th className="p-2">実施/目標</th><th className="p-2">最終稽古</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {((scenes ?? []) as SceneRow[]).map((sc) => {
                const p = progress.find((x) => x.scene_id === sc.id);
                const done = Number(p?.done_count ?? 0);
                const isRemaining = done < sc.target_count;
                const members = sceneMemberMap.get(sc.id) ?? [];
                return (
                  <tr key={sc.id} className="border-t border-neutral-800 align-top">
                    <td className="p-2 font-mono">{sc.code}</td>
                    <td className="p-2">{sc.name}{sc.note && <span className="block text-xs text-neutral-500">{sc.note}</span>}</td>
                    <td className="p-2">
                      <details>
                        <summary className="cursor-pointer text-xs text-neutral-300">{members.length ? members.map((m) => nameOf.get(m) ?? "?").join(", ") : <span className="text-neutral-500">未設定</span>}</summary>
                        <form action={setSceneMembers.bind(null, productionId, sc.id)} className="mt-2 space-y-1 text-xs">
                          <div className="flex flex-wrap gap-2">
                            {participants.map((pp) => (
                              <label key={pp.member_id} className="flex items-center gap-1"><input type="checkbox" name="member_ids" value={pp.member_id} defaultChecked={members.includes(pp.member_id)} />{pp.rh_members!.name}</label>
                            ))}
                          </div>
                          <label className="flex items-center gap-1">目標回数 <input name="target_count" type="number" min={1} defaultValue={sc.target_count} className={`${inputCls} w-16 py-1`} /></label>
                          <button className="rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600">保存</button>
                        </form>
                      </details>
                    </td>
                    <td className={`p-2 font-semibold ${isRemaining ? "text-amber-300" : "text-emerald-400"}`}>{done} / {sc.target_count}</td>
                    <td className="p-2 text-xs text-neutral-400">{p?.last_done_at ? fmtDate(p.last_done_at) : "-"}</td>
                    <td className="p-2 text-right"><form action={deleteScene.bind(null, productionId, sc.id)}><button className="text-xs text-neutral-600 hover:text-red-400">削除</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form action={createScene.bind(null, productionId)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 font-medium">シーンを追加</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="code" required placeholder="コード(例: 1-3, ルートB-2)" className={inputCls} />
            <input name="name" required placeholder="シーン名" className={inputCls} />
            <input name="target_count" type="number" min={1} defaultValue={1} title="目標稽古回数" className={inputCls} />
            <input name="note" placeholder="メモ" className={inputCls} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {participants.map((pp) => (
              <label key={pp.member_id} className="flex items-center gap-1"><input type="checkbox" name="member_ids" value={pp.member_id} />{pp.rh_members!.name}</label>
            ))}
            {participants.length === 0 && <span className="text-neutral-500">先に参加メンバーを登録してください</span>}
          </div>
          <button className="mt-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">追加</button>
        </form>
      </section>

      {/* 稽古枠 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">稽古枠・本番</h2>
        <div className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-neutral-400">今後の予定はありません。</p>}
          {upcoming.map((s) => <SessionRowView key={s.id} s={s} />)}
        </div>
        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-neutral-400">過去・中止 ({past.length})</summary>
            <div className="mt-2 space-y-2">{past.map((s) => <SessionRowView key={s.id} s={s} />)}</div>
          </details>
        )}

        <form id="new-session" className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 font-medium">稽古枠を作成</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <select name="kind" defaultValue={draft.kind} className={inputCls}>
              <option value="rehearsal">稽古</option>
              <option value="performance">本番(シフト)</option>
              <option value="other">その他</option>
            </select>
            <input name="title" defaultValue={draft.title} placeholder="タイトル(例: 通し稽古, 昼公演)" className={`${inputCls} sm:col-span-3`} />
            <input name="date" type="date" required defaultValue={draft.date} className={inputCls} />
            <input name="from" type="time" required defaultValue={draft.from} className={inputCls} />
            <input name="to" type="time" required defaultValue={draft.to} className={inputCls} />
            <input name="location" defaultValue={draft.location} placeholder="場所" className={inputCls} />
            <input name="note" defaultValue={draft.note} placeholder="メモ(持ち物・入館方法など)" className={`${inputCls} sm:col-span-4`} />
          </div>
          <p className="mt-3 text-xs text-neutral-400">対象シーン(必要メンバーが自動で召集されます)</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {((scenes ?? []) as SceneRow[]).map((sc) => {
              const p = progress.find((x) => x.scene_id === sc.id);
              const isRemaining = Number(p?.done_count ?? 0) < sc.target_count;
              return (
                <label key={sc.id} className={`flex items-center gap-1 ${isRemaining ? "text-amber-200" : "text-neutral-400"}`}>
                  <input type="checkbox" name="scene_ids" value={sc.id} defaultChecked={draft.sceneIds.includes(sc.id)} />
                  {sc.code} {sc.name}
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-neutral-400">追加で召集するメンバー</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {participants.map((pp) => (
              <label key={pp.member_id} className="flex items-center gap-1">
                <input type="checkbox" name="member_ids" value={pp.member_id} defaultChecked={draft.memberIds.includes(pp.member_id)} />
                {pp.rh_members!.name}
              </label>
            ))}
          </div>

          {checking && (
            <div className="mt-3 rounded-md border border-neutral-700 bg-neutral-950 p-3 text-sm">
              <p className="mb-1 font-medium">参加可否の確認 ({draft.date} {draft.from}〜{draft.to})</p>
              {checkError && <p className="text-red-400">{checkError}</p>}
              {!checkError && verdicts.length === 0 && <p className="text-neutral-400">対象メンバーがいません。シーンかメンバーを選択してください。</p>}
              <ul className="grid gap-1 sm:grid-cols-2">
                {verdicts.map((v) => (
                  <li key={v.memberId} className="flex justify-between gap-2">
                    <span>{v.name} <span className="text-xs text-neutral-500">({v.reason})</span></span>
                    <span className={`text-xs ${verdictCls[v.verdict.status]}`}>{verdictLabel[v.verdict.status]} {v.verdict.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button formAction={checkSessionSlot.bind(null, productionId)} className="rounded-md border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10">参加可否を確認</button>
            <button formAction={createSession.bind(null, productionId)} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">作成する</button>
            <label className="flex items-center gap-1 text-xs text-neutral-300"><input type="checkbox" name="notify" defaultChecked /> 作成時に召集を LINE/メールで通知</label>
          </div>
        </form>
      </section>

      {/* 参加メンバー */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">参加メンバー ({participants.length})</h2>
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          {participants.map((pp) => (
            <div key={pp.member_id} className="flex items-center justify-between rounded border border-neutral-800 px-3 py-1.5">
              <span>
                {pp.rh_members!.name} <span className="text-xs text-neutral-500">{MEMBER_KIND_LABEL[pp.part as keyof typeof MEMBER_KIND_LABEL]}{pp.role_name && ` ／ ${pp.role_name}`}</span>
              </span>
              <form action={removeProductionMember.bind(null, productionId, pp.member_id)}><button className="text-xs text-neutral-600 hover:text-red-400">外す</button></form>
            </div>
          ))}
        </div>
        <form action={addProductionMember.bind(null, productionId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <select name="member_id" required className={inputCls}>
            <option value="">メンバーを選択</option>
            {((allMembers ?? []) as Pick<MemberRow, "id" | "name" | "kind">[]).filter((m) => !participantIds.has(m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({MEMBER_KIND_LABEL[m.kind]})</option>
            ))}
          </select>
          <select name="part" className={inputCls}>
            <option value="cast">キャスト</option>
            <option value="staff">スタッフ</option>
            <option value="director">演出</option>
          </select>
          <input name="role_name" placeholder="役名(任意)" className={inputCls} />
          <button className="rounded-md bg-neutral-700 px-3 py-2 text-sm hover:bg-neutral-600">参加させる</button>
          <span className="text-xs text-neutral-500">メンバー自体の登録は <Link href="/admin/rehearsal" className="underline">稽古管理トップ</Link></span>
        </form>
      </section>
    </div>
  );
}
