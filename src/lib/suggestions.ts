/**
 * Suggestion flow. A "suggestion" is a regular song row with `suggested_for`
 * pointing at the target song the author wants to amend. Forking + editing
 * already produces the child song; flipping `suggested_for` submits it for
 * review by the target's owner or an admin.
 *
 * See supabase/migrations/0012_song_suggestions.sql for RLS + merge RPC.
 */
import { cloudSongFromDb, type CloudSong } from './cloudSongs';
import { requireSupabase, type DbSong } from './supabase';

/** Set or clear `suggested_for` on a song the caller owns. */
export async function submitSuggestion(songId: string, targetId: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('songs')
    .update({ suggested_for: targetId })
    .eq('id', songId);
  if (error) throw error;
}

/** Withdraw a suggestion the caller owns. Same operation as submit(null). */
export async function withdrawSuggestion(songId: string): Promise<void> {
  return submitSuggestion(songId, null);
}

/** All open suggestions targeting a given song. Returns full CloudSongs. */
export async function listSuggestionsFor(targetId: string): Promise<CloudSong[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('songs')
    .select('*')
    .eq('suggested_for', targetId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => cloudSongFromDb(r as DbSong));
}

/** Count open suggestions for a target. Cheap; used by the player header pill. */
export async function countSuggestionsFor(targetId: string): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .eq('suggested_for', targetId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Atomically copy the suggestion's content onto the target and delete the
 * suggestion row. RPC enforces authorisation (target owner or admin).
 */
export async function mergeSuggestion(suggestionId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('merge_suggestion', { suggestion_id: suggestionId });
  if (error) throw error;
}

/** Reject = clear the suggestion flag so the row reverts to a normal fork. */
export async function rejectSuggestion(suggestionId: string): Promise<void> {
  return submitSuggestion(suggestionId, null);
}
