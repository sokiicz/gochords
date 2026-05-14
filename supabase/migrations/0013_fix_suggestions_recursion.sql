-- 0013 — Fix infinite recursion introduced by 0012's RLS policies on `songs`.
--
-- The policies in 0012 did `exists (select 1 from public.songs t where ...)`
-- from inside a policy on `public.songs`. Postgres re-evaluates the same
-- policies on the inner table, which re-runs the subquery, and so on:
--   42P17: infinite recursion detected in policy for relation "songs"
--
-- Fix: do the cross-row lookup through a SECURITY DEFINER helper that
-- bypasses RLS (the definer role has BYPASSRLS), so the inner read never
-- triggers the outer policy again.

create or replace function public.song_owner(song_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.songs where id = song_id;
$$;

grant execute on function public.song_owner(uuid) to anon, authenticated;

drop policy if exists "owner of target may read suggestions" on public.songs;
create policy "owner of target may read suggestions"
  on public.songs for select
  using (
    suggested_for is not null
    and (public.song_owner(suggested_for) = auth.uid() or public.is_admin())
  );

drop policy if exists "owner of target may clear suggestion" on public.songs;
create policy "owner of target may clear suggestion"
  on public.songs for update
  using (
    suggested_for is not null
    and public.song_owner(suggested_for) = auth.uid()
  )
  with check (suggested_for is null);
