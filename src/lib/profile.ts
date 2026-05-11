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
