-- 0007 — atomic batch add/remove RPCs for community_songs.
--
-- Why:
--   - add_songs_to_community auto-promotes owned 'private' songs to
--     'community' visibility so other members can actually read them.
--     Without this, sharing a private song produced an invisible row.
--   - Returns truthful added / promoted / skipped counts in one round-trip.
--   - Permission is enforced inside the function (membership for non-open
--     communities; any signed-in user for 'open').
--   - remove_songs_from_community lets anyone undo their own bulk add and
--     lets owners/admins remove anyone's contributions.

create or replace function public.add_songs_to_community(
  c_id     uuid,
  song_ids uuid[]
)
returns table (added int, promoted int, skipped int, added_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  vis       text;
  is_member bool;
  before_count int;
  after_ids uuid[];
  after_count int;
  promo_count int;
  total     int := coalesce(array_length(song_ids, 1), 0);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if total = 0 then
    return query select 0, 0, 0, ARRAY[]::uuid[];
    return;
  end if;

  select c.visibility into vis from public.communities c where c.id = c_id;
  if vis is null then
    raise exception 'Community not found';
  end if;

  is_member := exists (
    select 1 from public.community_members m
    where m.community_id = c_id and m.user_id = uid
  );

  if vis <> 'open' and not is_member then
    raise exception 'Not allowed to add songs to this community';
  end if;

  -- Auto-promote: any 'private' song that the caller OWNS becomes 'community'
  -- so other members can read it. Songs you don't own are not modified.
  with promo as (
    update public.songs
       set visibility = 'community'
     where id = any(song_ids)
       and owner_id = uid
       and visibility = 'private'
     returning id
  )
  select count(*)::int from promo into promo_count;

  -- How many of these songs are already in the community?
  select count(*)::int into before_count
    from public.community_songs
    where community_id = c_id and song_id = any(song_ids);

  -- Idempotent insert
  insert into public.community_songs (community_id, song_id, added_by)
    select c_id, x, uid from unnest(song_ids) as x
    on conflict (community_id, song_id) do nothing;

  -- IDs of rows now present that match this batch (used by client undo)
  select array_agg(song_id) into after_ids
    from public.community_songs
    where community_id = c_id and song_id = any(song_ids);

  select count(*)::int into after_count
    from public.community_songs
    where community_id = c_id and song_id = any(song_ids);

  return query select
    (after_count - before_count)::int,
    promo_count,
    (total - (after_count - before_count))::int,
    coalesce(after_ids, ARRAY[]::uuid[]);
end;
$$;

grant execute on function public.add_songs_to_community(uuid, uuid[]) to authenticated;

-- =========================================================================
-- Bulk-remove for undo. Caller can remove songs they added; owners/admins
-- can remove anyone's.
-- =========================================================================
create or replace function public.remove_songs_from_community(
  c_id     uuid,
  song_ids uuid[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  removed int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.community_songs
   where community_id = c_id
     and song_id = any(song_ids)
     and (
       added_by = uid
       or exists (
         select 1 from public.community_members m
         where m.community_id = c_id and m.user_id = uid and m.role in ('owner','admin')
       )
     );

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.remove_songs_from_community(uuid, uuid[]) to authenticated;
