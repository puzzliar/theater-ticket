"use client";

import { useMemo, useState, useTransition } from "react";
import { yen, PAYMENT_METHOD_LABEL, CHANNEL_LABEL } from "@/lib/format";
import { checkinTicket, undoCheckin, receiveCash } from "../../actions";

export interface ReceptionOrder {
  id: string;
  buyerName: string;
  channel: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  tickets: { id: string; label: string; qrToken: string; checkedIn: boolean }[];
}

// 受付リスト: QRコード読み取り(トークン入力/ペースト) + 名前検索 + タップでチェックイン
export default function CheckinList({ stageId, orders }: { stageId: string; orders: ReceptionOrder[] }) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.buyerName.toLowerCase().includes(q) ||
        o.tickets.some((t) => t.qrToken === q || t.label.toLowerCase().includes(q)),
    );
  }, [orders, query]);

  const totalCount = orders.flatMap((o) => o.tickets).length;
  const checkedCount = orders.flatMap((o) => o.tickets).filter((t) => t.checkedIn).length;

  function scanSubmit() {
    const q = query.trim();
    const hit = orders.flatMap((o) => o.tickets).find((t) => t.qrToken === q);
    if (!hit) {
      setFlash("❌ 該当するチケットがありません(QRトークン不一致)");
      return;
    }
    if (hit.checkedIn) {
      setFlash("⚠️ このチケットは入場済みです");
      return;
    }
    startTransition(async () => {
      await checkinTicket(hit.id, stageId);
      setFlash("✅ チェックインしました");
      setQuery("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-400">
          入場 {checkedCount} / {totalCount} 枚
        </p>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2"
            placeholder="QRコードの読取値を入力/ペースト、またはお名前で検索"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFlash(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && scanSubmit()}
          />
          <button
            onClick={scanSubmit}
            disabled={pending}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            照合
          </button>
        </div>
        {flash && <p className="mt-2 text-sm">{flash}</p>}
        <p className="mt-2 text-xs text-neutral-500">
          QRリーダー/カメラアプリで読み取った値をそのまま入力欄に貼り付けてEnterで照合できます。
        </p>
      </div>

      <div className="space-y-3">
        {filtered.map((o) => (
          <div key={o.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{o.buyerName} 様</p>
                <p className="text-xs text-neutral-400">
                  {CHANNEL_LABEL[o.channel]} ／ {PAYMENT_METHOD_LABEL[o.paymentMethod]} ／ {yen(o.total)}
                </p>
              </div>
              {o.paymentStatus === "pending" ? (
                <button
                  onClick={() => startTransition(() => receiveCash(o.id, stageId))}
                  disabled={pending}
                  className="rounded-md bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
                >
                  💴 未収 {yen(o.total)} を収受
                </button>
              ) : (
                <span className="text-xs text-emerald-400">支払済み</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {o.tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    startTransition(() => (t.checkedIn ? undoCheckin(t.id, stageId) : checkinTicket(t.id, stageId)))
                  }
                  disabled={pending}
                  className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    t.checkedIn
                      ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                      : "border-neutral-600 bg-neutral-800 text-neutral-200 hover:border-amber-400"
                  }`}
                >
                  {t.checkedIn ? "✅" : "🎫"} {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-neutral-500">該当する予約がありません。</p>}
      </div>
    </div>
  );
}
