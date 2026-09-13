import "server-only";
import { randomBytes } from "node:crypto";
import { SITE_URL } from "@/lib/constants";

// LINE Login v2.1 (OIDC)。Supabase Auth に LINE プロバイダが無いため自前で実装する(docs/account-platform.md A1)。
// LINE Developers の同一プロバイダー配下に「ログインチャネル」と「Messaging API チャネル」を置くと userId が一致し、
// ログインだけで通知の宛先も確定する(A2)。

export function lineLoginConfigured(): boolean {
  return Boolean(process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET);
}

export function lineLoginRedirectUri(): string {
  return `${SITE_URL}/auth/line/callback`;
}

export function newStateAndNonce(): { state: string; nonce: string } {
  return { state: randomBytes(16).toString("hex"), nonce: randomBytes(16).toString("hex") };
}

export function lineAuthorizeUrl(state: string, nonce: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    redirect_uri: lineLoginRedirectUri(),
    state,
    scope: "profile openid email",
    nonce,
    bot_prompt: "aggressive", // 公式アカウント連携済みなら友だち追加を同時に案内
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q.toString()}`;
}

export interface LineUser {
  sub: string;
  name: string | null;
  picture: string | null;
  email: string | null;
}

// 認可コード → id_token → LINE の verify エンドポイントで検証(署名・aud・nonce)
export async function exchangeLineCode(code: string, nonce: string): Promise<LineUser> {
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: lineLoginRedirectUri(),
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    }),
  });
  if (!tokenRes.ok) throw new Error(`LINE token ${tokenRes.status}: ${await tokenRes.text()}`);
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) throw new Error("LINE id_token がありません");

  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token, client_id: process.env.LINE_LOGIN_CHANNEL_ID!, nonce }),
  });
  if (!verifyRes.ok) throw new Error(`LINE verify ${verifyRes.status}: ${await verifyRes.text()}`);
  const claims = (await verifyRes.json()) as { sub: string; name?: string; picture?: string; email?: string };
  return { sub: claims.sub, name: claims.name ?? null, picture: claims.picture ?? null, email: claims.email ?? null };
}

// LINE のみで登録した人の代替メールアドレス(通知には使わない)
export function syntheticLineEmail(sub: string): string {
  return `line-${sub.toLowerCase()}@line.puzzliar.jp`;
}
