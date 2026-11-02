-- 公開前の Supabase アドバイザリ対応(セキュリティ/パフォーマンス)
-- 1) auth.users のトリガー関数は RPC から呼べないようにする
revoke execute on function public.core_handle_new_user() from public, anon, authenticated;
grant execute on function public.core_handle_new_user() to supabase_auth_admin;

-- 2) RLS 補助関数(SECURITY DEFINER)は未ログイン(anon)から呼べないようにする
--    authenticated には残す(RLS ポリシー評価で必要)
revoke execute on function public.core_is_admin(uuid) from public, anon;
revoke execute on function public.core_is_member(uuid) from public, anon;
revoke execute on function public.core_is_platform_admin() from public, anon;
revoke execute on function public.core_my_org_ids() from public, anon;
revoke execute on function public.core_shares_org_with(uuid) from public, anon;
grant execute on function public.core_is_admin(uuid) to authenticated, service_role;
grant execute on function public.core_is_member(uuid) to authenticated, service_role;
grant execute on function public.core_is_platform_admin() to authenticated, service_role;
grant execute on function public.core_my_org_ids() to authenticated, service_role;
grant execute on function public.core_shares_org_with(uuid) to authenticated, service_role;

-- 3) search_path を固定(関数の乗っ取り対策)
alter function public.update_updated_at() set search_path = public;
alter function public.blog_posts_set_updated_at() set search_path = public;
alter function public.tk_consume_free_stock(uuid, uuid, integer) set search_path = public;
alter function public.tk_restore_free_stock(uuid, uuid, integer) set search_path = public;

-- 4) 集計ビューは呼び出し側の権限で評価する(アプリは service role で読むため影響なし)
alter view public.tk_ticket_sales_by_cast_v1 set (security_invoker = on);

-- 5) RLS ポリシー内の auth.uid() を (select auth.uid()) に書き換え(行ごとの再評価を避ける)
do $$
declare r record; q text; w text; sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (tablename like 'rh\_%' or tablename like 'core\_%')
      and (coalesce(qual,'') ~ 'auth\.uid\(\)' or coalesce(with_check,'') ~ 'auth\.uid\(\)')
  loop
    q := regexp_replace(r.qual, '(?<!\(select )auth\.uid\(\)', '(select auth.uid())', 'g');
    w := regexp_replace(r.with_check, '(?<!\(select )auth\.uid\(\)', '(select auth.uid())', 'g');
    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if w is not null then sql := sql || format(' with check (%s)', w); end if;
    execute sql;
  end loop;
end $$;

-- 6) 外部キーにインデックスを付ける
create index if not exists core_invitations_created_by_idx on public.core_invitations (created_by);
create index if not exists core_invitations_org_id_idx on public.core_invitations (org_id);
create index if not exists core_organizer_codes_created_by_idx on public.core_organizer_codes (created_by);
create index if not exists rh_availability_shares_profile_id_idx on public.rh_availability_shares (profile_id);
create index if not exists rh_calendar_events_profile_id_idx on public.rh_calendar_events (profile_id);
create index if not exists rh_credits_production_id_idx on public.rh_credits (production_id);
create index if not exists rh_invitation_productions_production_id_idx on public.rh_invitation_productions (production_id);
create index if not exists rh_notifications_profile_id_idx on public.rh_notifications (profile_id);
create index if not exists rh_participants_profile_id_idx on public.rh_participants (profile_id);
create index if not exists rh_production_members_participant_id_idx on public.rh_production_members (participant_id);
create index if not exists rh_production_transfers_accepted_by_idx on public.rh_production_transfers (accepted_by);
create index if not exists rh_production_transfers_created_by_idx on public.rh_production_transfers (created_by);
create index if not exists rh_production_transfers_from_org_id_idx on public.rh_production_transfers (from_org_id);
create index if not exists rh_production_transfers_production_id_idx on public.rh_production_transfers (production_id);
create index if not exists rh_production_transfers_to_org_id_idx on public.rh_production_transfers (to_org_id);
create index if not exists rh_productions_tk_event_id_idx on public.rh_productions (tk_event_id);
create index if not exists rh_scene_members_participant_id_idx on public.rh_scene_members (participant_id);
create index if not exists rh_session_members_shift_role_id_idx on public.rh_session_members (shift_role_id);
create index if not exists rh_session_scenes_scene_id_idx on public.rh_session_scenes (scene_id);
create index if not exists rh_sessions_production_id_idx on public.rh_sessions (production_id);
create index if not exists rh_substitution_candidates_participant_id_idx on public.rh_substitution_candidates (participant_id);
create index if not exists rh_substitution_requests_absent_participant_id_idx on public.rh_substitution_requests (absent_participant_id);
create index if not exists rh_substitution_requests_filled_by_participant_id_idx on public.rh_substitution_requests (filled_by_participant_id);
create index if not exists rh_substitution_requests_session_id_idx on public.rh_substitution_requests (session_id);
