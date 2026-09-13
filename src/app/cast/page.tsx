import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { yen, fmtDateTime, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL, SETTLEMENT_LABEL } from "@/lib/format";
import { calcGuarantee, type SoldUnit } from "@/lib/guarantee";
import GuestReservationForm from "./GuestReservationForm";
import { castCancelReservation } from "./actions";

export const dynamic = "force-dynamic";

// キャストダッシュボード(要件5.6/5.7)。自分の扱い分のみを表示(他キャスト情報は取得しない)
export default async function CastPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.role !== "cast") redirect("/portal");

  const admin = supabaseAdmin();
  const { data: myCasts } = await admin
    .from("tk_casts")
    .select("id, name, slug, event_id, tk_events(id, name, is_published)")
    .eq("user_id", user.userId);

  const sections = [];
  for (const cast of myCasts ?? []) {
    const event = cast.tk_events as unknown as { id: string; name: string };
    const [{ data: stages }, { data: seatClasses }, { data: orders }] = await Promise.all([
      admin.from("tk_stages").select("id, name, starts_at").eq("event_id", cast.event_id).order("starts_at"),
      admin.from("tk_seat_classes").select("id, name, price, area_id, tk_areas!inner(kind)").eq("event_id", cast.event_id),
      admin
        .from("tk_orders")
        .select("*, tk_order_items(id, qty, unit_price, guarantee_snapshot), tk_guest_reservations(guest_name, note)")
        .eq("cast_id", cast.id)
        .order("created_at", { ascending: false }),
    ]);
    sections.push({ cast, event, stages: stages ?? [], seatClasses: seatClasses ?? [], orders: orders ?? [] });
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">キャストダッシュボード</h1>
      <p className="text-sm text-neutral-400">
        {user.displayName} さん ／ <Link href="/me" className="text-amber-400 hover:underline">稽古予定を見る</Link>
      </p>
      {sections.length === 0 && (
        <p className="text-neutral-400">出演公演がまだ登録されていません。主催者にお問い合わせください。</p>
      )}

      {sections.map(({ cast, event, stages, seatClasses, orders }) => {
        const active = orders.filter((o) => o.status === "active");
        const paid = active.filter((o) => o.payment_status === "paid");
        const pending = active.filter((o) => o.payment_status === "pending");
        const units: SoldUnit[] = paid.flatMap((o) =>
          (o.tk_order_items ?? []).flatMap((i: { qty: number; unit_price: number; guarantee_snapshot: SoldUnit["snapshot"] }) =>
            Array.from({ length: i.qty }, () => ({ unitPrice: i.unit_price, snapshot: i.guarantee_snapshot })),
          ),
        );
        const sales = paid.reduce((s, o) => s + o.total, 0);
        const soldCount = units.length;
        const byStage = new Map<string, number>();
        for (const o of paid) {
          const q = (o.tk_order_items ?? []).reduce((s: number, i: { qty: number }) => s + i.qty, 0);
          byStage.set(o.stage_id, (byStage.get(o.stage_id) ?? 0) + q);
        }

        return (
          <section key={cast.id} className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div>
              <h2 className="text-xl font-semibold">{event.name}</h2>
              <p className="mt-1 break-all text-xs text-neutral-500">
                あなたの案内用URL:{" "}
                <span className="text-amber-400">{SITE_URL}/e/{event.id}?c={cast.slug}</span>
                (このURL経由の購入は自動的にあなたの扱いになります)
              </p>
            </div>

            {/* リアルタイム売上 */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-sm text-neutral-400">あなたの扱い売上(確定)</p>
                <p className="text-2xl font-bold text-amber-400">{yen(sales)}</p>
                <p className="text-sm text-neutral-400">{soldCount}枚</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-sm text-neutral-400">ギャラ見込み(チケット分)</p>
                <p className="text-2xl font-bold">{yen(calcGuarantee(units))}</p>
                <p className="text-xs text-neutral-500">物販との合算は物販システム側で確認</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-sm text-neutral-400">ステージ別枚数</p>
                {stages.map((s) => (
                  <p key={s.id} className="text-sm text-neutral-300">
                    {s.name}: {byStage.get(s.id) ?? 0}枚
                  </p>
                ))}
              </div>
            </div>

            {/* ゲスト予約 */}
            <div className="space-y-3">
              <h3 className="font-semibold">ゲスト予約(ご親族・ご友人向け)</h3>
              <GuestReservationForm
                stages={stages.map((s) => ({ id: s.id, label: `${s.name} (${fmtDateTime(s.starts_at)})` }))}
                seatClasses={seatClasses.map((sc) => ({
                  id: sc.id,
                  label: `${sc.name} ${yen(sc.price)} (${(sc.tk_areas as unknown as { kind: string }).kind === "reserved" ? "指定席" : "自由席"})`,
                }))}
              />
              <div className="space-y-2">
                {active
                  .filter((o) => o.channel === "guest")
                  .map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
                      <div>
                        <p>
                          {o.buyer_name} 様 ／ {stages.find((s) => s.id === o.stage_id)?.name} ／ {yen(o.total)}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {PAYMENT_METHOD_LABEL[o.payment_method]}
                          {o.settlement_method && ` (${SETTLEMENT_LABEL[o.settlement_method]})`} ／{" "}
                          {PAYMENT_STATUS_LABEL[o.payment_status]}
                        </p>
                        <p className="break-all text-xs text-neutral-500">
                          チケットURL: {SITE_URL}/my/{o.manage_token}
                        </p>
                      </div>
                      <form action={castCancelReservation.bind(null, o.id)}>
                        <button className="text-xs text-red-400 hover:underline">キャンセル</button>
                      </form>
                    </div>
                  ))}
              </div>
            </div>

            {/* 予約・購入一覧(自分の扱い分) */}
            <div>
              <h3 className="mb-2 font-semibold">あなたの扱いの購入一覧</h3>
              <div className="space-y-1 text-sm">
                {active.slice(0, 30).map((o) => (
                  <p key={o.id} className="text-neutral-300">
                    {fmtDateTime(o.created_at)} ／ {o.buyer_name} 様 ／ {yen(o.total)} ／{" "}
                    <span className={o.payment_status === "paid" ? "text-emerald-400" : "text-yellow-400"}>
                      {PAYMENT_STATUS_LABEL[o.payment_status]}
                    </span>
                  </p>
                ))}
                {pending.length > 0 && (
                  <p className="mt-2 text-xs text-yellow-500">未決済 {pending.length}件(当日現金・支払い待ち含む)</p>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
