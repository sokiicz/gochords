-- GoChords — Phase 1 schema
-- profiles, songs, song_states + RLS + seed catalog

-- =========================================================================
-- profiles
-- =========================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  handle      text unique,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are world-readable"
  on public.profiles for select
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row on auth.users insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- songs
-- =========================================================================
create table public.songs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles(id) on delete set null,  -- NULL = system seed
  title         text not null,
  artist        text not null default '',
  original_key  text,
  source        text not null,
  visibility    text not null default 'public' check (visibility in ('public','private','community')),
  parent_id     uuid references public.songs(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index songs_visibility_created_at_idx on public.songs (visibility, created_at desc);
create index songs_owner_idx on public.songs (owner_id);
create index songs_parent_idx on public.songs (parent_id);

alter table public.songs enable row level security;

-- A signed-in user can read public + own songs. Anon sees only public.
-- Community visibility is added in 0002.
create policy "read public songs"
  on public.songs for select
  using (visibility = 'public');

create policy "read own songs"
  on public.songs for select
  using (auth.uid() = owner_id);

create policy "insert own songs"
  on public.songs for insert
  with check (auth.uid() = owner_id);

create policy "update own songs"
  on public.songs for update
  using (auth.uid() = owner_id);

create policy "delete own songs"
  on public.songs for delete
  using (auth.uid() = owner_id);

-- updated_at maintained by trigger.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- song_states (per-user transpose/capo/simplify)
-- =========================================================================
create table public.song_states (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  transpose  int  not null default 0,
  capo       int  not null default 0,
  simplify   bool not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

alter table public.song_states enable row level security;

create policy "select own state"
  on public.song_states for select
  using (auth.uid() = user_id);

create policy "upsert own state"
  on public.song_states for insert
  with check (auth.uid() = user_id);

create policy "update own state"
  on public.song_states for update
  using (auth.uid() = user_id);

create policy "delete own state"
  on public.song_states for delete
  using (auth.uid() = user_id);

-- =========================================================================
-- Realtime: opt the songs table into broadcasts for the catalog feed.
-- =========================================================================
alter publication supabase_realtime add table public.songs;

-- =========================================================================
-- Seed: the three demo songs as system-owned public catalog rows.
-- owner_id = NULL marks them as immutable seeds.
-- =========================================================================
insert into public.songs (id, owner_id, title, artist, original_key, source, visibility)
values
  ('11111111-1111-1111-1111-111111111111', NULL, 'Wonderwall', 'Oasis', 'Em',
   E'[Verse 1]\n[Em7]Today is gonna be the day that they''re [G]gonna throw it back to [D]you\n[Em7]By now you should''ve somehow rea[G]lized what you gotta [D]do\n[Em7]I don''t believe that [G]anybody [D]feels the way I [Am7]do about you [C]now [D]\n\n[Verse 2]\n[Em7]Backbeat the word is on the [G]street that the fire in your [D]heart is out\n[Em7]I''m sure you''ve heard it [G]all before but you [D]never really had a [Am7]doubt\n\n[Pre-Chorus]\n[C]And all the roads we [D]have to walk are [Em7]winding\n[C]And all the lights that [D]lead us there are [Em7]blinding\n\n[Chorus]\n[C]Because [D]maybe [Em7]you''re gonna be the one that [G]saves me\n[C]And [D]after [Em7]all you''re my [G]wonderwall',
   'public'),

  ('22222222-2222-2222-2222-222222222222', NULL, 'Knockin'' on Heaven''s Door', 'Bob Dylan', 'G',
   E'[Verse 1]\nG               D                 Am\nMama, take this badge off of me\nG                D            C\nI can''t use it anymore\nG              D              Am\nIt''s gettin'' dark, too dark to see\nG            D              C\nFeel I''m knockin'' on heaven''s door\n\n[Chorus]\nG            D              Am\nKnock, knock, knockin'' on heaven''s door\nG            D              C\nKnock, knock, knockin'' on heaven''s door\n\n[Verse 2]\nG                  D              Am\nMama, put my guns in the ground\nG              D                C\nI can''t shoot them anymore\nG                D                  Am\nThat long black cloud is comin'' down\nG            D              C\nFeel I''m knockin'' on heaven''s door',
   'public'),

  ('33333333-3333-3333-3333-333333333333', NULL, 'Nothing Else Matters', 'Metallica', 'Em',
   E'[Intro tab]\ne|--0-----0-----0-----0-----|\nB|--0-----0-----0-----0-----|\nG|--0-----0-----0-----0-----|\nD|--2-----2-----2-----2-----|\nA|--2-----2-----2-----2-----|\nE|--0-----0-----0-----0-----|\n\n[Intro]\nEm   D   C   D\nEm   D   C   D\n\n[Verse 1]\nEm               D            C\nSo close, no matter how far\n              D              Em\nCouldn''t be much more from the heart\n            D                C\nForever trusting who we are\n       D       Em\nAnd nothing else matters\n\n[Verse 2]\n[Em]Never opened myself this [D]way\n[C]Life is ours, we live it our [D]way\n[Em]All these words I don''t just [D]say\n[C]And nothing else [D]matters\n\n[Bridge]\nAm               Em\nTrust I seek and I find in you\nAm             Em\nEvery day for us, something new\nAm             B7\nOpen mind for a different view\n            Em      D    C    D\nAnd nothing else matters',
   'public');
