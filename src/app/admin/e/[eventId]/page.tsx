import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { yen, fmtDateTime, CHANNEL_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/format";
import { calcGuarantee, type SoldUnit } from "@/lib/guarantee";
import { togglePublish, createStage, createArea, createCast, adminCancelOrder } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getAppUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { eventId } = await params;
  const admin = supabaseAdmin();

  const { data: event } = await admin.from("tk_events").select("*").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const [{ data: stages }, { data: areas }, { data: seatClasses }, { data: casts }, { data: rules }, { data: stock }] =
    await Promise.all([
      admin.from("tk_stages").select("*").eq("event_id", eventId).order("starts_at"),
      admin.from("tk_areas").select("*").eq("event_id", eventId),
      admin.from("tk_seat_classes").select("*").eq("event_id", eventId),
      admin.from("tk_casts").select("*").eq("event_id", eventId).order("name"),
      admin.from("tk_guarantee_rules").select("*").eq("event_id", eventId),
      admin.from("tk_stage_area_stock").select("*"),
    ]);

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: orders } = stageIds.length
    ? await admin
        .from("tk_orders")
        .select("*, tk_order_items(id, qty, unit_price, guarantee_snapshot)")
        .in("stage_id", stageIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const paidOrders = (orders ?? []).filter((o) => o.status === "active" && o.payment_status === "paid");
  const pendingOrders = (orders ?? []).filter((o) => o.status === "active" && o.payment_status === "pending");

  // 集計
  const totalSales = paidOrders.reduce((s, o) => s + o.total, 0);
  const byStage = new Map<string, { sales: number; count: number }>();
  const byCast = new Map<string | null, { sales: number; units: SoldUnit[] }>();
  const byChannel = new Map<string, number>();
  for (const o of paidOrders) {
    const st = byStage.get(o.stage_id) ?? { sales: 0, count: 0 };
    st.sales += o.total;
    byStage.set(o.stage_id, st);
    const bc = byCast.get(o.cast_id) ?? { sales: 0, units: [] };
    bc.sales += o.total;
    for (const item of o.tk_order_items ?? []) {
      st.count += item.qty;
      for (let i = 0; i < item.qty; i++) {
        bc.units.push({ unitPrice: item.unit_price, snapshot: item.guarantee_snapshot });
      }
    }
    byCast.set(o.cast_id, bc);
    byChannel.set(o.channel, (byChannel.get(o.channel) ?? 0) + o.total);
  }

  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2";

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">
            <Link href="/admin" className="hover:text-neutral-300">← 主催ダッシュボード</Link>
          </p>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm text-neutral-400">{event.venue_name}</p>
        </div>
        <form action={togglePublish.bind(null, eventId, !event.is_published)}>
          <button
            className={`rounded-md px-4 py-2 text-sm font-semibold ${event.is_published ? "bg-neutral-700 text-neutral-200" : "bg-emerald-500 text-black hover:bg-emerald-400"}`}
          >
            {event.is_published ? "非公開にする" : "公開する"}
          </button>
        </form>
      </div>

      {/* 売上サマリ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">売上サマリ</h2>
          <a href={`/admin/e/${eventId}/export`} className="text-sm text-amber-400 hover:underline">
            CSVエクスポート
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">確定売上(純額)</p>
            <p className="text-2xl font-bold text-amber-400">{yen(totalSales)}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">未収(当日現金など)</p>
            <p className="text-2xl font-bold">{yen(pendingOrders.reduce((s, o) => s + o.total, 0))}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">チャネル別</p>
            {[...byChannel.entries()].map(([ch, v]) => (
              <p key={ch} className="text-sm">{CHANNEL_LABEL[ch]}: {yen(v)}</p>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="mb-2 text-sm font-medium text-neutral-300">ステージ別</p>
            {(stages ?? []).map((s) => {
              const v = byStage.get(s.id);
              return (
                <p key={s.id} className="text-sm text-neutral-400">
                  {s.name}: {yen(v?.sales ?? 0)}({v?.count ?? 0}枚)
                </p>
              );
            })}
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="mb-2 text-sm font-medium text-neutral-300">扱い(キャスト)別 / ギャラ見込み(チケット分)</p>
            {[...byCast.entries()].map(([castId, v]) => {
              const cast = (casts ?? []).find((c) => c.id === castId);
              return (
                <p key={castId ?? "general"} className="text-sm text-neutral-400">
                  {cast?.name ?? "一般(主催)"}: {yen(v.sales)}
                  {cast && ` ／ ギャラ ${yen(calcGuarantee(v.units))}`}
                </p>
              );
            })}
          </div>
        </div>
      </section>

      {/* ステージ */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ステージ(回)</h2>
        {(stages ?? []).map((s) => (
          <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
            {s.name} ／ {fmtDateTime(s.starts_at)} 開演
            {(stock ?? [])
              .filter((x) => x.stage_id === s.id)
              .map((x) => {
                const area = (areas ?? []).find((a) => a.id === x.area_id);
                return (
                  <span key={x.area_id} className="ml-3 text-neutral-400">
                    {area?.name}: 残{x.remaining}/{x.capacity}
                  </span>
                );
              })}
          </div>
        ))}
        <form action={createStage.bind(null, eventId)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 text-sm font-medium">ステージ追加</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="name" required placeholder="名称(例: 7/26 昼の部)" className={inputCls} />
            <label className="text-xs text-neutral-400">
              開演日時
              <input name="starts_at" type="datetime-local" required className={`${inputCls} w-full`} />
            </label>
            <label className="text-xs text-neutral-400">
              開場日時(任意)
              <input name="doors_open_at" type="datetime-local" className={`${inputCls} w-full`} />
            </label>
          </div>
          <button className="mt-2 rounded-md bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black">追加</button>
        </form>
      </section>

      {/* エリア・席種 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">座席エリア・席種</h2>
        {(areas ?? []).map((a) => {
          const sc = (seatClasses ?? []).find((x) => x.area_id === a.id);
          return (
            <div key={a.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              {a.name} ／ {a.kind === "reserved" ? "指定席" : `自由席(定員${a.free_capacity})`} ／ {sc ? yen(sc.price) : "-"}
            </div>
          );
        })}
        <form action={createArea.bind(null, eventId)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 text-sm font-medium">エリア追加(席種・券種も自動作成)</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input name="name" required placeholder="エリア名(例: プレミアム指定席)" className={inputCls} />
            <select name="kind" className={inputCls}>
              <option value="reserved">指定席</option>
              <option value="free">自由席</option>
            </select>
            <input name="price" type="number" required placeholder="価格(円)" className={inputCls} />
            <input name="free_capacity" type="number" placeholder="自由席の定員" className={inputCls} />
          </div>
          <textarea
            name="row_spec"
            rows={3}
            placeholder={"指定席の行仕様(1行1列)。例:\nA: 1-4 | 5-8\nB: 1-10\n※「|」は通路(連番の区切り)"}
            className={`${inputCls} mt-2 w-full font-mono text-xs`}
          />
          <button className="mt-2 rounded-md bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black">追加</button>
        </form>
      </section>

      {/* キャスト */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">キャスト・扱いルール</h2>
        {(casts ?? []).map((cast) => {
          const rule = (rules ?? []).filter((r) => r.cast_id === cast.id).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
          return (
            <div key={cast.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <p>
                {cast.name}
                {rule && (
                  <span className="ml-2 text-neutral-400">
                    {rule.rule_type === "rate" && `定率 ${Math.round(Number(rule.rate) * 100)}%`}
                    {rule.rule_type === "fixed" && `定額 ${yen(rule.fixed_amount ?? 0)}/枚`}
                    {rule.rule_type === "quota" && `ノルマ${rule.quota_threshold}枚超過分 ${yen(rule.quota_amount ?? 0)}/枚`}
                  </span>
                )}
                {!cast.user_id && <span className="ml-2 text-yellow-500">(アカウント未紐づけ)</span>}
              </p>
              <p className="mt-1 break-all text-xs text-neutral-500">
                個別URL: {SITE_URL}/e/{eventId}?c={cast.slug}
              </p>
            </div>
          );
        })}
        <form action={createCast.bind(null, eventId)} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-2 text-sm font-medium">キャスト追加</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="name" required placeholder="キャスト名" className={inputCls} />
            <input name="slug" placeholder="URL用スラッグ(半角英数)" className={inputCls} />
            <select name="rule_type" className={inputCls}>
              <option value="">扱いルールなし</option>
              <option value="rate">定率(%)</option>
              <option value="fixed">定額(円/枚)</option>
              <option value="quota">ノルマ超過(円/枚)</option>
            </select>
            <input name="rate" type="number" placeholder="定率: %" className={inputCls} />
            <input name="fixed_amount" type="number" placeholder="定額: 円/枚" className={inputCls} />
            <div className="flex gap-2">
              <input name="quota_threshold" type="number" placeholder="ノルマ枚数" className={`${inputCls} w-1/2`} />
              <input name="quota_amount" type="number" placeholder="超過円/枚" className={`${inputCls} w-1/2`} />
            </div>
          </div>
          <button className="mt-2 rounded-md bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black">追加</button>
        </form>
      </section>

      {/* 注文一覧 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">注文一覧(直近50件)</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="p-2">日時</th>
                <th className="p-2">購入者</th>
                <th className="p-2">チャネル</th>
                <th className="p-2">扱い</th>
                <th className="p-2">支払</th>
                <th className="p-2">金額</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).slice(0, 50).map((o) => (
                <tr key={o.id} className="border-t border-neutral-800">
                  <td className="p-2 text-neutral-400">{fmtDateTime(o.created_at)}</td>
                  <td className="p-2">{o.buyer_name}</td>
                  <td className="p-2">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="p-2">{(casts ?? []).find((c) => c.id === o.cast_id)?.name ?? "一般"}</td>
                  <td className="p-2">
                    {o.status === "cancelled" ? "キャンセル" : PAYMENT_STATUS_LABEL[o.payment_status]}
                    <span className="text-xs text-neutral-500"> ({PAYMENT_METHOD_LABEL[o.payment_method]})</span>
                  </td>
                  <td className="p-2">{yen(o.total)}</td>
                  <td className="p-2">
                    {o.status === "active" && (
                      <form action={adminCancelOrder.bind(null, o.id, eventId, "buyer")}>
                        <button className="text-xs text-red-400 hover:underline">キャンセル</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
