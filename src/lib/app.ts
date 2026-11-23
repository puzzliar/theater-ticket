// どのサービスとしてビルド・配信されているか。
// ブランドは ZAGUMI(座組)。ZAGUMIスケジュール・ZAGUMIシフト・ZAGUMIチケットは ZAGUMIアカウント(Supabase Auth + core_)を共有するが、
// サービスとしては独立しており、別ドメイン・別 Vercel プロジェクトで配信する。同じリポジトリから NEXT_PUBLIC_APP で切り替える。
//   - (未設定)   ZAGUMIチケット
//   - rehearsal  ZAGUMIスケジュール(稽古〜本番の日程調整。全員出演型の公演)
//   - shift      ZAGUMIシフト(イマーシブ公演のシフト組み。回×役割の公演)
//   - brand      ZAGUMI ブランドのトップページ(ルートドメイン用。サービス紹介と各サービスへの入口だけ)
// スケジュールとシフトは同じ rh_ テーブルと画面を使い、公演の management_mode でどちらのサービスに属するかが決まる。
// クライアントコンポーネントからも参照するため server-only にしない。
export type AppKind = "ticket" | "rehearsal" | "shift" | "brand";

const env = process.env.NEXT_PUBLIC_APP;
export const APP: AppKind = env === "rehearsal" || env === "schedule" ? "rehearsal" : env === "shift" ? "shift" : env === "brand" ? "brand" : "ticket";
export const IS_BRAND = APP === "brand";
export const IS_SCHEDULE = APP === "rehearsal";
export const IS_SHIFT = APP === "shift";
// rh_ 基盤(スケジュール／シフト)のどちらか
export const IS_REHEARSAL = APP === "rehearsal" || APP === "shift";

// このサービスが扱う公演の管理モード(rh_productions.management_mode)
export const PRODUCTION_MODE: "ensemble" | "shift" = IS_SHIFT ? "shift" : "ensemble";

export const BRAND = "ZAGUMI";
export const ACCOUNT_NAME = "ZAGUMIアカウント";
export const APP_NAME = IS_BRAND ? "ZAGUMI" : IS_SHIFT ? "ZAGUMIシフト" : IS_SCHEDULE ? "ZAGUMIスケジュール" : "ZAGUMIチケット";
export const APP_LOGO = IS_BRAND ? "/brand/zagumi-logo.svg" : IS_SHIFT ? "/brand/zagumi-shift.svg" : IS_SCHEDULE ? "/brand/zagumi-schedule.svg" : "/brand/zagumi-ticket.svg";
// ブラウザタブ用のアイコン(サービスの点だけ白)
export const APP_ICON = IS_BRAND ? "/brand/zagumi-icon.svg" : IS_SHIFT ? "/brand/zagumi-shift-icon.svg" : IS_SCHEDULE ? "/brand/zagumi-schedule-icon.svg" : "/brand/zagumi-ticket-icon.svg";
export const APP_DESCRIPTION = IS_BRAND
  ? "小劇場・イマーシブ公演のための座組の道具箱。スケジュール・シフト・チケットを 1 つのアカウントで"
  : IS_SHIFT
  ? "イマーシブ公演の回ごとのシフトを、主催者とキャストで組む"
  : IS_SCHEDULE
    ? "小劇場の稽古から本番までの予定を、座組全員で共有する"
    : "小劇場公演のチケット販売";
// 出演者ホーム(/me)の呼び名
export const HOME_LABEL = IS_SHIFT ? "マイシフト" : "マイスケジュール";

// ログイン直後の既定の遷移先
export const HOME_AFTER_LOGIN = IS_REHEARSAL ? "/me" : "/portal";

// ブランドのルートドメイン(例: zagumi.app)。設定すると各サービスの URL は schedule./shift./ticket. のサブドメインに既定で決まる。
// 個別に NEXT_PUBLIC_*_SITE_URL を設定すればそちらが優先(チケットを別ドメインに置く場合など)
export const BRAND_DOMAIN = process.env.NEXT_PUBLIC_BRAND_DOMAIN || null;
const sub = (host: string) => (BRAND_DOMAIN ? `https://${host}.${BRAND_DOMAIN}` : null);
// 他サービスの URL(任意)。設定されていれば、こちらのサービスに存在しないパスを相手へ転送する。
// 各サービスの画面には相互リンクを置かない(サービスは独立させる方針)。ブランドのトップページだけが入口として各サービスへリンクする
export const TICKET_SITE_URL = process.env.NEXT_PUBLIC_TICKET_SITE_URL || sub("ticket");
export const SCHEDULE_SITE_URL = process.env.NEXT_PUBLIC_SCHEDULE_SITE_URL || process.env.NEXT_PUBLIC_REHEARSAL_SITE_URL || sub("schedule");
export const SHIFT_SITE_URL = process.env.NEXT_PUBLIC_SHIFT_SITE_URL || sub("shift");
export const BRAND_SITE_URL = process.env.NEXT_PUBLIC_BRAND_SITE_URL || (BRAND_DOMAIN ? `https://${BRAND_DOMAIN}` : null);
