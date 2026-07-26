// 単一組織MVP。マルチテナント化時はリクエストコンテキストから解決する
export const ORG_ID = process.env.TICKET_ORG_ID ?? "a0000000-0000-4000-8000-000000000001";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// 購入フローの座席仮押さえ有効時間(分)。Stripe Checkoutの有効期限(30分)より長くする
export const HOLD_MINUTES = 35;

// 購入者都合キャンセル手数料率(要件 5.10)
export const CANCEL_FEE_RATE = 0.05;
