-- 招待リンクに「参加と同時に登録する公演」を複数紐づける(docs/rehearsal-requirements.md 5.0 / 5.1)
-- ※ Supabase プロジェクト wiqnmebudaadwqdaxwko に適用済み (version 20261003010911)
create table rh_invitation_productions (
  invitation_id uuid not null references core_invitations(id) on delete cascade,
  production_id uuid not null references rh_productions(id) on delete cascade,
  org_id uuid not null,
  primary key (invitation_id, production_id)
);
alter table rh_invitation_productions enable row level security;
create policy rh_inv_prod_admin_all on rh_invitation_productions
  for all using (core_is_admin(org_id)) with check (core_is_admin(org_id));
