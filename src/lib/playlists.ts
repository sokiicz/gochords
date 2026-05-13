import { requireSupabase, type DbPlaylist } from './supabase';
import type { CloudSong } from './cloudSongs';

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

export async function listPlaylistSongs(playlistId: string): Promise<CloudSong[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('playlist_songs')
    .select('position, song:songs(*)')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.song)
    .filter(Boolean)
    .map((s: any) => ({
      id: s.id,
      ownerId: s.owner_id,
      title: s.title,
      artist: s.artist,
      originalKey: s.original_key,
      source: s.source,
      visibility: s.visibility,
      parentId: s.parent_id,
      createdAt: new Date(s.created_at).getTime(),
      updatedAt: new Date(s.updated_at).getTime(),
      defaultCapo: s.default_capo ?? 0,
      tempo: s.tempo ?? null,
      tags: s.tags ?? [],
      likeCount: s.like_count ?? 0,
      playCount: s.play_count ?? 0,
      seeded: s.owner_id === null,
    }));
}

export async function addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
  const sb = requireSupabase();
  // pick next position
  const { data: existing } = await sb
    .from('playlist_songs')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing && existing[0]?.position != null) ? existing[0].position + 1 : 0;
  const { error } = await sb
    .from('playlist_songs')
    .upsert({ playlist_id: playlistId, song_id: songId, position: nextPos }, { onConflict: 'playlist_id,song_id' });
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
