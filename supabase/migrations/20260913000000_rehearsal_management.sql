-- 稽古・シフト管理 (docs/rehearsal-requirements.md v0.1 準拠)
-- 共有プロジェクトのため全テーブル rh_ プレフィックス。
-- 組織・公演・アカウントはチケットシステム (tk_) のものを参照する。

-- ========== メンバー(公演横断の人物) ==========
create table rh_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tk_organizations(id),
  user_id uuid references auth.users(id) on delete set null,   -- ログインアカウント(任意)
  name text not null,
  kind text not null default 'cast' check (kind in ('cast','staff','director')),
  email text,                                                  -- LINE未連携時の通知先
  line_user_id text unique,                                    -- LINE Messaging API の userId
  line_link_code text unique,                                  -- 連携用ワンタイムコード(6桁)
  line_link_expires_at timestamptz,
  ical_token text not null unique default encode(gen_random_bytes(16),'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index rh_uq_member_user on rh_members (user_id) where user_id is not null;

-- ========== プロダクション(稽古・本番の管理単位) ==========
create table rh_productions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tk_organizations(id),
  tk_event_id uuid references tk_events(id) on delete set null, -- チケット公演との紐づけ(任意)
  name text not null,
  status text not null default 'rehearsing' check (status in ('planning','rehearsing','running','closed')),
  default_location text not null default '',
  rehearsal_starts_on date,
  opens_on date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table rh_production_members (
  production_id uuid not null references rh_productions(id) on delete cascade,
  member_id uuid not null references rh_members(id) on delete cascade,
  org_id uuid not null,
  part text not null default 'cast' check (part in ('cast','staff','director')),
  role_name text not null default '',       -- 役名
  primary key (production_id, member_id)
);

-- ========== シーン ==========
create table rh_scenes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  production_id uuid not null references rh_productions(id) on delete cascade,
  code text not null,                       -- 「1-3」「ルートB-2」など
  name text not null,
  sort_order int not null default 0,
  target_count int not null default 1 check (target_count >= 1),  -- 目標稽古回数
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (production_id, code)
);

create table rh_scene_members (
  scene_id uuid not null references rh_scenes(id) on delete cascade,
  member_id uuid not null references rh_members(id) on delete cascade,
  org_id uuid not null,
  primary key (scene_id, member_id)
);

-- ========== 稽古枠 / 本番回 ==========
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
create index rh_idx_sessions_time on rh_sessions (starts_at);

create table rh_session_scenes (
  session_id uuid not null references rh_sessions(id) on delete cascade,
  scene_id uuid not null references rh_scenes(id) on delete cascade,
  org_id uuid not null,
  status text not null default 'planned' check (status in ('planned','done','skipped')),
  primary key (session_id, scene_id)
);

create table rh_session_members (
  session_id uuid not null references rh_sessions(id) on delete cascade,
  member_id uuid not null references rh_members(id) on delete cascade,
  org_id uuid not null,
  required boolean not null default true,
  response text not null default 'pending' check (response in ('pending','yes','no','maybe')),
  attendance text not null default 'unknown' check (attendance in ('unknown','present','absent','late')),
  note text not null default '',
  notified_at timestamptz,
  primary key (session_id, member_id)
);
create index rh_idx_session_members_member on rh_session_members (member_id);

-- ========== 可用性(空き時間) ==========
create table rh_availability (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null references rh_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('available','unavailable')),
  note text not null default '',
  source text not null default 'manual' check (source in ('manual','calendar')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index rh_idx_availability_member_time on rh_availability (member_id, starts_at);

-- ========== 代役募集 ==========
create table rh_substitution_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  session_id uuid not null references rh_sessions(id) on delete cascade,
  absent_member_id uuid not null references rh_members(id),
  reason text not null default '',
  status text not null default 'open' check (status in ('open','filled','cancelled')),
  filled_by_member_id uuid references rh_members(id),
  created_at timestamptz not null default now(),
  filled_at timestamptz
);
create index rh_idx_subreq_status on rh_substitution_requests (status);

-- 候補者(通知済み・応募状況)
create table rh_substitution_candidates (
  request_id uuid not null references rh_substitution_requests(id) on delete cascade,
  member_id uuid not null references rh_members(id) on delete cascade,
  org_id uuid not null,
  applied_at timestamptz,
  primary key (request_id, member_id)
);

