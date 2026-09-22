-- 共通アカウント基盤 (core_) の新設と、稽古管理 (rh_) の v2 への作り直し
-- docs/account-platform.md v0.1 / docs/rehearsal-requirements.md v0.2 準拠
-- ※ rh_ v1 テーブルは未使用(0件)のため drop して再作成する。tk_ (チケット) は変更しない。
-- ※ Supabase プロジェクト wiqnmebudaadwqdaxwko に適用済み (version 20260913060921)

-- ========== 旧 rh_ の撤去 ==========
drop view if exists rh_scene_progress_v1;
drop table if exists rh_line_webhook_events, rh_notifications, rh_substitution_candidates, rh_substitution_requests,
  rh_availability, rh_session_members, rh_session_scenes, rh_sessions, rh_scene_members, rh_scenes,
  rh_production_members, rh_productions, rh_members cascade;
drop function if exists rh_my_member_id();

-- ========== core_: 人 ==========
create table core_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  default_part text not null default 'cast' check (default_part in ('cast','staff','director','organizer')),
  is_platform_admin boolean not null default false,
  onboarded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 外部ID(ログイン以外の連携)。line: LINE Login の sub = Messaging API の userId(同一プロバイダー配下)
create table core_identities (
  profile_id uuid not null references core_profiles(id) on delete cascade,
  provider text not null check (provider in ('line','google_calendar')),
  provider_uid text not null,
  email text,
  display_name text,
  secret_enc text,                                   -- refresh token 等(AES-256-GCM)
  meta jsonb not null default '{}',
  connected_at timestamptz not null default now(),
  primary key (profile_id, provider),
  unique (provider, provider_uid)
);

create table core_consents (
  id bigserial primary key,
  profile_id uuid not null references core_profiles(id) on delete cascade,
  kind text not null check (kind in ('terms','privacy','marketing','availability_sharing')),
  version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now()
);
create index core_idx_consents_profile on core_consents (profile_id, kind, recorded_at desc);

-- ========== core_: 組織 ==========
create table core_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name text not null,
  kind text not null default 'troupe' check (kind in ('troupe','producer','individual','other')),
  region text,
  status text not null default 'active' check (status in ('active','archived','suspended')),
  created_by uuid references core_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core_org_members (
  org_id uuid not null references core_organizations(id) on delete cascade,
  profile_id uuid not null references core_profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  part text not null default 'cast' check (part in ('cast','staff','director','organizer')),
  status text not null default 'active' check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  primary key (org_id, profile_id)
);
create index core_idx_org_members_profile on core_org_members (profile_id) where status = 'active';

create table core_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core_organizations(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12),'hex'),
  role text not null default 'member' check (role in ('admin','member')),
  part text check (part in ('cast','staff','director','organizer')),
  label text not null default '',
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz not null,
  created_by uuid references core_profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- 招待制(β)期間の組織作成コード。運営(platform admin)が発行する
create table core_organizer_codes (
  code text primary key,
  note text not null default '',
  max_uses int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz,
  created_by uuid references core_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table core_audit_logs (
  id bigserial primary key,
  org_id uuid,
  actor_profile_id uuid,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index core_idx_audit_org on core_audit_logs (org_id, created_at desc);

-- ========== core_: RLS ヘルパー ==========
create function core_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from core_org_members
                 where org_id = p_org and profile_id = auth.uid() and status = 'active')
$$;
create function core_is_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from core_org_members
                 where org_id = p_org and profile_id = auth.uid() and status = 'active'
                   and role in ('owner','admin'))
$$;
create function core_my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from core_org_members where profile_id = auth.uid() and status = 'active'
$$;
create function core_is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from core_profiles where id = auth.uid()), false)
$$;
-- 同じ組織に所属している相手か(プロフィール参照用)
create function core_shares_org_with(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from core_org_members a join core_org_members b on a.org_id = b.org_id
                 where a.profile_id = auth.uid() and b.profile_id = p_profile
                   and a.status = 'active' and b.status = 'active')
