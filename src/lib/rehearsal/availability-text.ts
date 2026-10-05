import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/constants";
import { listProfileSessions } from "./schedule";
import { addDays, fmtDateLabel, jstDayRange, ts } from "./time";
import type { AvailabilityRow, AvailabilityShareRow } from "./types";

// 空き状況の ○×△ テキスト。主催者から「空いている日を教えて」と来たときに、
// 登録済みの予定(全座組)と空き時間から日ごとの判定を作り、LINE に貼れる文章にする。
// 予定の内容(どの座組・何の予定か)は一切含めない。

export interface AvailabilityOptions {
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  windowFrom: string; // HH:MM 判定対象の時間帯
  windowTo: string;
  emptyMark: "○" | "−"; // 予定も空き時間登録も無い日の扱い
}

export interface DayStatus {
  date: string;
  mark: "○" | "×" | "△" | "−";
  free: { from: string; to: string }[];
  hasInfo: boolean;
}

export const MAX_RANGE_DAYS = 62;
const DEFAULTS = { windowFrom: "10:00", windowTo: "22:00", emptyMark: "○" as const };

export function normalizeOptions(input: Partial<AvailabilityOptions> & { fromDate?: string; toDate?: string }, today: string): AvailabilityOptions {
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(input.fromDate ?? "") ? input.fromDate! : today;
  let toDate = /^\d{4}-\d{2}-\d{2}$/.test(input.toDate ?? "") ? input.toDate! : addDays(fromDate, 27);
  if (toDate < fromDate) toDate = fromDate;
  if (daysBetween(fromDate, toDate) > MAX_RANGE_DAYS - 1) toDate = addDays(fromDate, MAX_RANGE_DAYS - 1);
  const t = (v: string | undefined, d: string) => (/^\d{2}:\d{2}$/.test(v ?? "") ? v! : d);
  let windowFrom = t(input.windowFrom, DEFAULTS.windowFrom);
  let windowTo = t(input.windowTo, DEFAULTS.windowTo);
  if (minutes(windowTo) <= minutes(windowFrom)) {
    windowFrom = DEFAULTS.windowFrom;
    windowTo = DEFAULTS.windowTo;
  }
  return { fromDate, toDate, windowFrom, windowTo, emptyMark: input.emptyMark === "−" ? "−" : "○" };
}

