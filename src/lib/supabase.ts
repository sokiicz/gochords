import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `import.meta.env` is injected by Vite at build time; in plain Node (test scripts)
// it's undefined, which would throw at module load. Guard the access so the module
// can be imported in both environments.
const env = (import.meta as any).env ?? {};
const URL = env.VITE_SUPABASE_URL as string | undefined;
const ANON = env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(URL && ANON);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(URL!, ANON!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let testClient: SupabaseClient | null = null;

/** Convenience for callers that have already gated on `cloudEnabled`. */
export function requireSupabase(): SupabaseClient {
  if (testClient) return testClient;
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  return supabase;
}

/** Test-only: swap the client returned by `requireSupabase`. Pass `null` to clear. */
export function _setSupabaseForTests(client: SupabaseClient | null) {
  testClient = client;
}

// =============================================================================
// Database row types — kept in sync with supabase/migrations/0001_init.sql
// =============================================================================

export type Visibility = 'public' | 'private' | 'community';

export interface DbProfile {
  id: string;
  display_name: string | null;
  handle: string | null;
  created_at: string;
  role?: 'user' | 'admin';
}

export interface DbSong {
  id: string;
  owner_id: string | null;
  title: string;
  artist: string;
  original_key: string | null;
  source: string;
  visibility: Visibility;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  default_capo: number;
  tempo: number | null;
  tags: string[];
  like_count: number;
  play_count: number;
  suggested_for?: string | null;
}

export type CommunityVisibility = 'private' | 'listed' | 'public' | 'open';

export interface DbCommunity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: CommunityVisibility;
  invite_code: string | null;
  owner_id: string;
  created_at: string;
}

export interface DbPlaylist {
  id: string;
  owner_id: string | null;
  community_id: string | null;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface DbSongState {
  user_id: string;
  song_id: string;
  transpose: number;
  capo: number;
  simplify: boolean;
  updated_at: string;
}
