-- ZAGUMIスケジュール: セルフ公演(個人座組)・仮押さえ・空き状況の共有・公演の引き渡し・公式サイト
-- docs/rehearsal-requirements.md 5.12〜5.15

-- ========== 個人座組(セルフ公演の受け皿。1 人 1 つ。主催者コード不要) ==========
alter table core_organizations drop constraint if exists core_organizations_kind_check;
alter table core_organizations add constraint core_organizations_kind_check
  check (kind in ('troupe','producer','individual','other','personal'));
create unique index if not exists core_organizations_personal_owner_uq on core_organizations (created_by) where kind = 'personal';

-- ========== 仮押さえ(仮/確定・返答期限)と本番期間ブロック ==========
alter table rh_sessions add column if not exists tentative boolean not null default false;
alter table rh_sessions add column if not exists respond_by date;
alter table rh_productions add column if not exists closes_on date;
alter table rh_productions add column if not exists block_from date;
alter table rh_productions add column if not exists block_to date;

-- ========== 空き状況の共有リンク(期間限定。見せるのは ○×△ だけ) ==========
create table rh_availability_shares (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references core_profiles(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12),'hex'),
  label text not null default '',
  from_date date not null,
  to_date date not null,
  window_from time not null default '10:00',
  window_to time not null default '22:00',
  empty_mark text not null default '○' check (empty_mark in ('○','−')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table rh_availability_shares enable row level security;
create policy rh_avail_shares_self on rh_availability_shares for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ========== 公演の引き渡し(セルフ公演 → 主催者の座組) ==========
create table rh_production_transfers (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(12),'hex'),
  production_id uuid not null references rh_productions(id) on delete cascade,
  from_org_id uuid not null references core_organizations(id) on delete cascade,
  to_org_id uuid references core_organizations(id) on delete set null,
  created_by uuid references core_profiles(id) on delete set null,
  accepted_by uuid references core_profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table rh_production_transfers enable row level security;
create policy rh_transfers_from_admin on rh_production_transfers for all using (core_is_admin(from_org_id)) with check (core_is_admin(from_org_id));

-- ========== 公式サイト(公開プロフィール)と出演履歴 ==========
create table rh_public_profiles (
  profile_id uuid primary key references core_profiles(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  is_public boolean not null default false,
  headline text not null default '',
  bio text not null default '',
  photo_url text,
  links jsonb not null default '{}',
  show_upcoming boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table rh_public_profiles enable row level security;
create policy rh_public_profiles_self on rh_public_profiles for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rh_public_profiles_public_read on rh_public_profiles for select using (is_public);

create table rh_credits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references core_profiles(id) on delete cascade,
  production_id uuid references rh_productions(id) on delete set null,
  source text not null default 'manual' check (source in ('auto','manual')),
  title text not null,
  role_name text not null default '',
  org_name text not null default '',
  kind text not null default 'stage' check (kind in ('stage','immersive','film','tv','voice','dance','music','other')),
  started_on date,
  ended_on date,
  venue text not null default '',
  url text not null default '',
  note text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rh_credits_auto_uq on rh_credits (profile_id, production_id) where production_id is not null;
alter table rh_credits enable row level security;
create policy rh_credits_self on rh_credits for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rh_credits_public_read on rh_credits for select
  using (is_public and exists (select 1 from rh_public_profiles pp where pp.profile_id = rh_credits.profile_id and pp.is_public));

-- 写真などの公開ファイル(公式サイトの写真)。書き込みはサーバー(service role)のみ
insert into storage.buckets (id, name, public) values ('zagumi-public', 'zagumi-public', true) on conflict (id) do nothing;
