import { useEffect, useState } from 'react';
import { requireSupabase, type DbProfile } from './supabase';
import { cloudEnabled, supabase } from './supabase';

export interface Profile {
  id: string;
  displayName: string | null;
  handle: string | null;
  createdAt: number;
  role: 'user' | 'admin';
}

const fromDb = (r: DbProfile): Profile => ({
  id: r.id,
  displayName: r.display_name,
  handle: r.handle,
  createdAt: new Date(r.created_at).getTime(),
  role: r.role === 'admin' ? 'admin' : 'user',
});

/**
 * Reactive "my profile" hook. Refetches when the auth state changes so the
 * `role` field stays accurate after sign-in/out. Returns null when signed-out
 * or cloud disabled.
 */
export function useMyProfile(signedIn: boolean): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!signedIn || !cloudEnabled || !supabase) { setProfile(null); return; }
    let cancelled = false;
    fetchMyProfile()
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [signedIn]);
  return profile;
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', u.user.id).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export async function fetchProfileByHandle(handle: string): Promise<Profile | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('handle', handle).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

/** Resolve a profile by either a handle or a raw UUID. Used by the /u/:identifier route. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function fetchProfileByIdentifier(identifier: string): Promise<Profile | null> {
  return UUID_RE.test(identifier) ? fetchProfile(identifier) : fetchProfileByHandle(identifier);
}

// ---------- Follows ----------

export interface FollowCounts { followers: number; following: number; }

export async function fetchFollowCounts(userId: string): Promise<FollowCounts> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profile_follow_counts')
    .select('follower_count, following_count')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    followers: (data as any)?.follower_count ?? 0,
    following: (data as any)?.following_count ?? 0,
  };
}

/** Returns true if the signed-in user already follows `userId`. */
export async function amIFollowing(userId: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { data, error } = await sb
    .from('user_follows')
    .select('follower_id')
    .eq('follower_id', u.user.id)
    .eq('followee_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function followUser(userId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to follow.');
  if (u.user.id === userId) throw new Error("You can't follow yourself.");
  const { error } = await sb.from('user_follows').insert({ follower_id: u.user.id, followee_id: userId });
  if (error && !/duplicate/i.test(error.message)) throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { error } = await sb
    .from('user_follows')
    .delete()
    .eq('follower_id', u.user.id)
    .eq('followee_id', userId);
  if (error) throw error;
}

// ---------- Updates feed ----------

export interface UpdateEvent {
  kind: 'like_on_my_song' | 'new_follower' | 'song_from_followed';
  at: number;
  actor?: { id: string; displayName: string | null; handle: string | null } | null;
  song?: { id: string; title: string; artist: string } | null;
}

/** Aggregate a simple "updates" feed for the signed-in user. */
export async function fetchUpdates(limit = 40): Promise<UpdateEvent[]> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const me = u.user.id;

  const [likesRes, followersRes, followingRes] = await Promise.all([
    // recent likes on songs I own
    sb.from('song_likes')
      .select('liked_at, user_id, song:songs!inner(id, title, artist, owner_id), profile:profiles!song_likes_user_id_fkey(display_name, handle)')
      .eq('song.owner_id', me)
      .neq('user_id', me)
      .order('liked_at', { ascending: false })
      .limit(limit),
    // recent new followers
    sb.from('user_follows')
      .select('followed_at, follower:profiles!user_follows_follower_id_fkey(id, display_name, handle)')
      .eq('followee_id', me)
      .order('followed_at', { ascending: false })
      .limit(limit),
    // recent songs from people I follow
    sb.from('user_follows')
      .select('followee_id')
      .eq('follower_id', me),
  ]);

  const events: UpdateEvent[] = [];

  if (likesRes.data) {
    for (const r of likesRes.data as any[]) {
      events.push({
        kind: 'like_on_my_song',
        at: new Date(r.liked_at).getTime(),
        actor: r.profile ? { id: r.user_id, displayName: r.profile.display_name, handle: r.profile.handle } : null,
        song: r.song ? { id: r.song.id, title: r.song.title, artist: r.song.artist } : null,
      });
    }
  }

  if (followersRes.data) {
    for (const r of followersRes.data as any[]) {
      events.push({
        kind: 'new_follower',
        at: new Date(r.followed_at).getTime(),
        actor: r.follower ? { id: r.follower.id, displayName: r.follower.display_name, handle: r.follower.handle } : null,
      });
    }
  }

  if (followingRes.data && followingRes.data.length > 0) {
    const ids = (followingRes.data as any[]).map((r) => r.followee_id);
    const [songsRes, profilesRes] = await Promise.all([
      sb.from('songs')
        .select('id, title, artist, owner_id, created_at')
        .in('owner_id', ids)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit),
      sb.from('profiles').select('id, display_name, handle').in('id', ids),
    ]);
    const profileById = new Map<string, { displayName: string | null; handle: string | null }>();
    for (const p of (profilesRes.data as any[] | null) ?? []) {
      profileById.set(p.id, { displayName: p.display_name, handle: p.handle });
    }
    for (const s of (songsRes.data as any[] | null) ?? []) {
      const p = profileById.get(s.owner_id);
      events.push({
        kind: 'song_from_followed',
        at: new Date(s.created_at).getTime(),
        actor: p ? { id: s.owner_id, displayName: p.displayName, handle: p.handle } : null,
        song: { id: s.id, title: s.title, artist: s.artist },
      });
    }
  }

  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}

/** Profiles I follow (for the Following feed). */
export async function fetchFollowing(): Promise<Profile[]> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from('user_follows')
    .select('followee:profiles!user_follows_followee_id_fkey(*)')
    .eq('follower_id', u.user.id);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.followee)
    .filter(Boolean)
    .map((p: any) => fromDb(p));
}

export interface UpdateProfileInput {
  displayName?: string | null;
  handle?: string | null;
}

const HANDLE_RE = /^[a-z0-9_-]{3,32}$/;

export async function updateMyProfile(patch: UpdateProfileInput): Promise<Profile> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to update your profile.');
  if (patch.handle != null && patch.handle !== '' && !HANDLE_RE.test(patch.handle)) {
    throw new Error('Handle must be 3–32 chars, lowercase letters/numbers/underscore/dash.');
  }
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName?.trim() || null;
  if (patch.handle !== undefined) row.handle = patch.handle?.trim() || null;
  const { data, error } = await sb.from('profiles').update(row).eq('id', u.user.id).select().single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('That handle is already taken.');
    throw error;
  }
  return fromDb(data as DbProfile);
}
