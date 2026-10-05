// どのサービスとしてビルド・配信されているか。
// ブランドは ZAGUMI(座組)。ZAGUMIスケジュールと ZAGUMIチケットは ZAGUMIアカウント(Supabase Auth + core_)を共有するが、サービスとしては独立しており、
// 別ドメイン・別 Vercel プロジェクトで配信する。同じリポジトリから NEXT_PUBLIC_APP で切り替える。
// クライアントコンポーネントからも参照するため server-only にしない。
export type AppKind = "ticket" | "rehearsal";

export const APP: AppKind = process.env.NEXT_PUBLIC_APP === "rehearsal" ? "rehearsal" : "ticket";
export const IS_REHEARSAL = APP === "rehearsal";

export const BRAND = "ZAGUMI";
export const ACCOUNT_NAME = "ZAGUMIアカウント";
export const APP_NAME = IS_REHEARSAL ? "ZAGUMIスケジュール" : "ZAGUMIチケット";
export const APP_DESCRIPTION = IS_REHEARSAL ? "小劇場・イマーシブシアターの稽古から本番までの予定を、座組全員で共有する" : "小劇場公演のチケット販売";

// ログイン直後の既定の遷移先
export const HOME_AFTER_LOGIN = IS_REHEARSAL ? "/me" : "/portal";

// 相手サービスの URL(任意)。設定されていれば、こちらのサービスに存在しないパスを相手へ転送する。
// UI 上の相互リンクには使わない(サービスは独立させる方針)
export const SIBLING_SITE_URL = (IS_REHEARSAL ? process.env.NEXT_PUBLIC_TICKET_SITE_URL : process.env.NEXT_PUBLIC_REHEARSAL_SITE_URL) || null;
