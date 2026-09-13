import "server-only";
import webpush from "web-push";

// Web プッシュ(VAPID)。無料で使える通知チャネル。鍵は `npx web-push generate-vapid-keys` で生成
let configured = false;

export function webpushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensure(): boolean {
  if (!webpushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@puzzliar.jp", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendWebPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<"ok" | "gone" | "error"> {
  if (!ensure()) return "error";
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("webpush failed", status, e);
    return "error";
  }
}
