-- 0005 — defensive rebuild of communities INSERT/UPDATE/DELETE policies and
--        the auto-owner-as-member trigger. Idempotent; safe to re-run.
--
-- Symptom this fixes:
--   "new row violates row-level security policy for table 'communities'"
--   when a signed-in user tries to create a community.
--
-- Root cause: in some intermediate state the "create community" policy is
-- missing. With RLS enabled and no INSERT policy, every insert is denied.

-- =========================================================================
-- 1. Drop and recreate the writer policies on communities so they exist
--    exactly once and in the correct form.
-- =========================================================================
drop policy if exists "create community"     on public.communities;
drop policy if exists "update own community" on public.communities;
drop policy if exists "delete own community" on public.communities;

create policy "create community"
  on public.communities for insert
  with check (auth.uid() = owner_id);

create policy "update own community"
  on public.communities for update
  using (auth.uid() = owner_id);

create policy "delete own community"
  on public.communities for delete
  using (auth.uid() = owner_id);

-- =========================================================================
-- 2. Ensure the auto-membership trigger is in place and SECURITY DEFINER so
--    it can insert into community_members regardless of that table's RLS.
-- =========================================================================
create or replace function public.handle_new_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_members (community_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict do nothing;
  return new;
end;
$$;

-- Recreate the trigger (CREATE TRIGGER has no IF NOT EXISTS until PG 14+;
-- drop-then-create is reliable on any version).
drop trigger if exists on_community_created on public.communities;
create trigger on_community_created
  after insert on public.communities
  for each row execute function public.handle_new_community();

-- Grant execute on the function to the roles Supabase uses on the API side.
grant execute on function public.handle_new_community() to anon, authenticated;