$$;
revoke execute on function core_is_member(uuid), core_is_admin(uuid), core_my_org_ids(), core_is_platform_admin(), core_shares_org_with(uuid) from anon;

-- ========== core_: auth.users → core_profiles 自動作成 ==========
create function core_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into core_profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger core_on_auth_user_created after insert on auth.users
  for each row execute function core_handle_new_user();

-- 既存ユーザーのバックフィル
insert into core_profiles (id, display_name, email)
select id,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(coalesce(email,''), '@', 1)),
  email
from auth.users
on conflict (id) do nothing;

-- 運営アカウント
update core_profiles set is_platform_admin = true where email = 'harbingerstar@gmail.com';

-- 既存のチケット組織(PUZZLIAR)を共通基盤へ複製(同一UUID)。tk_ 側は変更しない
insert into core_organizations (id, slug, name, kind, created_by)
select id, 'puzzliar', name, 'troupe', (select user_id from tk_app_users where role = 'admin' limit 1)
from tk_organizations
on conflict (id) do nothing;
insert into core_org_members (org_id, profile_id, role, part)
select org_id, user_id,
  case role when 'admin' then 'owner' else 'member' end,
  case role when 'admin' then 'organizer' when 'staff' then 'staff' else 'cast' end
from tk_app_users
on conflict (org_id, profile_id) do nothing;

-- ========== core_: RLS ==========
alter table core_profiles enable row level security;
alter table core_identities enable row level security;
alter table core_consents enable row level security;
alter table core_organizations enable row level security;
alter table core_org_members enable row level security;
alter table core_invitations enable row level security;
alter table core_organizer_codes enable row level security;
alter table core_audit_logs enable row level security;

create policy core_profiles_read on core_profiles
  for select using (id = auth.uid() or core_shares_org_with(id) or core_is_platform_admin());
create policy core_profiles_self_update on core_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy core_identities_self on core_identities
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy core_consents_self on core_consents
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy core_orgs_member_read on core_organizations
  for select using (core_is_member(id) or core_is_platform_admin());
create policy core_orgs_admin_update on core_organizations
  for update using (core_is_admin(id)) with check (core_is_admin(id));
create policy core_org_members_read on core_org_members
  for select using (core_is_member(org_id) or core_is_platform_admin());
create policy core_org_members_admin_write on core_org_members
  for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy core_invitations_admin on core_invitations
  for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy core_organizer_codes_platform on core_organizer_codes
  for all using (core_is_platform_admin()) with check (core_is_platform_admin());
create policy core_audit_admin_read on core_audit_logs
  for select using ((org_id is not null and core_is_admin(org_id)) or core_is_platform_admin());

-- ========== rh_ v2: 個人設定 ==========
create table rh_profile_settings (
  profile_id uuid primary key references core_profiles(id) on delete cascade,
  ical_token text not null unique default encode(gen_random_bytes(16),'hex'),
  line_link_code text unique,
  line_link_expires_at timestamptz,
  google_calendar_id text not null default 'primary',
  google_freebusy_import boolean not null default true,
  -- 通知種別ごとの希望チャネル。使えない場合は line → webpush → email の順で代替
  notify_digest text not null default 'email' check (notify_digest in ('line','webpush','email','none')),
  notify_reminder text not null default 'email' check (notify_reminder in ('line','webpush','email','none')),
  notify_invite text not null default 'webpush' check (notify_invite in ('line','webpush','email','none')),
  notify_substitution text not null default 'line' check (notify_substitution in ('line','webpush','email','none')),
  updated_at timestamptz not null default now()
);

create table rh_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references core_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index rh_idx_push_profile on rh_push_subscriptions (profile_id);

