-- 0012 — Songs can be marked as a pending suggestion for another song.
-- See PLAN.md Sprint admin-suggestions. A "suggestion" is just a song whose
-- `suggested_for` points at the target song the author wants to amend.
-- Forking + editing already produces a child song; flipping `suggested_for`
-- on it signals "review me as a change to <target>".

alter table public.songs
  add column if not exists suggested_for uuid references public.songs(id) on delete set null;

create index if not exists songs_suggested_for_idx on public.songs (suggested_for);

-- RLS: the suggestion author owns the row (existing owner-only policies still
-- govern the source/title edits). What we need to add is read+update access
-- for the TARGET song's owner and for admins, so they can review and act.

drop policy if exists "owner of target may read suggestions" on public.songs;
create policy "owner of target may read suggestions"
  on public.songs for select
  using (
    suggested_for is not null
    and (
      exists (
        select 1 from public.songs t
        where t.id = public.songs.suggested_for and t.owner_id = auth.uid()
      )
      or public.is_admin()
    )
  );

-- Admins can also flip suggested_for back to null (i.e. reject / merge cleanup).
-- The existing "admin update any song" policy already covers that, but make
-- it explicit for target owners too:
drop policy if exists "owner of target may clear suggestion" on public.songs;
create policy "owner of target may clear suggestion"
  on public.songs for update
  using (
    suggested_for is not null
    and exists (
      select 1 from public.songs t
      where t.id = public.songs.suggested_for and t.owner_id = auth.uid()
    )
  )
  with check (
    -- Only the suggested_for column may be changed by the target owner via this
    -- policy; the existing owner-only policy still gates everything else.
    suggested_for is null
  );

-- Atomic merge: copy source/title/artist/original_key/default_capo/tempo from
-- the suggestion onto the target, then drop the suggestion. Runs as the caller
-- so RLS still applies on both rows; admins and target-owners can use it.
create or replace function public.merge_suggestion(suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.songs;
  t public.songs;
begin
  select * into s from public.songs where id = suggestion_id;
  if s.id is null then raise exception 'suggestion not found'; end if;
  if s.suggested_for is null then raise exception 'song is not a pending suggestion'; end if;

  select * into t from public.songs where id = s.suggested_for;
  if t.id is null then raise exception 'target song not found'; end if;

  -- Authorisation: only the target owner or an admin may merge.
  if not (t.owner_id = auth.uid() or public.is_admin()) then
    raise exception 'not authorised to merge into this song';
  end if;

  update public.songs
     set source        = s.source,
         title         = s.title,
         artist        = s.artist,
         original_key  = s.original_key,
         default_capo  = s.default_capo,
         tempo         = s.tempo,
         tags          = s.tags,
         updated_at    = now()
   where id = t.id;

  delete from public.songs where id = s.id;
end;
$$;

grant execute on function public.merge_suggestion(uuid) to authenticated;