function daysBetween(a: string, b: string): number {
  return Math.round((ts(`${b}T00:00:00+09:00`) - ts(`${a}T00:00:00+09:00`)) / 86400000);
}
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
type Iv = [number, number];
function clip(iv: Iv, win: Iv): Iv | null {
  const s = Math.max(iv[0], win[0]);
  const e = Math.min(iv[1], win[1]);
  return e > s ? [s, e] : null;
}
function union(ivs: Iv[]): Iv[] {
  const sorted = [...ivs].sort((a, b) => a[0] - b[0]);
  const out: Iv[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}
function subtract(base: Iv[], busy: Iv[]): Iv[] {
  let result = base;
  for (const b of union(busy)) {
    const next: Iv[] = [];
    for (const r of result) {
      if (b[1] <= r[0] || b[0] >= r[1]) next.push(r);
      else {
        if (b[0] > r[0]) next.push([r[0], b[0]]);
        if (b[1] < r[1]) next.push([b[1], r[1]]);
      }
    }
    result = next;
  }
  return result;
}

export async function computeDayStatuses(profileId: string, opts: AvailabilityOptions): Promise<DayStatus[]> {
  const rangeStart = jstDayRange(opts.fromDate).start;
  const rangeEnd = jstDayRange(opts.toDate).end;
  const [sessions, { data: avail }] = await Promise.all([
    listProfileSessions(profileId, rangeStart, rangeEnd),
    supabaseAdmin().from("rh_availability").select("*").eq("profile_id", profileId).lt("starts_at", rangeEnd).gt("ends_at", rangeStart),
  ]);
  const booked = sessions.filter((s) => s.response !== "no");
  const availRows = (avail ?? []) as AvailabilityRow[];
  const win: Iv = [minutes(opts.windowFrom), minutes(opts.windowTo)];
  const winLen = win[1] - win[0];
  const out: DayStatus[] = [];
  const n = daysBetween(opts.fromDate, opts.toDate);
  for (let i = 0; i <= n; i++) {
    const date = addDays(opts.fromDate, i);
    const dayStart = ts(jstDayRange(date).start);
    const toIv = (sIso: string, eIso: string): Iv | null => clip([(ts(sIso) - dayStart) / 60000, (ts(eIso) - dayStart) / 60000], win);
    const busy: Iv[] = [];
    const ok: Iv[] = [];
    for (const s of booked) {
      const iv = toIv(s.startsAt, s.endsAt);
      if (iv) busy.push(iv);
    }
    for (const a of availRows) {
      const iv = toIv(a.starts_at, a.ends_at);
      if (!iv) continue;
      if (a.status === "unavailable") busy.push(iv);
      else ok.push(iv);
    }
    const hasInfo = busy.length > 0 || ok.length > 0;
    if (!hasInfo) {
      out.push({ date, mark: opts.emptyMark, free: opts.emptyMark === "○" ? [{ from: opts.windowFrom, to: opts.windowTo }] : [], hasInfo });
      continue;
    }
    const base = ok.length ? union(ok) : [win];
    const free = subtract(base, busy).filter((iv) => iv[1] - iv[0] >= 30);
    const total = free.reduce((a, iv) => a + (iv[1] - iv[0]), 0);
    const mark: DayStatus["mark"] = total === 0 ? "×" : total >= winLen ? "○" : "△";
    out.push({ date, mark, free: free.map((iv) => ({ from: fmtMin(iv[0]), to: fmtMin(iv[1]) })), hasInfo });
  }
  return out;
}

export function formatAvailabilityText(name: string, statuses: DayStatus[], opts: AvailabilityOptions, extra: { shareUrl?: string } = {}): string {
  const lines = [`【空き状況】${name}　${fmtDateLabel(opts.fromDate)}〜${fmtDateLabel(opts.toDate)}`];
  for (const d of statuses) {
    const detail = d.mark === "△" ? ` ${d.free.map((r) => `${r.from}〜${r.to}`).join(", ")}` : "";
    lines.push(`${fmtDateLabel(d.date)} ${d.mark}${detail}`);
  }
  lines.push("");
  lines.push(`○=終日可(${opts.windowFrom}〜${opts.windowTo}) ×=不可 △=一部可(可能な時間帯)${statuses.some((d) => d.mark === "−") ? " −=未回答" : ""}`);
  if (extra.shareUrl) lines.push(`最新の状況: ${extra.shareUrl}`);
  lines.push(`ZAGUMIスケジュールで作成 ${SITE_URL}`);
  return lines.join("\n");
}

export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

// ---------- 共有リンク ----------
export async function createShare(profileId: string, opts: AvailabilityOptions, label: string, days: number): Promise<AvailabilityShareRow> {
  const { data, error } = await supabaseAdmin()
    .from("rh_availability_shares")
    .insert({
      profile_id: profileId,
      label,
      from_date: opts.fromDate,
      to_date: opts.toDate,
      window_from: opts.windowFrom,
      window_to: opts.windowTo,
      empty_mark: opts.emptyMark,
      expires_at: new Date(Date.now() + Math.max(1, days) * 24 * 3600 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AvailabilityShareRow;
}

export async function listShares(profileId: string): Promise<AvailabilityShareRow[]> {
  const { data } = await supabaseAdmin().from("rh_availability_shares").select("*").eq("profile_id", profileId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  return (data ?? []) as AvailabilityShareRow[];
}

export async function revokeShare(id: string, profileId: string): Promise<void> {
  await supabaseAdmin().from("rh_availability_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("profile_id", profileId);
}

export async function getShare(token: string): Promise<(AvailabilityShareRow & { display_name: string }) | null> {
  const { data } = await supabaseAdmin().from("rh_availability_shares").select("*, core_profiles(display_name, deleted_at)").eq("token", token).maybeSingle();
  if (!data) return null;
  const { core_profiles, ...share } = data as AvailabilityShareRow & { core_profiles: { display_name: string; deleted_at: string | null } | null };
  if (!core_profiles || core_profiles.deleted_at) return null;
  return { ...share, display_name: core_profiles.display_name };
}

export function shareUsable(s: AvailabilityShareRow): { ok: boolean; reason?: string } {
  if (s.revoked_at) return { ok: false, reason: "このリンクは無効化されています" };
  if (new Date(s.expires_at).getTime() < Date.now()) return { ok: false, reason: "このリンクは期限切れです" };
  return { ok: true };
}

export function shareOptions(s: AvailabilityShareRow): AvailabilityOptions {
  return { fromDate: s.from_date, toDate: s.to_date, windowFrom: s.window_from.slice(0, 5), windowTo: s.window_to.slice(0, 5), emptyMark: s.empty_mark };
}
