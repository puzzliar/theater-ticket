"use client";

import { useMemo, useState } from "react";
import type { AreaRow, SeatClassRow, SeatRow, StockRow, TicketTypeRow } from "@/lib/types";
import { yen } from "@/lib/format";
import SeatMap from "@/components/SeatMap";

interface Props {
  eventId: string;
  stageId: string;
  areas: AreaRow[];
  seatClasses: SeatClassRow[];
  ticketTypes: TicketTypeRow[];
  seats: SeatRow[];
  takenSeatIds: string[];
  stock: StockRow[];
  casts: { id: string; name: string; slug: string }[];
  defaultCastId: string | null;
}

export default function PurchaseForm(props: Props) {
  const taken = useMemo(() => new Set(props.takenSeatIds), [props.takenSeatIds]);
  // 席種ごとの選択状態: 自由席は枚数、指定席は座席ID配列
  const [qtyBySc, setQtyBySc] = useState<Record<string, number>>({});
  const [seatsBySc, setSeatsBySc] = useState<Record<string, string[]>>({});
  const [castId, setCastId] = useState<string | "">(props.defaultCastId ?? "");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaById = useMemo(() => new Map(props.areas.map((a) => [a.id, a])), [props.areas]);
  const typeBySc = useMemo(() => {
    const m = new Map<string, TicketTypeRow>();
    for (const t of props.ticketTypes) if (!m.has(t.seat_class_id)) m.set(t.seat_class_id, t);
    return m;
  }, [props.ticketTypes]);

  const items = useMemo(() => {
    const out: { ticketTypeId: string; qty: number; seatIds?: string[]; price: number; label: string }[] = [];
    for (const sc of props.seatClasses) {
      const tt = typeBySc.get(sc.id);
      if (!tt) continue;
      const area = areaById.get(sc.area_id);
      if (!area) continue;
      if (area.kind === "reserved") {
        const sel = seatsBySc[sc.id] ?? [];
        if (sel.length > 0)
          out.push({ ticketTypeId: tt.id, qty: sel.length, seatIds: sel, price: tt.price, label: sc.name });
      } else {
        const q = qtyBySc[sc.id] ?? 0;
        if (q > 0) out.push({ ticketTypeId: tt.id, qty: q, price: tt.price, label: sc.name });
      }
    }
    return out;
  }, [props.seatClasses, typeBySc, areaById, seatsBySc, qtyBySc]);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  async function submit() {
    setError(null);
    if (items.length === 0) return setError("チケットを選択してください");
    if (!buyerName.trim()) return setError("お名前を入力してください");
    if (!/.+@.+\..+/.test(buyerEmail)) return setError("メールアドレスを正しく入力してください");
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: props.eventId,
          stageId: props.stageId,
          castId: castId || null,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          items: items.map(({ ticketTypeId, qty, seatIds }) => ({ ticketTypeId, qty, seatIds })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 席種選択 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. チケットを選ぶ</h2>
        {props.seatClasses.map((sc) => {
          const area = areaById.get(sc.area_id);
          const tt = typeBySc.get(sc.id);
          if (!area || !tt) return null;
          if (area.kind === "reserved") {
            const areaSeats = props.seats.filter((s) => s.area_id === sc.area_id);
            const sel = seatsBySc[sc.id] ?? [];
            return (
              <div key={sc.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="font-medium">
                    {sc.name} <span className="text-sm text-neutral-400">(座席指定)</span>
                  </p>
                  <p className="text-amber-400">{yen(tt.price)}</p>
                </div>
                <p className="mb-2 text-xs text-neutral-400">座席図から席を選んでください(複数選択可)</p>
                <SeatMap
                  seats={areaSeats}
                  takenSeatIds={taken}
                  selectedSeatIds={sel}
                  onToggle={(seatId) =>
                    setSeatsBySc((prev) => {
                      const cur = prev[sc.id] ?? [];
                      return {
                        ...prev,
                        [sc.id]: cur.includes(seatId) ? cur.filter((x) => x !== seatId) : [...cur, seatId],
                      };
                    })
                  }
                />
                {sel.length > 0 && (
                  <p className="mt-2 text-sm text-neutral-300">
                    選択中:{" "}
                    {areaSeats
                      .filter((s) => sel.includes(s.id))
                      .sort((a, b) => a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number)
                      .map((s) => `${s.row_label}${s.seat_number}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            );
          }
          const st = props.stock.find((x) => x.area_id === sc.area_id);
          const remaining = st?.remaining ?? 0;
          return (
            <div key={sc.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {sc.name} <span className="text-sm text-neutral-400">(自由席・整理番号付き)</span>
                  </p>
                  <p className="text-sm text-neutral-400">
                    {remaining > 0 ? `残り${remaining}枚` : "完売"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-amber-400">{yen(tt.price)}</p>
                  <select
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1"
                    value={qtyBySc[sc.id] ?? 0}
                    onChange={(e) => setQtyBySc((p) => ({ ...p, [sc.id]: Number(e.target.value) }))}
                    disabled={remaining === 0}
                  >
                    {Array.from({ length: Math.min(remaining, 6) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}枚
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 扱い選択 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. ご案内キャスト</h2>
        <p className="text-sm text-neutral-400">
          どちらのお客様かをお選びください(出演者からのご案内でない場合は「一般」)。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCastId("")}
            className={`rounded-full border px-4 py-1.5 text-sm ${castId === "" ? "border-amber-400 bg-amber-500/20 text-amber-300" : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
          >
            一般
          </button>
          {props.casts.map((cast) => (
            <button
              key={cast.id}
              type="button"
              onClick={() => setCastId(cast.id)}
              className={`rounded-full border px-4 py-1.5 text-sm ${castId === cast.id ? "border-amber-400 bg-amber-500/20 text-amber-300" : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
            >
              {cast.name}
            </button>
          ))}
        </div>
      </section>

      {/* 購入者情報 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. お客様情報</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
            placeholder="お名前"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
          />
          <input
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
            placeholder="メールアドレス"
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
          />
        </div>
      </section>

      {/* 確定 */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        {items.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm text-neutral-300">
            {items.map((i) => (
              <li key={i.ticketTypeId}>
                {i.label} × {i.qty}枚 = {yen(i.price * i.qty)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">合計 {yen(total)}</p>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-amber-500 px-6 py-2 font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? "処理中..." : "決済へ進む"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <p className="mt-3 text-xs text-neutral-500">
          お支払い完了後、チケット(QRコード)ページのURLをメールでお送りします。購入者都合のキャンセルは販売額の5%+決済手数料を差し引いて返金します。
        </p>
      </section>
    </div>
  );
}
