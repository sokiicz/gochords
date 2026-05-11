import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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

/** Convenience for callers that have already gated on `cloudEnabled`. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  return supabase;
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
