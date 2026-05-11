-- 0002 — extra song metadata: default capo, tempo, tags

alter table public.songs
  add column default_capo int  not null default 0 check (default_capo between 0 and 12),
  add column tempo        int  null check (tempo is null or tempo between 30 and 300),
  add column tags         text[] not null default '{}'::text[];

create index songs_tags_gin on public.songs using gin (tags);
