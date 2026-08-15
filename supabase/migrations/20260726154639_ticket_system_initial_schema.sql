-- チケット販売管理システム 初期スキーマ (docs/domain-model.md v0.1 準拠)
-- 共有プロジェクトのため全テーブル tk_ プレフィックス
-- ※ このファイルは Supabase プロジェクト wiqnmebudaadwqdaxwko に適用済みのマイグレーションの記録

create extension if not exists pgcrypto;

-- ========== 組織 ==========
create table tk_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee_rate numeric not null default 0.05,
  created_at timestamptz not null default now()
);

-- ========== アプリユーザー(ロール) ==========
create table tk_app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references tk_organizations(id),
  role text not null check (role in ('admin','staff','cast')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ========== 公演・ステージ ==========
create table tk_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tk_organizations(id),
  name text not null,
  description text not null default '',
  venue_name text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table tk_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references tk_events(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  doors_open_at timestamptz,
  sales_starts_at timestamptz,
  sales_ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- ========== エリア・座席 (MVP: 公演ごとに直接レイアウト保持) ==========
create table tk_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references tk_events(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('reserved','free')),
  free_capacity int,
  check (kind <> 'free' or free_capacity is not null)
);

create table tk_seats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  area_id uuid not null references tk_areas(id) on delete cascade,
  row_label text not null,
  seat_number int not null,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  block_group int not null default 0,
  is_active boolean not null default true,
  unique (area_id, row_label, seat_number)
);

-- ========== 席種・券種 ==========
create table tk_seat_classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references tk_events(id) on delete cascade,
  area_id uuid not null references tk_areas(id) on delete cascade,
  name text not null,
  price int not null check (price >= 0)
);

create table tk_ticket_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seat_class_id uuid not null references tk_seat_classes(id) on delete cascade,
  name text not null,
  price int not null check (price >= 0),
  sales_channel text[] not null default '{online}',
  is_active boolean not null default true
);

-- ========== キャスト・扱いルール ==========
create table tk_casts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references tk_events(id) on delete cascade,
  name text not null,
  slug text not null,                       -- キャスト個別URL用
  user_id uuid references auth.users(id),
  unique (event_id, slug)
);

create table tk_guarantee_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null references tk_events(id) on delete cascade,
  cast_id uuid not null references tk_casts(id) on delete cascade,
  rule_type text not null check (rule_type in ('rate','fixed','quota')),
  rate numeric,
  fixed_amount int,
  quota_threshold int,
  quota_amount int,
  effective_from timestamptz not null default now(),
  unique (event_id, cast_id, effective_from)
);

-- ========== 注文・チケット ==========
create table tk_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  stage_id uuid not null references tk_stages(id),
  channel text not null check (channel in ('general','guest','door')),
  cast_id uuid references tk_casts(id),      -- 扱い。null = 「一般」(主催扱い)
  buyer_name text not null,
  buyer_email text,
  payment_method text not null check (payment_method in ('online','cash_at_door','cast_paid')),
  settlement_method text check (
    payment_method <> 'cast_paid'
    or settlement_method in ('online','cash_at_door','cash_with_organizer')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','cancelled','refunded','partially_refunded')),
  total int not null default 0,
  status text not null default 'active' check (status in ('active','cancelled')),
  manage_token text unique default encode(gen_random_bytes(16),'hex'),  -- 購入者向けチケットページURL
  created_at timestamptz not null default now()
);

create table tk_guest_reservations (
  order_id uuid primary key references tk_orders(id) on delete cascade,
  org_id uuid not null,
  cast_id uuid not null references tk_casts(id),
  guest_name text not null,
  seat_assignment text not null default 'auto'
    check (seat_assignment in ('auto','split_confirmed')),
  payment_due_at timestamptz,
  note text not null default ''
);

create table tk_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null references tk_orders(id) on delete cascade,
  ticket_type_id uuid not null references tk_ticket_types(id),
  qty int not null check (qty > 0),
  unit_price int not null,
  guarantee_snapshot jsonb
);

create table tk_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_item_id uuid not null references tk_order_items(id) on delete cascade,
  stage_id uuid not null references tk_stages(id),
  seat_id uuid references tk_seats(id),
  entry_number int,
  qr_token text not null unique default encode(gen_random_bytes(16),'hex'),
  holder_name text,
  transfer_token text unique,
  transferred_at timestamptz,
  checkin_status text not null default 'not_checked_in'
    check (checkin_status in ('not_checked_in','checked_in','void')),
  checked_in_at timestamptz,
  checked_in_by uuid
);

