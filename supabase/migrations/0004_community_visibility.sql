-- 0004 — replace community.private boolean with visibility enum,
--        and fix infinite-recursion in RLS by using SECURITY DEFINER helpers.
--
-- Idempotent: safe to run repeatedly even on a partially-applied DB.

-- =========================================================================
-- 1. Drop EVERY policy that this migration touches, in any prior state.
-- =========================================================================
drop policy if exists "select non-private or member"       on public.communities;
drop policy if exists "select listed-or-member"            on public.communities;

drop policy if exists "join non-private"                   on public.community_members;
drop policy if exists "join public-or-open"                on public.community_members;
drop policy if exists "members read membership"            on public.community_members;
drop policy if exists "read membership"                    on public.community_members;
drop policy if exists "leave self"                         on public.community_members;

drop policy if exists "members see community songs"        on public.community_songs;
drop policy if exists "read community songs"               on public.community_songs;
drop policy if exists "members add community songs"        on public.community_songs;
drop policy if exists "add community songs"                on public.community_songs;
drop policy if exists "members remove own community songs" on public.community_songs;
drop policy if exists "owners pin"                         on public.community_songs;

drop policy if exists "read community-shared songs"        on public.songs;

drop policy if exists "read accessible playlists"          on public.playlists;
drop policy if exists "modify playlist songs"              on public.playlist_songs;
drop policy if exists "read playlist songs"                on public.playlist_songs;

-- =========================================================================
-- 2. SECURITY DEFINER helpers — bypass RLS to break the recursion that
--    happens when a policy on community_members queries community_members.
-- =========================================================================
create or replace function public.is_community_member(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = c_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_community_admin(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = c_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

grant execute on function public.is_community_member(uuid) to anon, authenticated;
grant execute on function public.is_community_admin(uuid)  to anon, authenticated;

-- =========================================================================
-- 3. Add visibility column if missing.
-- =========================================================================
alter table public.communities add column if not exists visibility text;

-- Backfill: from `private` if it still exists, otherwise default to 'private'.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='communities' and column_name='private'
  ) then
    update public.communities
       set visibility = case when private then 'private' else 'public' end
     where visibility is null;
  else
    update public.communities set visibility = 'private' where visibility is null;
  end if;
end $$;

alter table public.communities alter column visibility set not null;
alter table public.communities alter column visibility set default 'private';

-- Add the CHECK constraint if it doesn't exist yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'communities' and c.conname = 'communities_visibility_check'
  ) then
    alter table public.communities
      add constraint communities_visibility_check
      check (visibility in ('private', 'listed', 'public', 'open'));
  end if;
end $$;

-- =========================================================================
-- 4. Drop the old `private` column if it still exists.
-- =========================================================================
alter table public.communities drop column if exists private;

-- =========================================================================
-- 5. Recreate every policy using the helper functions (no recursion possible).
-- =========================================================================

-- communities
create policy "select listed-or-member"
  on public.communities for select
  using (
    visibility <> 'private'
    or public.is_community_member(id)
  );

-- community_members
create policy "read membership"
  on public.community_members for select
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_members.community_id
        and (c.visibility in ('public', 'open') or public.is_community_member(c.id))
    )
  );

create policy "join public-or-open"
  on public.community_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.communities c
      where c.id = community_id and c.visibility in ('public', 'open')
    )
  );

create policy "leave self"
  on public.community_members for delete
  using (auth.uid() = user_id);

-- community_songs
create policy "read community songs"
  on public.community_songs for select
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_songs.community_id
        and (c.visibility in ('public', 'open') or public.is_community_member(c.id))
    )
  );

create policy "add community songs"
  on public.community_songs for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.communities c
      where c.id = community_songs.community_id
        and (c.visibility = 'open' or public.is_community_member(c.id))
    )
  );

create policy "members remove own community songs"
  on public.community_songs for delete
  using (auth.uid() = added_by or public.is_community_admin(community_id));

create policy "owners pin"
  on public.community_songs for update
  using (public.is_community_admin(community_id));

-- songs
create policy "read community-shared songs"
  on public.songs for select
  using (
    visibility = 'community'
    and exists (
      select 1 from public.community_songs cs
      join public.communities c on c.id = cs.community_id
      where cs.song_id = songs.id
        and (c.visibility in ('public', 'open') or public.is_community_member(c.id))
    )
  );

-- playlists
create policy "read accessible playlists"
  on public.playlists for select
  using (
    is_public = true
    or auth.uid() = owner_id
    or (
      community_id is not null and exists (
        select 1 from public.communities c
        where c.id = playlists.community_id
          and (c.visibility in ('public', 'open') or public.is_community_member(c.id))
      )
    )
  );

-- playlist_songs (recreate using helper to avoid recursion through community_members)
create policy "read playlist songs"
  on public.playlist_songs for select
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_songs.playlist_id
        and (
          p.is_public = true
          or auth.uid() = p.owner_id
          or (p.community_id is not null and public.is_community_member(p.community_id))
        )
    )
  );

create policy "modify playlist songs"
  on public.playlist_songs for all
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_songs.playlist_id
        and (
          auth.uid() = p.owner_id
          or (p.community_id is not null and public.is_community_member(p.community_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_songs.playlist_id
        and (
          auth.uid() = p.owner_id
          or (p.community_id is not null and public.is_community_member(p.community_id))
        )
    )
  );
