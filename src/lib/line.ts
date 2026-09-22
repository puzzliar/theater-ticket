import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// LINE Messaging API クライアント。LINE_CHANNEL_ACCESS_TOKEN 未設定時は no-op。
// 公式アカウントを友だち追加したメンバーへプッシュ通知し、Webhook で問い合わせに応答する。

const API = "https://api.line.me/v2/bot";

export function lineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

export function lineAddFriendUrl(): string | null {
  return process.env.LINE_ADD_FRIEND_URL ?? null;
}

// Webhook 署名検証(X-Line-Signature = base64(HMAC-SHA256(channel secret, body)))
export function verifyLineSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function call(path: string, payload: unknown): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("LINE API error", path, res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("LINE API failed", path, e);
    return false;
  }
}

export async function linePush(lineUserId: string, text: string): Promise<boolean> {
  return call("/message/push", { to: lineUserId, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}

export async function lineReply(replyToken: string, text: string): Promise<boolean> {
  return call("/message/reply", { replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}

// Webhook イベント(必要な項目のみ)
export interface LineWebhookEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}
