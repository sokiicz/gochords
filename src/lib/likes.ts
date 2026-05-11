import { requireSupabase } from './supabase';
import { fromCloud, type Song } from './songModel';
import type { CloudSong } from './cloudSongs';

export async function fetchMyLikedSongIds(): Promise<Set<string>> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new Set();
  const { data, error } = await sb.from('song_likes').select('song_id').eq('user_id', u.user.id);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.song_id));
}

export async function fetchMyLikedSongs(): Promise<Song[]> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from('song_likes')
    .select('liked_at, song:songs(*)')
    .eq('user_id', u.user.id)
    .order('liked_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.song as CloudSong | null)
    .filter((s): s is CloudSong => s !== null)
    .map((s) => fromCloud({
      id: s.id,
      ownerId: (s as any).owner_id ?? null,
      title: s.title,
      artist: s.artist,
      originalKey: (s as any).original_key ?? null,
      source: s.source,
      visibility: s.visibility,
      parentId: (s as any).parent_id ?? null,
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : new Date((s as any).created_at).getTime(),
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : new Date((s as any).updated_at).getTime(),
      defaultCapo: (s as any).default_capo ?? 0,
      tempo: (s as any).tempo ?? null,
      tags: (s as any).tags ?? [],
      likeCount: (s as any).like_count ?? 0,
      playCount: (s as any).play_count ?? 0,
      seeded: ((s as any).owner_id ?? null) === null,
    }));
}

export async function likeSong(songId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to save songs.');
  const { error } = await sb.from('song_likes').upsert({ user_id: u.user.id, song_id: songId }, { onConflict: 'user_id,song_id' });
  if (error) throw error;
}

export async function unlikeSong(songId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { error } = await sb.from('song_likes').delete().eq('user_id', u.user.id).eq('song_id', songId);
  if (error) throw error;
}
