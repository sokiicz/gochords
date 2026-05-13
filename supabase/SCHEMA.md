# Supabase schema — GoChords

Readable summary of the production schema. **The source of truth is the SQL files in `supabase/migrations/`.** When the two disagree, the migrations win — fix this doc.

Applied through migration **`0008_follows.sql`** (2026-05-13).

## Entity relationships

```
                       auth.users
                            │ 1:1 (trigger)
                            ▼
                       profiles ──────────────────────────────┐
                       │  id, handle, display_name            │
                       │                                      │
            owns ┌─────┴─────┐                                │
                 ▼           ▼                                │
              songs       playlists ──────► playlist_songs    │
              │  visibility:                  (M:N w/ position)│
              │  public │ private │ community                 │
              │                                               │
              │             community_songs (M:N, pinned)     │
              │                  ▲                            │
              │                  │                            │
              └──► song_likes    │                            │
                   song_states   │                            │
                                 ▼                            │
                          communities ──► community_members ──┘
                          │ visibility:                       │
                          │ private │ listed │ public │ open  │
                          │ invite_code, owner_id             │
                                                              │
                          user_follows  (M:N, follower→followee)
```

Helper functions used by RLS: `is_community_member(uuid)`, `is_community_admin(uuid)` — both `SECURITY DEFINER`, defined in `0004`. They exist to break RLS recursion when a policy on `community_members` would otherwise re-query `community_members`.

Counting view: `profile_follow_counts(id, follower_count, following_count)` — `SELECT` granted to `anon` + `authenticated`.

---

## profiles

One row per user. Created automatically by an `auth.users` insert trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | FK → `auth.users(id)` on delete cascade |
| `display_name` | `text` | Default from `raw_user_meta_data.full_name` or local-part of email |
| `handle` | `text` UNIQUE | URL handle (`/u/:handle`) |
| `created_at` | `timestamptz` | |

Indexes: PK on `id`, UNIQUE on `handle`.

RLS:
- **SELECT** — world-readable.
- **INSERT** — only by the matching user (`auth.uid() = id`).
- **UPDATE** — only by the matching user.

Triggers:
- `on_auth_user_created` on `auth.users` → `handle_new_user()` creates the row.

---

## songs

The chord-sheet catalog. Mix of system seeds (`owner_id IS NULL`) and user-authored rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `owner_id` | `uuid` | FK → `profiles(id)` on delete SET NULL. NULL marks an immutable system seed. |
| `title` | `text` | not null |
| `artist` | `text` | not null, defaults to `''` |
| `original_key` | `text` | |
| `source` | `text` | The chord-sheet body (chord-pro / UG / chord-over-lyric, parsed at render time). |
| `visibility` | `text` | CHECK: `'public' \| 'private' \| 'community'`. Default `'public'`. |
| `parent_id` | `uuid` | FK → `songs(id)` on delete SET NULL. Marks edits forked from another song. |
| `default_capo` | `int` | 0–12, default 0 |
| `tempo` | `int` | nullable, 30–300 |
| `tags` | `text[]` | default `'{}'`. Language tags (`it`, `es`, …) and topical tags. |
| `like_count` | `int` | denormalised; maintained by `song_likes` trigger |
| `play_count` | `int` | denormalised |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | maintained by `songs_touch_updated_at` trigger |

Indexes:
- `(visibility, created_at DESC)` — catalog feed
- `(owner_id)` — user library
- `(parent_id)` — fork chains
- `(like_count DESC)` — top-songs sort
- `(created_at DESC)` — newest sort
- GIN on `tags`

RLS — SELECT (union of these policies):
- Visibility = `'public'` (anyone, including anon).
- `auth.uid() = owner_id` (own library, any visibility).
- Visibility = `'community'` AND the song appears in a `community_songs` row whose community is public/open OR the caller is a member.

RLS — write:
- INSERT/UPDATE/DELETE: `auth.uid() = owner_id`.

