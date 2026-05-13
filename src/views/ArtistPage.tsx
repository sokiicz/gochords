import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, type CloudSong } from '../lib/cloudSongs';
import { fromCloud, type Song } from '../lib/songModel';
import { cloudEnabled } from '../lib/supabase';
import { navigate } from '../lib/router';
import { allArtists, slugify } from '../lib/search';
import { fetchMyLikedSongIds, likeSong, unlikeSong } from '../lib/likes';
import { SongCard } from '../components/SongCard';
import { SkeletonGrid } from '../components/Skeleton';

interface Props {
  slug: string;
  signedIn: boolean;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function ArtistPage({ slug, signedIn, onRequireSignIn, onToast }: Props) {
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchCatalog({ limit: 1000, sort: 'alpha' })
      .then((page) => { if (!cancelled) { setSongs(page.songs); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!signedIn) { setLikedIds(new Set()); return; }
    fetchMyLikedSongIds().then(setLikedIds).catch(() => {});
  }, [signedIn]);

  const matched = useMemo(
    () => songs.filter((s) => allArtists(s.artist).some((a) => slugify(a) === slug)),
    [songs, slug],
  );

  // Best-effort canonical name: the first artist we see whose slug matches.
  const canonicalName = useMemo(() => {
    for (const s of matched) {
      const hit = allArtists(s.artist).find((a) => slugify(a) === slug);
      if (hit) return hit;
    }
    return slug.replace(/-/g, ' ');
  }, [matched, slug]);

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
          <h2>Artist pages need cloud mode</h2>
          <button className="primary-btn" onClick={() => navigate({ name: 'library' })}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="ghost-btn back-btn" onClick={() => history.back()}>← Back</button>
          <h1 style={{ marginTop: 6 }}>{canonicalName}</h1>
          <p className="page-sub">
            {loading ? 'Loading…' : `${matched.length} song${matched.length === 1 ? '' : 's'} in the catalog`}
          </p>
        </div>
      </div>
      {err && <div className="list-error">{err}</div>}
      {loading && <SkeletonGrid count={6} />}
      {!loading && matched.length === 0 && (
        <div className="page-empty">
          <h3>No public songs by this artist yet</h3>
          <p>If you've added one, make sure its visibility is set to Public.</p>
        </div>
      )}
      {!loading && matched.length > 0 && (
        <div className="grid">
          {matched.map((cs) => {
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
