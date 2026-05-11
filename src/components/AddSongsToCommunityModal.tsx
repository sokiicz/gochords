import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchMyLibrary, type CloudSong } from '../lib/cloudSongs';
import { fetchMyLikedSongs } from '../lib/likes';
import { listMyPlaylists, listPlaylistSongs, type Playlist } from '../lib/playlists';
import { addSongsToCommunity } from '../lib/communities';
import { fromCloud, type Song } from '../lib/songModel';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  communityId: string;
  communityName: string;
  existingIds: Set<string>;
  onDone: (msg: string) => void;
  onClose: () => void;
}

type Tab = 'mine' | 'saved' | 'playlists';

export function AddSongsToCommunityModal({ open, communityId, communityName, existingIds, onDone, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<Song[] | null>(null);
  const [saved, setSaved] = useState<Song[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingPlaylist, setPendingPlaylist] = useState<string | null>(null);

  // Reset when reopened
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQ('');
    setErr(null);
    setTab('mine');
    // Lazy load lists once per open
    fetchMyLibrary().then((s) => setMine(s.map((cs) => fromCloud(cs as CloudSong)))).catch(() => setMine([]));
    fetchMyLikedSongs().then(setSaved).catch(() => setSaved([]));
    listMyPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sourceList: Song[] = tab === 'mine' ? (mine ?? []) : (saved ?? []);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = sourceList.filter((s) => s.origin === 'cloud');
    if (!needle) return base;
    return base.filter((s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle));
  }, [sourceList, q]);

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePlaylist = async (pl: Playlist) => {
    if (pendingPlaylist) return;
    setPendingPlaylist(pl.id);
    try {
      const songs = await listPlaylistSongs(pl.id);
      setSelected((cur) => {
        const next = new Set(cur);
        for (const s of songs) next.add(s.id);
        return next;
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPendingPlaylist(null);
    }
  };

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const { added } = await addSongsToCommunity(communityId, ids);
      onDone(`Added ${added} song${added === 1 ? '' : 's'} to ${communityName}`);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const renderSongRow = (s: Song) => {
    const inCommunity = existingIds.has(s.id);
    const isChecked = selected.has(s.id);
    return (
      <li key={s.id} className={`picker-row ${inCommunity ? 'picker-row-disabled' : ''} ${isChecked ? 'picker-row-on' : ''}`}>
        <label>
          <input
            type="checkbox"
            checked={isChecked}
            disabled={inCommunity}
            onChange={() => toggle(s.id)}
          />
          <div className="picker-row-info">
            <div className="picker-row-title">{s.title}</div>
            <div className="picker-row-artist">
              {s.artist || 'Unknown'}
              {s.originalKey && <span className="card-pill card-pill-key" style={{ marginLeft: 6 }}>{s.originalKey}</span>}
              {s.visibility === 'private' && <span className="card-pill card-pill-private" style={{ marginLeft: 6 }}>Private</span>}
              {inCommunity && <span className="card-pill" style={{ marginLeft: 6 }}>Already in</span>}
            </div>
          </div>
        </label>
      </li>
    );
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <h2>Add songs to {communityName}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <nav className="tab-row picker-tabs">
          <button className={`tab ${tab === 'mine' ? 'tab-active' : ''}`} onClick={() => setTab('mine')}>
            My library {mine && <span className="tab-count">({mine.length})</span>}
          </button>
          <button className={`tab ${tab === 'saved' ? 'tab-active' : ''}`} onClick={() => setTab('saved')}>
            Saved {saved && <span className="tab-count">({saved.length})</span>}
          </button>
          <button className={`tab ${tab === 'playlists' ? 'tab-active' : ''}`} onClick={() => setTab('playlists')}>
            My playlists {playlists && <span className="tab-count">({playlists.length})</span>}
          </button>
        </nav>

        {tab !== 'playlists' && (
          <div className="picker-search">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              autoFocus
            />
          </div>
        )}

        <div className="picker-list">
          {tab === 'playlists' ? (
            playlists === null ? (
              <div className="list-empty">Loading…</div>
            ) : playlists.length === 0 ? (
              <div className="list-empty">No playlists yet. Create one from the Playlists page.</div>
            ) : (
              <ul className="picker-list-ul">
                {playlists.map((pl) => (
                  <li key={pl.id} className="picker-row picker-row-playlist">
                    <div className="picker-row-info">
                      <div className="picker-row-title">{pl.name}</div>
                      <div className="picker-row-artist">{pl.description || (pl.isPublic ? 'Public' : 'Private')} · playlist</div>
                    </div>
                    <button
                      className="ghost-btn"
                      onClick={() => togglePlaylist(pl)}
                      disabled={pendingPlaylist === pl.id || busy}
                    >
                      {pendingPlaylist === pl.id ? 'Adding…' : 'Add all songs'}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            (tab === 'mine' ? mine : saved) === null ? (
              <div className="list-empty">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="list-empty">
                {q ? 'No matches.' : tab === 'mine'
                  ? 'Your library is empty — import or fork a song first.'
                  : 'You haven\'t saved any songs yet.'}
              </div>
            ) : (
              <ul className="picker-list-ul">{filtered.map(renderSongRow)}</ul>
            )
          )}
        </div>

        {err && <div className="signin-error" style={{ padding: '8px 16px 0' }}>{err}</div>}

        <div className="picker-footer">
          <span className="picker-count">
            {selected.size === 0 ? 'No songs selected' : `${selected.size} song${selected.size === 1 ? '' : 's'} selected`}
          </span>
          {selected.size > 0 && (
            <button className="text-btn" onClick={() => setSelected(new Set())} disabled={busy}>Clear</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={submit} disabled={selected.size === 0 || busy}>
            {busy ? 'Adding…' : `Add ${selected.size || ''} to community`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
