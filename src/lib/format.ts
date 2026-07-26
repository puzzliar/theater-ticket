export function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  online: "オンライン決済",
  cash_at_door: "当日現金",
  cast_paid: "キャスト代払い",
};

export const SETTLEMENT_LABEL: Record<string, string> = {
  online: "キャストがオンライン決済",
  cash_at_door: "当日受付で現金精算",
  cash_with_organizer: "主催と現金精算(立替)",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "未決済",
  paid: "支払済み",
  cancelled: "キャンセル",
  refunded: "返金済み",
  partially_refunded: "一部返金",
};

export const CHANNEL_LABEL: Record<string, string> = {
  general: "一般販売",
  guest: "ゲスト予約",
  door: "当日券",
};