-- 二重販売防止: 同一ステージ×座席の有効チケットは1枚のみ
create unique index tk_uq_ticket_seat_per_stage
  on tk_tickets (stage_id, seat_id)
  where seat_id is not null and checkin_status <> 'void';

-- ========== 自由席在庫・整理番号 ==========
create table tk_stage_area_stock (
  stage_id uuid not null references tk_stages(id) on delete cascade,
  area_id uuid not null references tk_areas(id) on delete cascade,
  org_id uuid not null,
  capacity int not null,
  remaining int not null check (remaining >= 0),
  next_entry_number int not null default 1,
  primary key (stage_id, area_id)
);

-- ========== 仮押さえ ==========
create table tk_seat_holds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  stage_id uuid not null references tk_stages(id) on delete cascade,
  seat_id uuid references tk_seats(id) on delete cascade,
  area_id uuid references tk_areas(id) on delete cascade,
  qty int not null default 1,
  session_key text not null,
  stripe_session_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((seat_id is not null) <> (area_id is not null))
);

create unique index tk_uq_hold_seat_per_stage
  on tk_seat_holds (stage_id, seat_id)
  where seat_id is not null;

-- ========== 決済・キャンセル ==========
create table tk_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null references tk_orders(id) on delete cascade,
  provider text not null check (provider in ('stripe','cash','mock')),
  stripe_payment_intent_id text unique,
  amount int not null,
  status text not null check (status in ('pending','succeeded','refunded','failed')),
  received_by uuid,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table tk_stripe_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

create table tk_cancellations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null references tk_orders(id),
  reason text not null check (reason in ('buyer','organizer','event_cancelled')),
  fee_amount int not null default 0,
  stripe_fee int not null default 0,
  refund_amount int not null default 0,
  stripe_refund_id text,
  cancelled_by uuid,
  cancelled_at timestamptz not null default now()
);

