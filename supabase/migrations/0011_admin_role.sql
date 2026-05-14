-- 0011 — Admin role on profiles + RLS allowance for admins to edit any song.
-- See PLAN.md. The role lives on the existing public.profiles row so it's
-- visible to the client (read-only) without a separate auth metadata roundtrip.

alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- Grant admin to the configured account. Looked up by email in auth.users to
-- avoid hard-coding a UUID. Idempotent: re-running this leaves the row at 'admin'.
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where lower(email) = lower('jan.zavadilj@gmail.com'));

-- Helper function so policies and the client RPCs share one definition of
-- "is the current user an admin". SECURITY DEFINER lets policies on songs read
-- profiles.role without the caller needing direct SELECT permission to the row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- RLS — let admins update or delete any song. We don't blow away the existing
-- owner-only policies; admins get an additional permissive policy.
drop policy if exists "admin update any song" on public.songs;
create policy "admin update any song"
  on public.songs for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin delete any song" on public.songs;
create policy "admin delete any song"
  on public.songs for delete
  using (public.is_admin());
