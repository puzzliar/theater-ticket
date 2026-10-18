-- 公演の管理モード: 全員出演型(ensemble: シーンと稽古枠) / シフト制(shift: 回ごとに役割を埋める)
-- イマーシブのウォークスルー型や 1 人が 1 公演を誘導する形式(思考実験展など)向け。docs/rehearsal-requirements.md 5.17

alter table rh_productions add column if not exists management_mode text not null default 'ensemble' check (management_mode in ('ensemble','shift'));

-- シフトの役割(案内人・受付など)。回ごとに必要人数を埋める
create table rh_shift_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  production_id uuid not null references rh_productions(id) on delete cascade,
  name text not null,
  required_count int not null default 1 check (required_count >= 0),
  sort_order int not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (production_id, name)
);
alter table rh_shift_roles enable row level security;
create policy rh_shift_roles_member_read on rh_shift_roles for select using (core_is_member(org_id));
create policy rh_shift_roles_admin_all on rh_shift_roles for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));

-- 召集行の状態: assigned=召集・確定(従来どおり) / candidate=希望受付中(シフト制で「入れる回」を聞いている段階)
alter table rh_session_members add column if not exists assignment text not null default 'assigned' check (assignment in ('candidate','assigned'));
alter table rh_session_members add column if not exists shift_role_id uuid references rh_shift_roles(id) on delete set null;
create index if not exists rh_session_members_assignment_idx on rh_session_members (session_id, assignment);
