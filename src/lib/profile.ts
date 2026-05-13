import { requireSupabase, type DbProfile } from './supabase';

export interface Profile {
  id: string;
  displayName: string | null;
  handle: string | null;
  createdAt: number;
}

const fromDb = (r: DbProfile): Profile => ({
  id: r.id,
  displayName: r.display_name,
  handle: r.handle,
  createdAt: new Date(r.created_at).getTime(),
});

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
