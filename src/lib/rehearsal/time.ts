// 稽古管理の日時ヘルパー。保存はUTC、入力・表示は Asia/Tokyo 固定。

export const TZ = "Asia/Tokyo";

// <input type="datetime-local"> の値("2026-09-20T18:00")を JST として ISO(UTC) に変換
export function jstToIso(local: string): string {
  if (!local) throw new Error("日時が未入力です");
  const normalized = local.length === 16 ? `${local}:00` : local;
  const d = new Date(`${normalized}+09:00`);
  if (Number.isNaN(d.getTime())) throw new Error("日時の形式が不正です");
  return d.toISOString();
}

// ISO(UTC) → datetime-local 用の JST 文字列("2026-09-20T18:00")
export function isoToJstLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// JST の日付文字列 "YYYY-MM-DD"
export function jstDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// "YYYY-MM-DD" の JST 0:00 / 翌日 0:00 を ISO で返す
export function jstDayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return jstDateString(d);
}

// JST の時(0-23)
export function jstHour(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(d).replace(/\D/g, "")) % 24;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtDate(startIso)} ${fmtTime(startIso)}〜${fmtTime(endIso)}`;
}

export function fmtDateLabel(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toLocaleDateString("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" });
}

// Supabase の "+00:00" 形式と toISOString の "Z" 形式が混在するため、文字列比較ではなく時刻値で比較する
export function ts(iso: string): number {
  return new Date(iso).getTime();
}

// Server Component 内で直接 Date.now() を呼ぶと react-hooks/purity に抵触するため、リクエスト時刻はここから取得する
export function nowMs(): number {
  return Date.now();
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return ts(aStart) < ts(bEnd) && ts(bStart) < ts(aEnd);
}
