"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  stages: { id: string; label: string }[];
  seatClasses: { id: string; label: string }[];
}

export default function GuestReservationForm({ stages, seatClasses }: Props) {
  const router = useRouter();
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [seatClassId, setSeatClassId] = useState(seatClasses[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash_at_door" | "cast_paid">("cash_at_door");
  const [settlement, setSettlement] = useState<"online" | "cash_at_door" | "cash_with_organizer">("cash_with_organizer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function submit(acceptSplit = false) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/guest-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId,
          seatClassId,
          qty,
          guestName,
          guestEmail: guestEmail || undefined,
          paymentMethod,
          settlementMethod: paymentMethod === "cast_paid" ? settlement : undefined,
          acceptSplit,
        }),
      });
      const json = await res.json();
      if (json.needsSplit) {
        // 要件5.7: 連番席が取れない場合の確認(断念 or 離れ席)
        const ok = window.confirm(
          "横並びの連番席が確保できません。離れた席でも予約しますか?\n(キャンセルを押すと予約を断念します)",
        );
        if (ok) {
          await submit(true);
        } else {
          setMessage({ type: "error", text: "予約を断念しました(座席は確保されていません)" });
          setBusy(false);
        }
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "エラーが発生しました");
      setMessage({
        type: "ok",
        text: `予約を確定しました。ゲスト用チケットURL: ${json.ticketUrl}(コピーしてゲストに共有してください)`,
      });
      setGuestName("");
      setGuestEmail("");
      setQty(1);
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm";

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select className={inputCls} value={seatClassId} onChange={(e) => setSeatClassId(e.target.value)}>
          {seatClasses.map((sc) => (
            <option key={sc.id} value={sc.id}>{sc.label}</option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="ゲストのお名前"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <select className={inputCls} value={qty} onChange={(e) => setQty(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n}枚</option>
          ))}
        </select>
        <select
          className={inputCls}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
        >
          <option value="cash_at_door">当日現金(受付で支払い)</option>
          <option value="online">オンライン決済(ゲストに決済リンク送付)</option>
          <option value="cast_paid">キャスト代払い</option>
        </select>
        {paymentMethod === "online" && (
          <input
            className={inputCls}
            type="email"
            placeholder="ゲストのメールアドレス"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
        )}
        {paymentMethod === "cast_paid" && (
          <select
            className={inputCls}
            value={settlement}
            onChange={(e) => setSettlement(e.target.value as typeof settlement)}
          >
            <option value="online">自分がオンラインで支払う</option>
            <option value="cash_at_door">当日受付で現金精算</option>
            <option value="cash_with_organizer">主催と現金精算(立替記録)</option>
          </select>
        )}
      </div>
      <button
        onClick={() => submit(false)}
        disabled={busy || !guestName.trim()}
        className="mt-3 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? "処理中..." : "予約を確定する"}
      </button>
      {message && (
        <p className={`mt-2 break-all text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        指定席は空き席から自動で割り当てます(複数枚は横並び連番を優先)。予約は即確定し、一般販売と同じ在庫から確保されます。
      </p>
    </div>
  );
}
