import { useEffect, useMemo, useState } from 'react';
import { deleteSong, fetchMyLibrary, type CloudSong } from '../lib/cloudSongs';
import { fetchMyLikedSongs, fetchMyLikedSongIds, likeSong, unlikeSong } from '../lib/likes';
import { fromCloud, fromLocal, type Song } from '../lib/songModel';
import type { StoredSong } from '../lib/storage';
import { cloudEnabled } from '../lib/supabase';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import { SongCard } from '../components/SongCard';
import { SkeletonGrid } from '../components/Skeleton';

type LibTab = 'mine' | 'saved';

interface Props {
  signedIn: boolean;
  localSongs: StoredSong[];
  onImport: () => void;
  onLocalDelete: (id: string) => void;
  onCloudDeleted: () => void;
  onSyncRequest: () => void;
  refreshKey: number;
  onSignInClick: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function LibraryPage({ signedIn, localSongs, onImport, onLocalDelete, onCloudDeleted, onSyncRequest, refreshKey, onSignInClick, onRequireSignIn, onToast }: Props) {
  const [tab, setTab] = useState<LibTab>('mine');
  const [cloudMine, setCloudMine] = useState<CloudSong[]>([]);
  const [savedSongs, setSavedSongs] = useState<Song[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!signedIn) { setCloudMine([]); setSavedSongs([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMyLibrary(), fetchMyLikedSongs(), fetchMyLikedSongIds()])
      .then(([mine, saved, ids]) => {
        if (cancelled) return;
        setCloudMine(mine); setSavedSongs(saved); setLikedIds(ids);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn, refreshKey]);

  const mineSongs = useMemo<Song[]>(() => {
    if (signedIn) return cloudMine.map(fromCloud);
    return localSongs.filter((s) => s.seeded !== true).map(fromLocal);
  }, [signedIn, cloudMine, localSongs]);

  const visibleSongs: Song[] = tab === 'mine' ? mineSongs : savedSongs;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return visibleSongs;
    return visibleSongs.filter((s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle));
  }, [visibleSongs, q]);

  const localUnsyncedCount = useMemo(
    () => localSongs.filter((s) => !s.seeded && !s.syncedAt).length,
    [localSongs],
  );

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.title}"?`)) return;
    if (song.origin === 'local') {
      onLocalDelete(song.id);
    } else {
      try {
        await deleteSong(song.id);
        setCloudMine((c) => c.filter((s) => s.id !== song.id));
        onCloudDeleted();
      } catch (err: any) {
        alert(`Could not delete: ${err.message}`);
      }
    }
  };

  const toggleLike = async (s: Song) => {
    const isLiked = likedIds.has(s.id);
    setLikedIds((set) => { const n = new Set(set); if (isLiked) n.delete(s.id); else n.add(s.id); return n; });
    try {
      if (isLiked) {
        await unlikeSong(s.id);
        setSavedSongs((cur) => cur.filter((x) => x.id !== s.id));
      } else {
        await likeSong(s.id);
      }
      onToast(isLiked ? 'Removed from saved' : 'Saved');
    } catch (e: any) {
      onToast(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My library</h1>
          <p className="page-sub">
            {signedIn
              ? 'Songs you imported, forked, or saved.'
              : cloudEnabled
                ? 'Saved on this device. Sign in to sync across browsers.'
                : 'Saved on this device.'}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="primary-btn" onClick={onImport}>
            <Icon name="plusCircle" size={16} /> Add a song
          </button>
        </div>
      </div>

      {!signedIn && cloudEnabled && mineSongs.length > 0 && (
        <div className="banner banner-info">
          <span>You have {mineSongs.length} song{mineSongs.length === 1 ? '' : 's'} saved locally.</span>
          <button className="primary-btn" onClick={onSignInClick}>Sign in to sync</button>
        </div>
      )}

      {signedIn && localUnsyncedCount > 0 && (
        <div className="banner banner-info">
          <span>{localUnsyncedCount} local song{localUnsyncedCount === 1 ? '' : 's'} from before sign-in.</span>
          <button className="primary-btn" onClick={onSyncRequest}>Sync to my account</button>
        </div>
      )}

      {signedIn && (
        <nav className="tab-row">
          <button className={`tab ${tab === 'mine' ? 'tab-active' : ''}`} onClick={() => setTab('mine')}>
            Mine ({mineSongs.length})
          </button>
          <button className={`tab ${tab === 'saved' ? 'tab-active' : ''}`} onClick={() => setTab('saved')}>
            Saved ({savedSongs.length})
          </button>
        </nav>
      )}

      <div className="search-row">
        <div className="search-input">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
        </div>
      </div>

      {err && <div className="list-error">{err}</div>}
      {loading && <SkeletonGrid count={6} />}

      {!loading && filtered.length === 0 && (
        <div className="page-empty">
          <h3>{q ? 'No matches' : tab === 'saved' ? 'No saved songs yet' : 'Nothing here yet'}</h3>
          <p>
            {q
              ? 'Try a different search.'
              : tab === 'saved'
                ? 'Hit the heart on any song in the catalog to save it here.'
                : signedIn
                  ? 'Import a song or fork one from Browse.'
                  : 'Add a song below — it will be saved on this device. Sign in later to sync.'}
          </p>
          {!q && tab !== 'saved' && (
            <button className="primary-btn" onClick={onImport}>
              <Icon name="plusCircle" size={16} /> Add a song
            </button>
          )}
          {!q && tab === 'saved' && (
            <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>
              <Icon name="star" size={16} /> Browse catalog
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid">
          {filtered.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              onSelect={(s) => navigate({ name: 'song', id: s.id })}
              onDelete={tab === 'mine' ? handleDelete : undefined}
              signedIn={signedIn}
              liked={likedIds.has(song.id)}
              onToggleLike={() => toggleLike(song)}
              onRequireSignIn={onRequireSignIn}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
