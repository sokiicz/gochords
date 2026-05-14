-- 0009 — Stateful playlist songs.
-- Each (playlist, song) pair stores the transpose/capo/diagram_size that the
-- editor wants the player to apply when the song is opened from this playlist.
-- See PLAN.md Sprint 3.4. Precedence stack: jam > playlist > URL > local > default.

alter table public.playlist_songs
  add column if not exists transpose    smallint default 0,
  add column if not exists capo         smallint default 0,
  add column if not exists diagram_size text     default 'M' check (diagram_size in ('S','M','L')),
  add column if not exists note         text;

-- Bound the freeform note so RLS-bypassing edits can't bloat a row.
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so wrap in a DO block to
-- keep the migration replay-safe.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'playlist_songs_note_len'
      and conrelid = 'public.playlist_songs'::regclass
  ) then
    alter table public.playlist_songs
      add constraint playlist_songs_note_len check (note is null or length(note) <= 120);
  end if;
end$$;
