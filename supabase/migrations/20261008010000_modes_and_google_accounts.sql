-- 主催者/出演者モードと、モードごとの Google カレンダー連携
-- docs/rehearsal-requirements.md 5.16

-- 利用モード(ログイン後に切り替える)。Cookie にも持つが、既定値として保存する
alter table core_profiles add column if not exists active_mode text not null default 'cast' check (active_mode in ('cast','organizer'));

-- 外部連携をモードごとに持てるようにする(出演者用と主催者用で別の Google アカウントを使うケース)。
-- 同じ Google アカウントを複数人(劇団の共用アカウント)や両モードで使えるよう、provider_uid の一意制約は LINE だけに限定する
alter table core_identities add column if not exists mode text not null default 'cast' check (mode in ('cast','organizer'));
alter table core_identities drop constraint if exists core_identities_pkey;
alter table core_identities drop constraint if exists core_identities_provider_provider_uid_key;
alter table core_identities add primary key (profile_id, provider, mode);
create unique index if not exists core_identities_line_uid_uq on core_identities (provider_uid) where provider = 'line';

-- 主催者モードのカレンダー同期で作ったイベント(召集メンバー分は rh_session_members.google_event_id)
create table rh_calendar_events (
  session_id uuid not null references rh_sessions(id) on delete cascade,
  profile_id uuid not null references core_profiles(id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);
alter table rh_calendar_events enable row level security;
create policy rh_calendar_events_self on rh_calendar_events for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
