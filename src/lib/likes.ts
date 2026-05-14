import { requireSupabase, type DbSong } from './supabase';
import { fromCloud, type Song } from './songModel';
import { cloudSongFromDb } from './cloudSongs';

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
    .map((r: any) => r.song)
    .filter((s: any) => s !== null)
    .map((s: any) => fromCloud(cloudSongFromDb(s as DbSong)));
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
