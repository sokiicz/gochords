import { requireSupabase, type DbPlaylist } from './supabase';
import { cloudSongFromDb, type CloudSong } from './cloudSongs';

export interface Playlist {
  id: string;
  ownerId: string | null;
  communityId: string | null;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: number;
}

const fromDb = (r: DbPlaylist): Playlist => ({
  id: r.id,
  ownerId: r.owner_id,
  communityId: r.community_id,
  name: r.name,
  description: r.description,
  isPublic: r.is_public,
  createdAt: new Date(r.created_at).getTime(),
});

export async function listMyPlaylists(): Promise<Playlist[]> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from('playlists')
    .select('*')
    .eq('owner_id', u.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function listPublicPlaylistsByOwner(ownerId: string): Promise<Playlist[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('playlists')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function listCommunityPlaylists(communityId: string): Promise<Playlist[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('playlists')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchPlaylist(id: string): Promise<Playlist | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('playlists').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  communityId?: string;
  isPublic?: boolean;
}

export async function createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to create a playlist.');
  const row: Record<string, any> = input.communityId
    ? { community_id: input.communityId, owner_id: null,     name: input.name, description: input.description ?? null, is_public: input.isPublic ?? true }
    : { community_id: null,              owner_id: u.user.id, name: input.name, description: input.description ?? null, is_public: input.isPublic ?? false };
  const { data, error } = await sb.from('playlists').insert(row).select().single();
  if (error) throw error;
  return fromDb(data);
}

export async function deletePlaylist(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('playlists').delete().eq('id', id);
  if (error) throw error;
}

/** Per-(playlist,song) presets persisted alongside the playlist membership row.
 *  Applied on initial load of `song/:id?playlist=<id>` per the precedence stack
 *  (jam > playlist > URL > local > default). All optional — missing keys mean
 *  "use the song defaults". */
export interface PlaylistSongState {
  transpose?: number;
  capo?: number;
  diagramSize?: 'S' | 'M' | 'L';
  note?: string | null;
}

export interface PlaylistEntry {
  song: CloudSong;
  state: PlaylistSongState;
}

export async function listPlaylistSongs(playlistId: string): Promise<CloudSong[]> {
  const entries = await listPlaylistEntries(playlistId);
  return entries.map((e) => e.song);
}

/** Like `listPlaylistSongs` but also returns per-entry preset state. */
export async function listPlaylistEntries(playlistId: string): Promise<PlaylistEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('playlist_songs')
    .select('position, transpose, capo, diagram_size, note, song:songs(*)')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.song)
    .map((r: any) => ({
      song: cloudSongFromDb(r.song),
      state: {
        transpose: typeof r.transpose === 'number' ? r.transpose : undefined,
        capo: typeof r.capo === 'number' ? r.capo : undefined,
        diagramSize: r.diagram_size ?? undefined,
        note: r.note ?? null,
      },
    }));
}

/** Fetch the preset for a single (playlist, song) pair. Null if not in playlist. */
export async function fetchPlaylistSongState(playlistId: string, songId: string): Promise<PlaylistSongState | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('playlist_songs')
    .select('transpose, capo, diagram_size, note')
    .eq('playlist_id', playlistId)
    .eq('song_id', songId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    transpose: typeof (data as any).transpose === 'number' ? (data as any).transpose : undefined,
    capo: typeof (data as any).capo === 'number' ? (data as any).capo : undefined,
    diagramSize: (data as any).diagram_size ?? undefined,
    note: (data as any).note ?? null,
  };
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
  state: PlaylistSongState = {},
): Promise<void> {
  const sb = requireSupabase();
  // pick next position
  const { data: existing } = await sb
    .from('playlist_songs')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing && existing[0]?.position != null) ? existing[0].position + 1 : 0;
  const row: Record<string, any> = { playlist_id: playlistId, song_id: songId, position: nextPos };
  if (state.transpose !== undefined) row.transpose = state.transpose;
  if (state.capo !== undefined) row.capo = state.capo;
  if (state.diagramSize !== undefined) row.diagram_size = state.diagramSize;
  if (state.note !== undefined) row.note = state.note;
  const { error } = await sb
    .from('playlist_songs')
    .upsert(row, { onConflict: 'playlist_id,song_id' });
  if (error) throw error;
}

/** Update the preset for a song already in a playlist. */
export async function updatePlaylistSongState(
  playlistId: string,
  songId: string,
  state: PlaylistSongState,
): Promise<void> {
  const sb = requireSupabase();
  const patch: Record<string, any> = {};
  if (state.transpose !== undefined) patch.transpose = state.transpose;
  if (state.capo !== undefined) patch.capo = state.capo;
  if (state.diagramSize !== undefined) patch.diagram_size = state.diagramSize;
  if (state.note !== undefined) patch.note = state.note;
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb
    .from('playlist_songs')
    .update(patch)
    .eq('playlist_id', playlistId)
    .eq('song_id', songId);
  if (error) throw error;
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('playlist_songs').delete().eq('playlist_id', playlistId).eq('song_id', songId);
  if (error) throw error;
}

export async function reorderPlaylistSongs(playlistId: string, orderedSongIds: string[]): Promise<void> {
  const sb = requireSupabase();
  await Promise.all(
    orderedSongIds.map((songId, position) =>
      sb.from('playlist_songs').update({ position }).eq('playlist_id', playlistId).eq('song_id', songId),
    ),
  );
}
