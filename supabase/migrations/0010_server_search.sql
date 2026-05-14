-- 0010 — Server-side search via pg_trgm + unaccent.
-- See PLAN.md Sprint 4. Mirrors the JS `normalize()` semantics in lib/search.ts:
-- diacritics → ASCII, apostrophes dropped, &/and/a folded to space, punctuation
-- collapsed to whitespace. Match uses trigram similarity for ranking.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function public.normalize_search(s text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(unaccent(lower(coalesce(s, ''))),
        '[''`´]', '', 'g'),                          -- strip apostrophes
      '\s*(?:&|\+|\band\b|\ba\b)\s*', ' ', 'g'),     -- fold &/+/and/a → space
    '[^a-z0-9]+', ' ', 'g');                          -- punctuation → space
$$;

alter table public.songs
  add column if not exists search_blob text
  generated always as (
    public.normalize_search(title || ' ' || coalesce(artist, ''))
  ) stored;

create index if not exists songs_search_blob_trgm
  on public.songs using gin (search_blob gin_trgm_ops);

-- Public search RPC. Returns full song rows, ranked by trigram similarity then
-- popularity. Trigram threshold defaults to 0.3 in pg_trgm; lower it slightly
-- for forgiving partial matches without going noisy.
create or replace function public.search_songs(q text, n int default 50)
returns setof public.songs language sql stable as $$
  select s.*
  from public.songs s
  where s.visibility = 'public'
    and (public.normalize_search(q) = ''
         or s.search_blob % public.normalize_search(q))
  order by similarity(s.search_blob, public.normalize_search(q)) desc,
           s.like_count desc nulls last,
           s.created_at desc
  limit n;
$$;

grant execute on function public.search_songs(text, int) to anon, authenticated;
