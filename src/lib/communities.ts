import { requireSupabase, type DbCommunity, type CommunityVisibility } from './supabase';
import type { CloudSong } from './cloudSongs';

export type { CommunityVisibility };

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: CommunityVisibility;
  inviteCode: string | null;
  ownerId: string;
  createdAt: number;
}

export const VISIBILITY_LABEL: Record<CommunityVisibility, string> = {
  private: 'Private',
  listed:  'Listed',
  public:  'Public',
  open:    'Open',
};

export const VISIBILITY_DESC: Record<CommunityVisibility, string> = {
  private: 'Hidden. Members only — invite code required.',
  listed:  'Visible in directory; songs hidden until you join.',
  public:  'Anyone can view songs and join. Members can add.',
  open:    'Anyone can view, join, and add songs. The full community.',
};

const fromDb = (r: DbCommunity): Community => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  visibility: r.visibility,
  inviteCode: r.invite_code,
  ownerId: r.owner_id,
  createdAt: new Date(r.created_at).getTime(),
});

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || `c-${Date.now()}`;
const inviteCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export async function listListedCommunities(): Promise<Community[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('communities')
    .select('*')
    .neq('visibility', 'private')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function listMyCommunities(): Promise<Community[]> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from('community_members')
    .select('community:communities(*)')
    .eq('user_id', u.user.id);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.community as DbCommunity | null)
    .filter((c): c is DbCommunity => c !== null)
    .map(fromDb);
}

/** Open communities — anyone signed in can add songs to these without joining. */
export async function listOpenCommunities(): Promise<Community[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('communities')
    .select('*')
    .eq('visibility', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchCommunity(slug: string): Promise<Community | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('communities').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export interface CreateCommunityInput {
  name: string;
  description?: string;
  visibility?: CommunityVisibility;
}

export async function createCommunity(input: CreateCommunityInput): Promise<Community> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to create a community.');
  const slugBase = slugify(input.name);
  const visibility = input.visibility ?? 'private';
  for (let i = 0; i < 5; i++) {
    const attempt = i === 0 ? slugBase : `${slugBase}-${Math.random().toString(36).slice(2, 5)}`;
    const { data, error } = await sb
      .from('communities')
      .insert({
        slug: attempt,
        name: input.name,
        description: input.description ?? null,
        visibility,
        invite_code: visibility === 'private' || visibility === 'listed' ? inviteCode() : null,
        owner_id: u.user.id,
      })
      .select()
      .maybeSingle();
    if (data) return fromDb(data);
    if (error && /duplicate|unique/i.test(error.message)) continue;
    if (error) throw error;
  }
  throw new Error('Could not generate a unique slug. Try a different name.');
}

export async function joinCommunityByCode(code: string): Promise<Community> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('join_community_by_code', { code });
  if (error) throw error;
  return fromDb(data as DbCommunity);
}

export async function joinPublicCommunity(communityId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in to join.');
  const { error } = await sb.from('community_members').upsert({ community_id: communityId, user_id: u.user.id }, { onConflict: 'community_id,user_id' });
  if (error) throw error;
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { error } = await sb.from('community_members').delete().eq('community_id', communityId).eq('user_id', u.user.id);
  if (error) throw error;
}

export async function listCommunitySongs(communityId: string): Promise<CloudSong[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('community_songs')
    .select('pinned, added_at, song:songs(*)')
    .eq('community_id', communityId)
    .order('pinned', { ascending: false })
    .order('added_at', { ascending: false });
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

export async function addSongToCommunity(communityId: string, songId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in.');
  const { error } = await sb
    .from('community_songs')
    .upsert({ community_id: communityId, song_id: songId, added_by: u.user.id }, { onConflict: 'community_id,song_id' });
  if (error) throw error;
}

export async function removeSongFromCommunity(communityId: string, songId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('community_songs').delete().eq('community_id', communityId).eq('song_id', songId);
  if (error) throw error;
}

export interface CommunityMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
  displayName: string | null;
}

export async function listCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('community_members')
    .select('user_id, role, joined_at, profile:profiles(display_name)')
    .eq('community_id', communityId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    userId: r.user_id,
    role: r.role,
    joinedAt: new Date(r.joined_at).getTime(),
    displayName: r.profile?.display_name ?? null,
  }));
}