Triggers:
- `songs_touch_updated_at` — bumps `updated_at` on update.
- (No realtime publication membership? — `songs` is added to `supabase_realtime` in `0001`, so postgres-changes are broadcast.)

---

## song_states

Per-user transpose/capo/simplify preference for a song. Sparse table — a row exists only when the user adjusted defaults.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | PK part. FK → `profiles(id)` on delete cascade |
| `song_id` | `uuid` | PK part. FK → `songs(id)` on delete cascade |
| `transpose` | `int` | default 0 |
| `capo` | `int` | default 0 |
| `simplify` | `bool` | default false |
| `updated_at` | `timestamptz` | |

RLS: SELECT/INSERT/UPDATE/DELETE all gated on `auth.uid() = user_id`. Strictly private.

---

## song_likes

User → song "save to library" relation. Drives `songs.like_count` via trigger.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | PK part. FK → `profiles(id)` |
| `song_id` | `uuid` | PK part. FK → `songs(id)` |
| `liked_at` | `timestamptz` | |

RLS:
- SELECT/INSERT/DELETE: `auth.uid() = user_id`. A user can only see their own likes.

Trigger: `song_likes_count` keeps `songs.like_count` in sync (clamped at ≥ 0 on delete).

---

## communities

Group spaces. Visibility enum is wider than `songs` because it has to encode discoverability AND who-can-join AND who-can-add-songs separately.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` UNIQUE | CHECK `^[a-z0-9-]{3,64}$` |
| `name` | `text` | |
| `description` | `text` | |
| `visibility` | `text` | CHECK in `('private','listed','public','open')`. Default `'private'`. Replaced the old `private` boolean in `0004`. |
| `invite_code` | `text` UNIQUE | populated by `create_community()` only for `private` / `listed` |
| `owner_id` | `uuid` | FK → `profiles(id)` on delete cascade |
| `created_at` | `timestamptz` | |

Visibility semantics:
- `private` — only members see the community exists; join via invite code.
- `listed` — visible in listings; join via invite code.
- `public` — visible, anyone signed-in can join freely.
- `open` — visible, anyone signed-in can add songs without joining.

RLS:
- **SELECT** — non-private OR caller is a member.
- **INSERT** — `auth.uid() = owner_id` (but app calls the `create_community()` RPC, which runs as definer).
- **UPDATE/DELETE** — owner only.

Triggers:
- `on_community_created` → `handle_new_community()` (SECURITY DEFINER): auto-inserts the owner into `community_members` with role `'owner'`.

RPCs:
- `create_community(c_name, c_description, c_visibility)` — slugifies, retries on collision, generates an `invite_code` for `private`/`listed`, inserts the owner-member row atomically. Avoids the historical "new row violates RLS" failure mode of the direct INSERT path.
- `join_community_by_code(code)` — used to join `private` / `listed` communities.

---

## community_members

Membership table.

| Column | Type | Notes |
|---|---|---|
| `community_id` | `uuid` | PK part. FK → `communities(id)` on delete cascade |
| `user_id` | `uuid` | PK part. FK → `profiles(id)` on delete cascade |
| `role` | `text` | CHECK in `('owner','admin','member')`. Default `'member'`. |
| `joined_at` | `timestamptz` | |

RLS:
- **SELECT** — visible to anyone who can see the parent community (i.e. visibility public/open, or caller is a member).
- **INSERT** — `auth.uid() = user_id` AND the community is `public` or `open`. Private/listed go through `join_community_by_code()`.
- **DELETE** — `auth.uid() = user_id` (leave self).

No UPDATE policy — role changes require a definer-side path (none shipped yet).

---

## community_songs

What's in a community.

| Column | Type | Notes |
|---|---|---|
| `community_id` | `uuid` | PK part. FK → `communities(id)` on delete cascade |
| `song_id` | `uuid` | PK part. FK → `songs(id)` on delete cascade |
| `added_by` | `uuid` | FK → `profiles(id)` on delete SET NULL |
| `added_at` | `timestamptz` | |
| `pinned` | `boolean` | default false |

RLS:
- **SELECT** — same audience as the parent community.
- **INSERT** — for `open` communities anyone signed-in; otherwise members only. Enforced inside the RPC too.
- **DELETE** — `added_by = auth.uid()` OR caller is `owner`/`admin` of the community.
- **UPDATE** (pin/unpin) — owner/admin only.

RPCs:
- `add_songs_to_community(c_id, song_ids[])` returns `(added, promoted, skipped, added_ids)`. Auto-promotes the caller's `private` songs to `'community'` so other members can read them. Idempotent on the `(community_id, song_id)` PK.
- `remove_songs_from_community(c_id, song_ids[])` — caller can remove their own additions; owner/admin can remove anyone's. Returns row count.

---

## playlists

Owned by a user OR a community, exclusively (CHECK `(owner_id IS NULL) != (community_id IS NULL)`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `owner_id` | `uuid` | FK → `profiles(id)` on delete cascade. Null when community-owned. |
| `community_id` | `uuid` | FK → `communities(id)` on delete cascade. Null when user-owned. |
| `name` | `text` | |
| `description` | `text` | |
| `is_public` | `boolean` | default false |
| `created_at` | `timestamptz` | |

RLS:
- **SELECT** — `is_public = true` OR own playlist OR member of the owning community.
- **INSERT** — owner-mode: `auth.uid() = owner_id`. Community-mode: caller is a member.
- **UPDATE/DELETE** — owner, or community owner/admin.

---

## playlist_songs

Ordered M:N between playlists and songs.

| Column | Type | Notes |
|---|---|---|
| `playlist_id` | `uuid` | PK part. FK → `playlists(id)` on delete cascade |
| `song_id` | `uuid` | PK part. FK → `songs(id)` on delete cascade |
| `position` | `int` | not null |
| `added_at` | `timestamptz` | |

Index: `(playlist_id, position)` — ordered playback.

RLS:
- **SELECT** — same audience as the parent playlist.
- **All writes** — playlist owner, or member of the owning community.

---

## user_follows

One-way social follow.

| Column | Type | Notes |
|---|---|---|
| `follower_id` | `uuid` | PK part. FK → `profiles(id)` on delete cascade |
| `followee_id` | `uuid` | PK part. FK → `profiles(id)` on delete cascade. CHECK `follower_id <> followee_id`. |
| `followed_at` | `timestamptz` | |

Indexes: `(follower_id)`, `(followee_id)`.

RLS:
- **SELECT** — caller is either side of the row.
- **INSERT** — `auth.uid() = follower_id`.
- **DELETE** — `auth.uid() = follower_id` (unfollow self only).

View `profile_follow_counts` exposes `follower_count` / `following_count` to anon + authenticated without leaking the underlying rows.

---

## Realtime

`alter publication supabase_realtime add table public.songs;` (in `0001`) — postgres-changes broadcasts on `songs` are available to subscribers. No other table is published.

## Helper / RPC summary

| Function | Purpose | Called from |
|---|---|---|
| `handle_new_user()` | Create a `profiles` row on signup | `auth.users` insert trigger |
| `handle_new_community()` | Auto-add owner to `community_members` | `communities` insert trigger |
| `touch_updated_at()` | Bump `updated_at` | `songs` update trigger |
| `bump_song_like_count()` | Maintain `songs.like_count` | `song_likes` insert/delete trigger |
| `is_community_member(c_id)` | RLS helper (no recursion) | policies on `community_members`, `community_songs`, `playlists`, `playlist_songs`, `songs` |
| `is_community_admin(c_id)` | RLS helper (no recursion) | `community_songs` update/delete policies |
| `create_community(name, desc, visibility)` | Atomic community create | client RPC |
| `join_community_by_code(code)` | Join `private`/`listed` by invite | client RPC |
| `add_songs_to_community(c_id, ids[])` | Batch-add, auto-promote private songs | client RPC |
| `remove_songs_from_community(c_id, ids[])` | Batch-remove for undo | client RPC |