-- ========== 通知ログ(冪等化) ==========
create table rh_notifications (
  id bigserial primary key,
  org_id uuid not null,
  member_id uuid references rh_members(id) on delete set null,
  channel text not null check (channel in ('line','email','none')),
  dedupe_key text not null unique,
  payload jsonb,
  sent_at timestamptz not null default now()
);

-- LINE Webhook の重複処理防止
create table rh_line_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

-- ========== RLS ヘルパー ==========
create function rh_my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from rh_members where user_id = auth.uid() limit 1
$$;

-- ========== RLS ==========
alter table rh_members enable row level security;
alter table rh_productions enable row level security;
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

-- admin: 全操作
create policy rh_members_admin_all on rh_members for all using (tk_app_role() = 'admin');
create policy rh_productions_admin_all on rh_productions for all using (tk_app_role() = 'admin');
create policy rh_pm_admin_all on rh_production_members for all using (tk_app_role() = 'admin');
create policy rh_scenes_admin_all on rh_scenes for all using (tk_app_role() = 'admin');
create policy rh_scene_members_admin_all on rh_scene_members for all using (tk_app_role() = 'admin');
create policy rh_sessions_admin_all on rh_sessions for all using (tk_app_role() = 'admin');
create policy rh_session_scenes_admin_all on rh_session_scenes for all using (tk_app_role() = 'admin');
create policy rh_session_members_admin_all on rh_session_members for all using (tk_app_role() = 'admin');
create policy rh_availability_admin_all on rh_availability for all using (tk_app_role() = 'admin');
create policy rh_subreq_admin_all on rh_substitution_requests for all using (tk_app_role() = 'admin');
create policy rh_subcand_admin_all on rh_substitution_candidates for all using (tk_app_role() = 'admin');
create policy rh_notifications_admin_read on rh_notifications for select using (tk_app_role() = 'admin');

-- メンバー: 自分に関わる行のみ参照(他メンバーの可用性・他公演の予定は見えない)
create policy rh_members_self_read on rh_members
  for select using (id = rh_my_member_id());
create policy rh_productions_member_read on rh_productions
  for select using (exists (select 1 from rh_production_members pm where pm.production_id = id and pm.member_id = rh_my_member_id()));
create policy rh_pm_member_read on rh_production_members
  for select using (member_id = rh_my_member_id());
create policy rh_scenes_member_read on rh_scenes
  for select using (exists (select 1 from rh_production_members pm where pm.production_id = rh_scenes.production_id and pm.member_id = rh_my_member_id()));
create policy rh_scene_members_self_read on rh_scene_members
  for select using (member_id = rh_my_member_id());
create policy rh_sessions_member_read on rh_sessions
  for select using (exists (select 1 from rh_session_members sm where sm.session_id = id and sm.member_id = rh_my_member_id()));
create policy rh_session_scenes_member_read on rh_session_scenes
  for select using (exists (select 1 from rh_session_members sm where sm.session_id = rh_session_scenes.session_id and sm.member_id = rh_my_member_id()));
-- 同じ稽古枠に召集されたメンバー同士は互いの出欠を見られる
create policy rh_session_members_peer_read on rh_session_members
  for select using (exists (select 1 from rh_session_members me where me.session_id = rh_session_members.session_id and me.member_id = rh_my_member_id()));
create policy rh_session_members_self_update on rh_session_members
  for update using (member_id = rh_my_member_id()) with check (member_id = rh_my_member_id());
create policy rh_availability_self_all on rh_availability
  for all using (member_id = rh_my_member_id()) with check (member_id = rh_my_member_id());
create policy rh_subreq_candidate_read on rh_substitution_requests
  for select using (exists (select 1 from rh_substitution_candidates c where c.request_id = id and c.member_id = rh_my_member_id()));
create policy rh_subcand_self_read on rh_substitution_candidates
  for select using (member_id = rh_my_member_id());

-- ========== 進捗ビュー: シーン別の実施回数 ==========
create view rh_scene_progress_v1 with (security_invoker = true) as
select
  sc.org_id,
  sc.production_id,
  sc.id as scene_id,
  sc.code,
  sc.name,
  sc.sort_order,
  sc.target_count,
  count(ss.session_id) filter (where ss.status = 'done' and s.status = 'done') as done_count,
  max(s.starts_at) filter (where ss.status = 'done' and s.status = 'done') as last_done_at
from rh_scenes sc
left join rh_session_scenes ss on ss.scene_id = sc.id
left join rh_sessions s on s.id = ss.session_id
group by sc.org_id, sc.production_id, sc.id, sc.code, sc.name, sc.sort_order, sc.target_count;
