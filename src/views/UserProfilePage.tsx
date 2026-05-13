import { useEffect, useState } from 'react';
import {
  amIFollowing,
  fetchFollowCounts,
  fetchProfileByIdentifier,
  followUser,
  unfollowUser,
  type FollowCounts,
  type Profile,
} from '../lib/profile';
import { fetchPublicSongsByOwner, type CloudSong } from '../lib/cloudSongs';
import { listPublicPlaylistsByOwner, type Playlist } from '../lib/playlists';
import { fromCloud, type Song } from '../lib/songModel';
import { fetchMyLikedSongIds, likeSong, unlikeSong } from '../lib/likes';
import { cloudEnabled } from '../lib/supabase';
import { navigate } from '../lib/router';
import { SongCard } from '../components/SongCard';
import { SkeletonGrid } from '../components/Skeleton';
import { Icon } from '../components/Icon';

interface Props {
  handle: string;
  signedIn: boolean;
  userId: string | null;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function UserProfilePage({ handle, signedIn, userId, onRequireSignIn, onToast }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followHover, setFollowHover] = useState(false);

  useEffect(() => {
    if (!cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchProfileByIdentifier(handle)
      .then(async (p) => {
        if (cancelled) return;
        if (!p) { setErr('No such user.'); setLoading(false); return; }
        setProfile(p);
        const [s, pl, fc, am] = await Promise.all([
          fetchPublicSongsByOwner(p.id),
          listPublicPlaylistsByOwner(p.id),
          fetchFollowCounts(p.id).catch(() => ({ followers: 0, following: 0 } as FollowCounts)),
          signedIn ? amIFollowing(p.id).catch(() => false) : Promise.resolve(false),
        ]);
        if (cancelled) return;
        setSongs(s);
        setPlaylists(pl);
        setCounts(fc);
        setFollowing(am);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [handle]);

  useEffect(() => {
    if (!signedIn) { setLikedIds(new Set()); return; }
    fetchMyLikedSongIds().then(setLikedIds).catch(() => {});
  }, [signedIn]);

  const toggleLike = async (s: Song) => {
    if (!signedIn) { onRequireSignIn('Sign in to save songs.'); return; }
    const liked = likedIds.has(s.id);
    setLikedIds((set) => { const n = new Set(set); if (liked) n.delete(s.id); else n.add(s.id); return n; });
    try {
      if (liked) await unlikeSong(s.id); else await likeSong(s.id);
      onToast(liked ? 'Removed from library' : 'Saved to library');
    } catch (e: any) {
      onToast(`Failed: ${e.message}`);
      setLikedIds((set) => { const n = new Set(set); if (liked) n.add(s.id); else n.delete(s.id); return n; });
    }
  };

  if (!cloudEnabled) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>User profiles need cloud mode</h2>
          <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Back</button>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>{err}</h2>
          <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Back to catalog</button>
        </div>
      </div>
    );
  }

  const totalSaves = songs.reduce((acc, s) => acc + (s.likeCount ?? 0), 0);
  const totalPlays = songs.reduce((acc, s) => acc + (s.playCount ?? 0), 0);
  const isSelf = !!userId && !!profile && profile.id === userId;

  const onFollowClick = async () => {
    if (!profile) return;
    if (!signedIn) { onRequireSignIn('Sign in to follow.'); return; }
    setFollowBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setCounts((c) => ({ ...c, followers: c.followers + (wasFollowing ? -1 : 1) }));
    try {
      if (wasFollowing) await unfollowUser(profile.id);
      else await followUser(profile.id);
    } catch (e: any) {
      setFollowing(wasFollowing);
      setCounts((c) => ({ ...c, followers: c.followers + (wasFollowing ? 1 : -1) }));
      onToast(`Failed: ${e.message}`);
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="user-profile-header">
        <div className="user-profile-avatar" aria-hidden>
          {(profile?.displayName ?? handle).trim()[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="user-profile-meta">
          <h1>{profile?.displayName ?? handle}</h1>
          <div className="user-profile-sub">{profile?.handle ? `@${profile.handle}` : handle}</div>
          {!loading && (
            <div className="user-profile-counts">
              <span>{songs.length} song{songs.length === 1 ? '' : 's'}</span>
              <span>{playlists.length} playlist{playlists.length === 1 ? '' : 's'}</span>
              <span>{counts.followers} follower{counts.followers === 1 ? '' : 's'}</span>
              <span>{totalSaves} save{totalSaves === 1 ? '' : 's'}</span>
              <span>{totalPlays} play{totalPlays === 1 ? '' : 's'}</span>
            </div>
          )}
        </div>
        {!loading && profile && !isSelf && (
          <button
            className={`primary-btn user-follow-btn ${following ? 'user-follow-btn-on' : ''}`}
            disabled={followBusy}
            onClick={onFollowClick}
            onMouseEnter={() => setFollowHover(true)}
            onMouseLeave={() => setFollowHover(false)}
          >
            {following ? (followHover ? 'Unfollow' : 'Following') : 'Follow'}
          </button>
        )}
      </div>

      {loading && <SkeletonGrid count={6} />}

      {!loading && songs.length > 0 && (
        <>
          <h2 className="section-h">Songs <span className="section-h-sub">{songs.length}</span></h2>
          <div className="grid">
            {songs.map((cs) => {
              const song = fromCloud(cs);
              return (
                <SongCard
                  key={song.id}
                  song={song}
                  onSelect={(s) => navigate({ name: 'song', id: s.id })}
                  signedIn={signedIn}
                  liked={likedIds.has(song.id)}
                  onToggleLike={() => toggleLike(song)}
                  onRequireSignIn={onRequireSignIn}
                  onToast={onToast}
                />
              );
            })}
          </div>
        </>
      )}

      {!loading && playlists.length > 0 && (
        <>
          <h2 className="section-h">Public playlists <span className="section-h-sub">{playlists.length}</span></h2>
          <div className="user-playlist-list">
            {playlists.map((pl) => (
              <a
                key={pl.id}
                className="user-playlist-row"
                href={`#/playlist/${encodeURIComponent(pl.id)}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  navigate({ name: 'playlist', id: pl.id });
                }}
              >
                <Icon name="list" size={16} />
                <div>
                  <div className="user-playlist-name">{pl.name}</div>
                  {pl.description && <div className="user-playlist-desc">{pl.description}</div>}
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {!loading && songs.length === 0 && playlists.length === 0 && (
        <div className="page-empty">
          <h3>Nothing public yet</h3>
          <p>This user hasn't shared any songs or playlists publicly.</p>
        </div>
      )}
    </div>
  );
}
