-- 0003 — communities, playlists, likes, counts

-- =========================================================================
-- Counts on songs (denormalised for fast sort)
-- =========================================================================
alter table public.songs
  add column like_count int not null default 0,
  add column play_count int not null default 0;

create index songs_like_count_idx on public.songs (like_count desc);
create index songs_created_at_idx on public.songs (created_at desc);

-- =========================================================================
-- Likes (saves to library)
-- =========================================================================
create table public.song_likes (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  song_id   uuid not null references public.songs(id)    on delete cascade,
  liked_at  timestamptz not null default now(),
  primary key (user_id, song_id)
);

alter table public.song_likes enable row level security;

create policy "select own likes"   on public.song_likes for select using (auth.uid() = user_id);
create policy "insert own likes"   on public.song_likes for insert with check (auth.uid() = user_id);
create policy "delete own likes"   on public.song_likes for delete using (auth.uid() = user_id);

-- Maintain like_count
create or replace function public.bump_song_like_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then update public.songs set like_count = like_count + 1 where id = new.song_id; return new;
  elsif tg_op = 'DELETE' then update public.songs set like_count = greatest(0, like_count - 1) where id = old.song_id; return old;
  end if; return null;
end; $$;

create trigger song_likes_count
  after insert or delete on public.song_likes
  for each row execute function public.bump_song_like_count();

-- =========================================================================
-- Communities
-- =========================================================================
create table public.communities (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9-]{3,64}$'),
  name        text not null,
  description text,
  private     boolean not null default false,
  invite_code text unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)    on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table public.community_songs (
  community_id uuid not null references public.communities(id) on delete cascade,
  song_id      uuid not null references public.songs(id)        on delete cascade,
  added_by     uuid references public.profiles(id) on delete set null,
  added_at     timestamptz not null default now(),
  pinned       boolean not null default false,
  primary key (community_id, song_id)
);

alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.community_songs   enable row level security;

-- Owner is automatically a member
create or replace function public.handle_new_community() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.community_members (community_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end; $$;

create trigger on_community_created
  after insert on public.communities
  for each row execute function public.handle_new_community();

-- Communities visibility
create policy "select non-private or member"
  on public.communities for select
  using (
    private = false
    or exists (
      select 1 from public.community_members m
      where m.community_id = communities.id and m.user_id = auth.uid()
    )
  );

create policy "create community"
  on public.communities for insert
  with check (auth.uid() = owner_id);

create policy "update own community"
  on public.communities for update
  using (auth.uid() = owner_id);

create policy "delete own community"
  on public.communities for delete
  using (auth.uid() = owner_id);

-- Membership read/write
create policy "members read membership"
  on public.community_members for select
  using (
    exists (
      select 1 from public.community_members m2
      where m2.community_id = community_members.community_id
        and m2.user_id = auth.uid()
    )
  );

-- Insert: anyone signed in can join a non-private community; private requires the RPC below.
create policy "join non-private"
  on public.community_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.communities c
      where c.id = community_id and c.private = false
    )
  );

create policy "leave self"
  on public.community_members for delete
  using (auth.uid() = user_id);

-- Songs in communities — visible to members; insert/delete by members.
create policy "members see community songs"
  on public.community_songs for select
  using (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_songs.community_id
        and m.user_id = auth.uid()
    )
  );

create policy "members add community songs"
  on public.community_songs for insert
  with check (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_songs.community_id
        and m.user_id = auth.uid()
    )
  );

create policy "members remove own community songs"
  on public.community_songs for delete
  using (
    auth.uid() = added_by
    or exists (
      select 1 from public.community_members m
      where m.community_id = community_songs.community_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

create policy "owners pin"
  on public.community_songs for update
  using (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_songs.community_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- Extend songs SELECT to allow community visibility
create policy "read community-shared songs"
  on public.songs for select
  using (
    visibility = 'community'
    and exists (
      select 1 from public.community_songs cs
      join public.community_members m on m.community_id = cs.community_id
      where cs.song_id = songs.id and m.user_id = auth.uid()
    )
  );

-- Join private community by code
create or replace function public.join_community_by_code(code text)
returns public.communities language plpgsql security definer set search_path = public as $$
declare
  c public.communities;
begin
  select * into c from public.communities where invite_code = code;
  if not found then raise exception 'Invalid invite code'; end if;
  insert into public.community_members (community_id, user_id, role)
    values (c.id, auth.uid(), 'member')
    on conflict do nothing;
  return c;
end; $$;

-- =========================================================================
-- Playlists
-- =========================================================================
create table public.playlists (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  name         text not null,
  description  text,
  is_public    boolean not null default false,
  created_at   timestamptz not null default now(),
  -- Exactly one of owner_id / community_id must be set
  check ((owner_id is null) != (community_id is null))
);

create table public.playlist_songs (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  song_id     uuid not null references public.songs(id)     on delete cascade,
  position    int  not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

create index playlist_songs_order_idx on public.playlist_songs (playlist_id, position);

alter table public.playlists      enable row level security;
alter table public.playlist_songs enable row level security;

-- Read: public OR owned OR community member
create policy "read accessible playlists"
  on public.playlists for select
  using (
    is_public = true
    or auth.uid() = owner_id
    or (
      community_id is not null and exists (
        select 1 from public.community_members m
        where m.community_id = playlists.community_id and m.user_id = auth.uid()
      )
    )
  );

-- Insert: owner-owned by self, or community member
create policy "create playlist"
  on public.playlists for insert
  with check (
    (owner_id is not null and auth.uid() = owner_id)
    or (
      community_id is not null and exists (
        select 1 from public.community_members m
        where m.community_id = playlists.community_id and m.user_id = auth.uid()
      )
    )
  );

create policy "update own playlist"
  on public.playlists for update
  using (
    auth.uid() = owner_id
    or (
      community_id is not null and exists (
        select 1 from public.community_members m
        where m.community_id = playlists.community_id
          and m.user_id = auth.uid()
          and m.role in ('owner','admin')
      )
    )
  );

create policy "delete own playlist"
  on public.playlists for delete
  using (
    auth.uid() = owner_id
    or (
      community_id is not null and exists (
        select 1 from public.community_members m
        where m.community_id = playlists.community_id
          and m.user_id = auth.uid()
          and m.role in ('owner','admin')
      )
    )
  );

-- playlist_songs follow the parent playlist's permissions
create policy "read playlist songs"
  on public.playlist_songs for select
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_songs.playlist_id
        and (
          p.is_public = true
          or auth.uid() = p.owner_id
          or (p.community_id is not null and exists (
                select 1 from public.community_members m
                where m.community_id = p.community_id and m.user_id = auth.uid()
              ))
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
          or (p.community_id is not null and exists (
                select 1 from public.community_members m
                where m.community_id = p.community_id and m.user_id = auth.uid()
              ))
        )
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_songs.playlist_id
        and (
          auth.uid() = p.owner_id
          or (p.community_id is not null and exists (
                select 1 from public.community_members m
                where m.community_id = p.community_id and m.user_id = auth.uid()
              ))
        )
    )
  );
