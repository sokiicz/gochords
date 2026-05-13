-- 0008 — user follows (one-way "follow")

create table public.user_follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  followee_id  uuid not null references public.profiles(id) on delete cascade,
  followed_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.user_follows enable row level security;

-- A user can read follows where they are either side (their own follows + who follows them).
-- The aggregate counts go through a public view (see below).
create policy "read own follow rows"
  on public.user_follows
  for select
  using (auth.uid() = follower_id or auth.uid() = followee_id);

create policy "follow others"
  on public.user_follows
  for insert
  with check (auth.uid() = follower_id);

create policy "unfollow own"
  on public.user_follows
  for delete
  using (auth.uid() = follower_id);

create index user_follows_follower_idx on public.user_follows (follower_id);
create index user_follows_followee_idx on public.user_follows (followee_id);

-- Public counts view so any visitor can see follower/following totals on a profile
-- without bypassing RLS on the underlying row data.
create or replace view public.profile_follow_counts as
  select
    p.id,
    (select count(*) from public.user_follows f where f.followee_id = p.id) as follower_count,
    (select count(*) from public.user_follows f where f.follower_id = p.id) as following_count
  from public.profiles p;

grant select on public.profile_follow_counts to anon, authenticated;
