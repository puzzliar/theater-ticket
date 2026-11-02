// どのサービスとしてビルド・配信されているか。
// ブランドは ZAGUMI(座組)。ZAGUMIスケジュール・ZAGUMIシフト・ZAGUMIチケットは ZAGUMIアカウント(Supabase Auth + core_)を共有するが、
// サービスとしては独立しており、別ドメイン・別 Vercel プロジェクトで配信する。同じリポジトリから NEXT_PUBLIC_APP で切り替える。
//   - (未設定)   ZAGUMIチケット
//   - rehearsal  ZAGUMIスケジュール(稽古〜本番の日程調整。全員出演型の公演)
//   - shift      ZAGUMIシフト(イマーシブ公演のシフト組み。回×役割の公演)
// スケジュールとシフトは同じ rh_ テーブルと画面を使い、公演の management_mode でどちらのサービスに属するかが決まる。
// クライアントコンポーネントからも参照するため server-only にしない。
export type AppKind = "ticket" | "rehearsal" | "shift";

const env = process.env.NEXT_PUBLIC_APP;
export const APP: AppKind = env === "rehearsal" || env === "schedule" ? "rehearsal" : env === "shift" ? "shift" : "ticket";
export const IS_SCHEDULE = APP === "rehearsal";
export const IS_SHIFT = APP === "shift";
// rh_ 基盤(スケジュール／シフト)のどちらか。チケットでないこと
export const IS_REHEARSAL = APP !== "ticket";

// このサービスが扱う公演の管理モード(rh_productions.management_mode)
export const PRODUCTION_MODE: "ensemble" | "shift" = IS_SHIFT ? "shift" : "ensemble";

export const BRAND = "ZAGUMI";
export const ACCOUNT_NAME = "ZAGUMIアカウント";
export const APP_NAME = IS_SHIFT ? "ZAGUMIシフト" : IS_SCHEDULE ? "ZAGUMIスケジュール" : "ZAGUMIチケット";
export const APP_LOGO = IS_SHIFT ? "/brand/zagumi-shift.svg" : IS_SCHEDULE ? "/brand/zagumi-schedule.svg" : "/brand/zagumi-ticket.svg";
export const APP_DESCRIPTION = IS_SHIFT
  ? "イマーシブ公演の回ごとのシフトを、主催者とキャストで組む"
  : IS_SCHEDULE
    ? "小劇場の稽古から本番までの予定を、座組全員で共有する"
    : "小劇場公演のチケット販売";
// 出演者ホーム(/me)の呼び名
export const HOME_LABEL = IS_SHIFT ? "マイシフト" : "マイスケジュール";

// ログイン直後の既定の遷移先
export const HOME_AFTER_LOGIN = IS_REHEARSAL ? "/me" : "/portal";

// 他サービスの URL(任意)。設定されていれば、こちらのサービスに存在しないパスを相手へ転送する。
// UI 上の相互リンクには使わない(サービスは独立させる方針)
export const TICKET_SITE_URL = process.env.NEXT_PUBLIC_TICKET_SITE_URL || null;
export const SCHEDULE_SITE_URL = process.env.NEXT_PUBLIC_SCHEDULE_SITE_URL || process.env.NEXT_PUBLIC_REHEARSAL_SITE_URL || null;
export const SHIFT_SITE_URL = process.env.NEXT_PUBLIC_SHIFT_SITE_URL || null;