-- ========== 監査ログ ==========
create table tk_audit_logs (
  id bigserial primary key,
  org_id uuid not null,
  actor_user_id uuid,
  action text not null,
  target_table text not null,
  target_id text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ========== RLSヘルパー ==========
create function tk_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from tk_app_users where user_id = auth.uid()
$$;

create function tk_my_cast_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from tk_casts where user_id = auth.uid()
$$;

-- ========== RLS ==========
alter table tk_organizations enable row level security;
alter table tk_app_users enable row level security;
alter table tk_events enable row level security;
alter table tk_stages enable row level security;
alter table tk_areas enable row level security;
alter table tk_seats enable row level security;
alter table tk_seat_classes enable row level security;
alter table tk_ticket_types enable row level security;
alter table tk_casts enable row level security;
alter table tk_guarantee_rules enable row level security;
alter table tk_orders enable row level security;
alter table tk_guest_reservations enable row level security;
alter table tk_order_items enable row level security;
alter table tk_tickets enable row level security;
alter table tk_stage_area_stock enable row level security;
alter table tk_seat_holds enable row level security;
alter table tk_payments enable row level security;
alter table tk_stripe_webhook_events enable row level security;
alter table tk_cancellations enable row level security;
alter table tk_audit_logs enable row level security;

-- 公開マスタ: 公開中の公演に紐づくものは誰でも閲覧可(販売ページ用)
create policy tk_events_public_read on tk_events
  for select using (is_published or tk_app_role() in ('admin','staff','cast'));
create policy tk_stages_public_read on tk_stages
  for select using (exists (select 1 from tk_events e where e.id = event_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_areas_public_read on tk_areas
  for select using (exists (select 1 from tk_events e where e.id = event_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_seats_public_read on tk_seats
  for select using (exists (select 1 from tk_areas a join tk_events e on e.id = a.event_id where a.id = area_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_seat_classes_public_read on tk_seat_classes
  for select using (exists (select 1 from tk_events e where e.id = event_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_ticket_types_public_read on tk_ticket_types
  for select using (exists (select 1 from tk_seat_classes sc join tk_events e on e.id = sc.event_id where sc.id = seat_class_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_casts_public_read on tk_casts
  for select using (exists (select 1 from tk_events e where e.id = event_id and (e.is_published or tk_app_role() in ('admin','staff','cast'))));
create policy tk_stock_public_read on tk_stage_area_stock
  for select using (true);

-- 管理者: マスタ全操作
create policy tk_events_admin_all on tk_events for all using (tk_app_role() = 'admin');
create policy tk_stages_admin_all on tk_stages for all using (tk_app_role() = 'admin');
create policy tk_areas_admin_all on tk_areas for all using (tk_app_role() = 'admin');
create policy tk_seats_admin_all on tk_seats for all using (tk_app_role() = 'admin');
create policy tk_seat_classes_admin_all on tk_seat_classes for all using (tk_app_role() = 'admin');
create policy tk_ticket_types_admin_all on tk_ticket_types for all using (tk_app_role() = 'admin');
create policy tk_casts_admin_all on tk_casts for all using (tk_app_role() = 'admin');
create policy tk_rules_admin_all on tk_guarantee_rules for all using (tk_app_role() = 'admin');
create policy tk_orgs_admin_read on tk_organizations for select using (tk_app_role() is not null);
create policy tk_app_users_self_read on tk_app_users for select using (user_id = auth.uid() or tk_app_role() = 'admin');

-- 扱いルール: キャストは自分の行のみ閲覧
create policy tk_rules_cast_read on tk_guarantee_rules
  for select using (cast_id in (select tk_my_cast_ids()));

-- 注文系: admin/staff は閲覧可(集計UIはアプリ層でstaffに提供しない)。castは自分の扱い分のみ
create policy tk_orders_admin_staff_read on tk_orders
  for select using (tk_app_role() in ('admin','staff'));
create policy tk_orders_cast_read on tk_orders
  for select using (cast_id in (select tk_my_cast_ids()));
create policy tk_order_items_read on tk_order_items
  for select using (exists (select 1 from tk_orders o where o.id = order_id and (tk_app_role() in ('admin','staff') or o.cast_id in (select tk_my_cast_ids()))));
create policy tk_tickets_read on tk_tickets
  for select using (exists (select 1 from tk_order_items oi join tk_orders o on o.id = oi.order_id where oi.id = order_item_id and (tk_app_role() in ('admin','staff') or o.cast_id in (select tk_my_cast_ids()))));
create policy tk_guest_res_read on tk_guest_reservations
  for select using (tk_app_role() in ('admin','staff') or cast_id in (select tk_my_cast_ids()));
create policy tk_payments_read on tk_payments
  for select using (exists (select 1 from tk_orders o where o.id = order_id and (tk_app_role() in ('admin','staff') or o.cast_id in (select tk_my_cast_ids()))));
create policy tk_cancellations_read on tk_cancellations
  for select using (exists (select 1 from tk_orders o where o.id = order_id and (tk_app_role() in ('admin','staff') or o.cast_id in (select tk_my_cast_ids()))));
create policy tk_audit_admin_read on tk_audit_logs for select using (tk_app_role() = 'admin');

-- 書き込みは原則サーバー(service role)経由。受付のチェックイン更新のみstaff/adminに許可
create policy tk_tickets_checkin_update on tk_tickets
  for update using (tk_app_role() in ('admin','staff'))
  with check (tk_app_role() in ('admin','staff'));

-- ========== 契約ビュー (事前物販OS向け・読み取り専用) ==========
-- ※ 集計粒度は 20260726154716_fix_ticket_sales_view_aggregation.sql で修正済み
create view tk_ticket_sales_by_cast_v1 as
select
  o.org_id,
  s.event_id,
  o.stage_id,
  o.cast_id,
  count(t.id) filter (where t.checkin_status <> 'void')      as ticket_count,
  coalesce(sum(oi.unit_price), 0)
    - coalesce((select sum(c.refund_amount) from tk_cancellations c where c.order_id = o.id), 0) as net_sales,
  count(t.id) filter (where t.checkin_status = 'checked_in') as attendance
from tk_orders o
join tk_order_items oi on oi.order_id = o.id
join tk_tickets t on t.order_item_id = oi.id
join tk_stages s on s.id = o.stage_id
where o.payment_status in ('paid','partially_refunded') and o.status = 'active'
group by o.org_id, s.event_id, o.stage_id, o.cast_id, o.id;

-- ========== シード: 単一組織 ==========
insert into tk_organizations (id, name) values ('a0000000-0000-4000-8000-000000000001', 'PUZZLIAR');