-- ========== rh_ v2: 組織内 ==========
create table rh_productions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core_organizations(id) on delete cascade,
  tk_event_id uuid references tk_events(id) on delete set null,
  name text not null,
  status text not null default 'rehearsing' check (status in ('planning','rehearsing','running','closed')),
  default_location text not null default '',
  rehearsal_starts_on date,
  opens_on date,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index rh_idx_productions_org on rh_productions (org_id);

-- 組織内の参加者。profile_id が null のものは「仮メンバー」(本人未登録)
create table rh_participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core_organizations(id) on delete cascade,
  profile_id uuid references core_profiles(id) on delete set null,
  display_name text not null,
  part text not null default 'cast' check (part in ('cast','staff','director','organizer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index rh_uq_participant_profile on rh_participants (org_id, profile_id) where profile_id is not null;
create index rh_idx_participants_org on rh_participants (org_id);

create table rh_production_members (
  production_id uuid not null references rh_productions(id) on delete cascade,
  participant_id uuid not null references rh_participants(id) on delete cascade,
  org_id uuid not null,
  role_name text not null default '',
  primary key (production_id, participant_id)
);

create table rh_scenes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  production_id uuid not null references rh_productions(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order int not null default 0,
  target_count int not null default 1 check (target_count >= 1),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (production_id, code)
);

create table rh_scene_members (
  scene_id uuid not null references rh_scenes(id) on delete cascade,
  participant_id uuid not null references rh_participants(id) on delete cascade,
  org_id uuid not null,
  primary key (scene_id, participant_id)
);

create table rh_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  production_id uuid not null references rh_productions(id) on delete cascade,
  kind text not null default 'rehearsal' check (kind in ('rehearsal','performance','other')),
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  note text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index rh_idx_sessions_org_time on rh_sessions (org_id, starts_at);

create table rh_session_scenes (
  session_id uuid not null references rh_sessions(id) on delete cascade,
  scene_id uuid not null references rh_scenes(id) on delete cascade,
  org_id uuid not null,
  status text not null default 'planned' check (status in ('planned','done','skipped')),
  primary key (session_id, scene_id)
);

create table rh_session_members (
  session_id uuid not null references rh_sessions(id) on delete cascade,
  participant_id uuid not null references rh_participants(id) on delete cascade,
  org_id uuid not null,
  required boolean not null default true,
  response text not null default 'pending' check (response in ('pending','yes','no','maybe')),
  attendance text not null default 'unknown' check (attendance in ('unknown','present','absent','late')),
  note text not null default '',
  notified_at timestamptz,
  google_event_id text,
  primary key (session_id, participant_id)
);
create index rh_idx_session_members_participant on rh_session_members (participant_id);

-- 可用性は個人(プロフィール)に属する
create table rh_availability (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references core_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('available','unavailable')),
  note text not null default '',
  source text not null default 'manual' check (source in ('manual','calendar')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index rh_idx_availability_profile_time on rh_availability (profile_id, starts_at);

create table rh_substitution_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  session_id uuid not null references rh_sessions(id) on delete cascade,
  absent_participant_id uuid not null references rh_participants(id),
  reason text not null default '',
  status text not null default 'open' check (status in ('open','filled','cancelled')),
  filled_by_participant_id uuid references rh_participants(id),
  created_at timestamptz not null default now(),
  filled_at timestamptz
);
create table rh_substitution_candidates (
  request_id uuid not null references rh_substitution_requests(id) on delete cascade,
  participant_id uuid not null references rh_participants(id) on delete cascade,
  org_id uuid not null,
  applied_at timestamptz,
  primary key (request_id, participant_id)
);

create table rh_notifications (
  id bigserial primary key,
  profile_id uuid references core_profiles(id) on delete set null,
  channel text not null check (channel in ('line','webpush','email','none')),
  dedupe_key text not null unique,
  payload jsonb,
  sent_at timestamptz not null default now()
);
create index rh_idx_notifications_channel_time on rh_notifications (channel, sent_at);

create table rh_line_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

-- ========== rh_ v2: 進捗ビュー ==========
create view rh_scene_progress_v1 with (security_invoker = true) as
select
  sc.org_id, sc.production_id, sc.id as scene_id, sc.code, sc.name, sc.sort_order, sc.target_count,
  count(ss.session_id) filter (where ss.status = 'done' and s.status = 'done') as done_count,
  max(s.starts_at) filter (where ss.status = 'done' and s.status = 'done') as last_done_at
from rh_scenes sc
left join rh_session_scenes ss on ss.scene_id = sc.id
left join rh_sessions s on s.id = ss.session_id
group by sc.org_id, sc.production_id, sc.id, sc.code, sc.name, sc.sort_order, sc.target_count;

-- ========== rh_ v2: RLS ==========
alter table rh_profile_settings enable row level security;
alter table rh_push_subscriptions enable row level security;
alter table rh_productions enable row level security;
alter table rh_participants enable row level security;
alter table rh_production_members enable row level security;
alter table rh_scenes enable row level security;
alter table rh_scene_members enable row level security;
alter table rh_sessions enable row level security;
alter table rh_session_scenes enable row level security;
alter table rh_session_members enable row level security;
alter table rh_availability enable row level security;
alter table rh_substitution_requests enable row level security;
alter table rh_substitution_candidates enable row level security;
alter table rh_notifications enable row level security;
alter table rh_line_webhook_events enable row level security;

-- 個人データ: 本人のみ
create policy rh_profile_settings_self on rh_profile_settings for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rh_push_self on rh_push_subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rh_notifications_self_read on rh_notifications for select using (profile_id = auth.uid());
-- 可用性: 本人は全操作。同じ組織の admin は参照可(マトリクス用)。他メンバーには見せない
create policy rh_availability_self on rh_availability for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rh_availability_org_admin_read on rh_availability
  for select using (exists (select 1 from core_org_members a join core_org_members b on a.org_id = b.org_id
                            where a.profile_id = auth.uid() and a.role in ('owner','admin') and a.status = 'active'
                              and b.profile_id = rh_availability.profile_id and b.status = 'active'));

-- 組織データ: メンバーは参照、admin は全操作
create policy rh_productions_member_read on rh_productions for select using (core_is_member(org_id));
create policy rh_productions_admin_all on rh_productions for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_participants_member_read on rh_participants for select using (core_is_member(org_id));
create policy rh_participants_admin_all on rh_participants for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_pm_member_read on rh_production_members for select using (core_is_member(org_id));
create policy rh_pm_admin_all on rh_production_members for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_scenes_member_read on rh_scenes for select using (core_is_member(org_id));
create policy rh_scenes_admin_all on rh_scenes for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_scene_members_member_read on rh_scene_members for select using (core_is_member(org_id));
create policy rh_scene_members_admin_all on rh_scene_members for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_sessions_member_read on rh_sessions for select using (core_is_member(org_id));
create policy rh_sessions_admin_all on rh_sessions for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_session_scenes_member_read on rh_session_scenes for select using (core_is_member(org_id));
create policy rh_session_scenes_admin_all on rh_session_scenes for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_session_members_member_read on rh_session_members for select using (core_is_member(org_id));
create policy rh_session_members_admin_all on rh_session_members for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
-- 自分の召集行(出欠回答)は本人が更新できる
create policy rh_session_members_self_update on rh_session_members
  for update using (exists (select 1 from rh_participants p where p.id = participant_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from rh_participants p where p.id = participant_id and p.profile_id = auth.uid()));
create policy rh_subreq_member_read on rh_substitution_requests for select using (core_is_member(org_id));
create policy rh_subreq_admin_all on rh_substitution_requests for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
create policy rh_subcand_member_read on rh_substitution_candidates for select using (core_is_member(org_id));
create policy rh_subcand_admin_all on rh_substitution_candidates for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
