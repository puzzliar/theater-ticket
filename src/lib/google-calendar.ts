import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/constants";

// Google Calendar API クライアント(要件 5.7 方式B)。
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 未設定時は googleConfigured() が false になり、画面側で連携を案内しない。
// リフレッシュトークンは GOOGLE_TOKEN_KEY(無ければ service role key)から導出した鍵で AES-256-GCM 暗号化して保存する。

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${SITE_URL}/api/google/callback`;
}

function key(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("GOOGLE_TOKEN_KEY が未設定です");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(encoded: string): string {
  const [iv, tag, enc] = encoded.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// OAuth の state: memberId とタイムスタンプを HMAC 署名(CSRF 対策)。30分有効
export function signState(memberId: string): string {
  const payload = `${memberId}.${Date.now()}`;
  const sig = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [memberId, ts, sig] = parts;
  const expected = createHmac("sha256", key()).update(`${memberId}.${ts}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() - Number(ts) > 30 * 60 * 1000) return null;
  return memberId;
}

export function googleAuthUrl(memberId: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // 毎回 refresh_token を返させる
    include_granted_scopes: "true",
    state: signState(memberId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  if (!res.ok) throw new GoogleApiError(`token endpoint ${res.status}: ${await res.text()}`, res.status);
  return res.json();
}

export async function exchangeCode(code: string): Promise<{ refreshToken: string; email: string | null }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
  if (!t.refresh_token) throw new GoogleApiError("refresh_token が返されませんでした", 400);
  let email: string | null = null;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (res.ok) email = ((await res.json()) as { email?: string }).email ?? null;
  } catch {
    // email は表示用なので失敗しても続行
  }
  return { refreshToken: t.refresh_token, email };
}

export async function accessTokenFrom(refreshTokenEnc: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: decryptToken(refreshTokenEnc), grant_type: "refresh_token" });
  return t.access_token;
}

export async function revokeToken(refreshTokenEnc: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptToken(refreshTokenEnc))}`, { method: "POST" });
  } catch {
    // 失効に失敗しても DB 側の削除は行う
  }
}

const CAL = "https://www.googleapis.com/calendar/v3";

async function calFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CAL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export interface GcalEventInput {
  summary: string;
  description: string;
  location: string;
  start: string; // ISO
  end: string; // ISO
}

function eventBody(ev: GcalEventInput) {
  return {
    summary: ev.summary,
    description: ev.description,
    location: ev.location,
    start: { dateTime: ev.start, timeZone: "Asia/Tokyo" },
    end: { dateTime: ev.end, timeZone: "Asia/Tokyo" },
    // 本システムの予定を FreeBusy 取り込みで「不可」扱いしないよう、空き時間には影響させない
    transparency: "transparent",
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 120 }] },
    source: { title: "稽古管理", url: `${SITE_URL}/me` },
  };
}

// イベントの作成/更新。既存IDが無効(削除済み等)なら新規作成し、確定したIDを返す
export async function upsertEvent(accessToken: string, calendarId: string, eventId: string | null, ev: GcalEventInput): Promise<string> {
  const cal = encodeURIComponent(calendarId);
  if (eventId) {
    const res = await calFetch(accessToken, `/calendars/${cal}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(eventBody(ev)) });
    if (res.ok) return ((await res.json()) as { id: string }).id;
    if (res.status !== 404 && res.status !== 410) throw new GoogleApiError(`events.patch ${res.status}: ${await res.text()}`, res.status);
  }
  const res = await calFetch(accessToken, `/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(eventBody(ev)) });
  if (!res.ok) throw new GoogleApiError(`events.insert ${res.status}: ${await res.text()}`, res.status);
  return ((await res.json()) as { id: string }).id;
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new GoogleApiError(`events.delete ${res.status}: ${await res.text()}`, res.status);
}

// 予定ありの時間帯(内容は取得しない)
export async function freeBusy(accessToken: string, calendarId: string, timeMin: string, timeMax: string): Promise<{ start: string; end: string }[]> {
  const res = await calFetch(accessToken, `/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: "Asia/Tokyo", items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new GoogleApiError(`freeBusy ${res.status}: ${await res.text()}`, res.status);
  const json = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  const cal = json.calendars?.[calendarId] ?? Object.values(json.calendars ?? {})[0];
  return cal?.busy ?? [];
}
