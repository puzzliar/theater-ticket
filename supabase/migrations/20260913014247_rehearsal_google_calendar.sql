-- 稽古管理: Google Calendar API 連携(要件 5.7 方式B)
-- メンバーごとの OAuth リフレッシュトークン(アプリ側で暗号化して保存)と、召集ごとの Google イベントID を持つ。

alter table rh_members
  add column google_refresh_token_enc text,          -- AES-256-GCM で暗号化(鍵: GOOGLE_TOKEN_KEY)
  add column google_email text,
  add column google_calendar_id text not null default 'primary',
  add column google_connected_at timestamptz,
  add column google_freebusy_import boolean not null default true;  -- 予定ありを「不可」として自動取り込み

alter table rh_session_members
  add column google_event_id text;

-- RLS ヘルパーは RLS ポリシー内(authenticated)で使うだけなので anon からの直接実行は不要
revoke execute on function rh_my_member_id() from anon;
