import { useEffect, useMemo, useState } from 'react';
import { fetchMyLibrary, type CloudSong } from '../lib/cloudSongs';
import { fromCloud, type Song } from '../lib/songModel';
import { cloudEnabled } from '../lib/supabase';
import { navigate } from '../lib/router';
import { fetchMyLikedSongIds, likeSong, unlikeSong } from '../lib/likes';
import { SongCard } from '../components/SongCard';
import { SkeletonGrid } from '../components/Skeleton';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function ContributionsPage({ signedIn, onSignInClick, onRequireSignIn, onToast }: Props) {
  const [mine, setMine] = useState<CloudSong[]>([]);
  const [loading, setLoading] = useState(signedIn && cloudEnabled);
  const [err, setErr] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!signedIn || !cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchMyLibrary()
      .then((rows) => { if (!cancelled) { setMine(rows); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) { setLikedIds(new Set()); return; }
    fetchMyLikedSongIds().then(setLikedIds).catch(() => {});
  }, [signedIn]);

  const stats = useMemo(() => {
    const total = mine.length;
    const published = mine.filter((s) => s.visibility === 'public').length;
    const drafts = total - published;
    const likes = mine.reduce((acc, s) => acc + (s.likeCount ?? 0), 0);
    const plays = mine.reduce((acc, s) => acc + (s.playCount ?? 0), 0);
    return { total, published, drafts, likes, plays };
  }, [mine]);

  const toggleLike = async (s: Song) => {
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

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Sign in to see your contributions</h2>
          <p>Once signed in, this page tracks songs you've added and the love they've received.</p>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My contributions</h1>
          <p className="page-sub">Songs you've added or edited and how the community has engaged.</p>
        </div>
      </div>

      <div className="stats-row">
        <Stat label="Songs" value={stats.total} />
        <Stat label="Public" value={stats.published} />
        <Stat label="Drafts" value={stats.drafts} />
        <Stat label="Saves" value={stats.likes} />
        <Stat label="Plays" value={stats.plays} />
      </div>

      {err && <div className="list-error">{err}</div>}
      {loading && <SkeletonGrid count={6} />}
      {!loading && mine.length === 0 && (
        <div className="page-empty">
          <h3>No contributions yet</h3>
          <p>Add a song and it'll show up here.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'import' })}>Add a song</button>
        </div>
      )}
      {!loading && mine.length > 0 && (
        <div className="grid">
          {mine.map((cs) => {
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
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
