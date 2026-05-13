import { requireSupabase, type DbSong, type DbSongState, type Visibility } from './supabase';

export type CloudSong = {
  id: string;
  ownerId: string | null;
  title: string;
  artist: string;
  originalKey: string | null;
  source: string;
  visibility: Visibility;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  defaultCapo: number;
  tempo: number | null;
  tags: string[];
  likeCount: number;
  playCount: number;
  /** True when the row is a system-owned demo (owner_id is null). */
  seeded: boolean;
};

const fromDb = (r: DbSong): CloudSong => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  artist: r.artist,
  originalKey: r.original_key,
  source: r.source,
  visibility: r.visibility,
  parentId: r.parent_id,
  createdAt: new Date(r.created_at).getTime(),
  updatedAt: new Date(r.updated_at).getTime(),
  defaultCapo: r.default_capo ?? 0,
  tempo: r.tempo ?? null,
  tags: r.tags ?? [],
  likeCount: r.like_count ?? 0,
  playCount: r.play_count ?? 0,
  seeded: r.owner_id === null,
});

export type CatalogSort = 'newest' | 'popular' | 'alpha';

export interface CatalogQuery {
  sort?: CatalogSort;
  search?: string;
  key?: string;
  tags?: string[];
  limit?: number;
}

export interface CatalogPage {
  songs: CloudSong[];
  cursor: string | null;
}

/** Distinct primary-artist names from public songs (sorted), with a per-session cache. */
let artistListCache: { at: number; data: string[] } | null = null;
const ARTIST_LIST_TTL_MS = 60_000;

export async function fetchArtistList(): Promise<string[]> {
  if (artistListCache && Date.now() - artistListCache.at < ARTIST_LIST_TTL_MS) {
    return artistListCache.data;
  }
  const sb = requireSupabase();
  const { data, error } = await sb.from('songs').select('artist').eq('visibility', 'public').limit(1000);
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const a = (row as { artist: string }).artist?.trim();
    if (!a) continue;
    // Strip "ft./feat./featuring …" so autocomplete suggests primary artists, not collab strings.
    const primary = a.split(/\s+(?:ft\.?|feat\.?|featuring)\s+/i)[0].trim();
    if (primary) seen.add(primary);
  }
  const result = [...seen].sort((a, b) => a.localeCompare(b));
  artistListCache = { at: Date.now(), data: result };
  return result;
}

/** Public catalog with sort + filter. */
export async function fetchCatalog(query: CatalogQuery = {}): Promise<CatalogPage> {
  const limit = query.limit ?? 100;
  const sb = requireSupabase();
  let q = sb.from('songs').select('*').eq('visibility', 'public').limit(limit);

  if (query.search?.trim()) {
    const term = query.search.trim().replace(/[%_]/g, ' ');
    q = q.or(`title.ilike.%${term}%,artist.ilike.%${term}%`);
  }
  if (query.key && query.key !== 'Any') q = q.ilike('original_key', query.key);
  if (query.tags && query.tags.length > 0) q = q.contains('tags', query.tags);

  switch (query.sort ?? 'newest') {
    case 'popular': q = q.order('like_count', { ascending: false }).order('created_at', { ascending: false }); break;
    case 'alpha':   q = q.order('title', { ascending: true }); break;
    case 'newest':
    default:        q = q.order('created_at', { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw error;
  return { songs: (data ?? []).map(fromDb), cursor: null };
}

/** Public songs owned by a specific user. */
export async function fetchPublicSongsByOwner(ownerId: string): Promise<CloudSong[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('songs')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('visibility', 'public')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

/** Songs owned by the current authenticated user. */
export async function fetchMyLibrary(): Promise<CloudSong[]> {
  const sb = requireSupabase();
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return [];
  const { data, error } = await sb.from('songs').select('*').eq('owner_id', uid).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchSong(id: string): Promise<CloudSong | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('songs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export interface SongDraft {
  title: string;
  artist: string;
  originalKey?: string;
  source: string;
  visibility?: Visibility;
  parentId?: string | null;
  defaultCapo?: number;
  tempo?: number | null;
  tags?: string[];
}

export async function insertSong(draft: SongDraft): Promise<CloudSong> {
  const sb = requireSupabase();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) throw new Error('Sign in to publish a song.');
  const { data, error } = await sb
    .from('songs')
    .insert({
      owner_id: userData.user.id,
      title: draft.title,
      artist: draft.artist,
      original_key: draft.originalKey ?? null,
      source: draft.source,
      visibility: draft.visibility ?? 'public',
      parent_id: draft.parentId ?? null,
      default_capo: draft.defaultCapo ?? 0,
      tempo: draft.tempo ?? null,
      tags: draft.tags ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbSong);
}

export async function updateSong(id: string, patch: Partial<SongDraft>): Promise<CloudSong> {
  const sb = requireSupabase();
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.artist !== undefined) dbPatch.artist = patch.artist;
  if (patch.originalKey !== undefined) dbPatch.original_key = patch.originalKey;
  if (patch.source !== undefined) dbPatch.source = patch.source;
  if (patch.visibility !== undefined) dbPatch.visibility = patch.visibility;
  if (patch.defaultCapo !== undefined) dbPatch.default_capo = patch.defaultCapo;
  if (patch.tempo !== undefined) dbPatch.tempo = patch.tempo;
  if (patch.tags !== undefined) dbPatch.tags = patch.tags;
  const { data, error } = await sb.from('songs').update(dbPatch).eq('id', id).select().single();
  if (error) throw error;
  return fromDb(data as DbSong);
}

export async function deleteSong(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('songs').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to inserts/updates of public songs. Returns an unsubscribe function. */
export function subscribeCatalog(onChange: (kind: 'insert' | 'update' | 'delete', song: CloudSong) => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel('catalog-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'songs', filter: 'visibility=eq.public' }, (payload) => {
      onChange('insert', fromDb(payload.new as DbSong));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'songs', filter: 'visibility=eq.public' }, (payload) => {
      onChange('update', fromDb(payload.new as DbSong));
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'songs' }, (payload) => {
      onChange('delete', fromDb(payload.old as DbSong));
    })
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

// =============================================================================
// Per-user view state (transpose / capo / simplify)
// =============================================================================

export interface CloudSongState {
  transpose: number;
  capo: number;
  simplify: boolean;
}

export async function fetchSongState(songId: string): Promise<CloudSongState | null> {
  const sb = requireSupabase();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await sb
    .from('song_states')
    .select('transpose, capo, simplify')
    .eq('user_id', userData.user.id)
    .eq('song_id', songId)
    .maybeSingle();
  if (error) throw error;
  return data ? { transpose: data.transpose, capo: data.capo, simplify: data.simplify } : null;
}

export async function upsertSongState(songId: string, state: CloudSongState): Promise<void> {
  const sb = requireSupabase();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return;
  const row: Partial<DbSongState> = {
    user_id: userData.user.id,
    song_id: songId,
    transpose: state.transpose,
    capo: state.capo,
    simplify: state.simplify,
  };
  const { error } = await sb.from('song_states').upsert(row, { onConflict: 'user_id,song_id' });
  if (error) throw error;
}
