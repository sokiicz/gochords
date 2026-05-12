import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchCatalog, fetchMyLibrary } from '../lib/cloudSongs';
import { fetchMyLikedSongs } from '../lib/likes';
import { listMyPlaylists, listPlaylistSongs, type Playlist } from '../lib/playlists';
import { addSongsToCommunity, type AddSongsResult } from '../lib/communities';
import { fromCloud, type Song } from '../lib/songModel';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  communityId: string;
  communityName: string;
  existingIds: Set<string>;
  /** Called after a successful batch add. */
  onDone: (result: AddSongsResult) => void;
  onClose: () => void;
}

type Tab = 'mine' | 'saved' | 'catalog' | 'playlists';

const TAB_ORDER: Tab[] = ['mine', 'saved', 'catalog', 'playlists'];
const TAB_LABEL: Record<Tab, string> = {
  mine: 'My library',
  saved: 'Saved',
  catalog: 'Catalog',
  playlists: 'Playlists',
};

export function AddSongsToCommunityModal({ open, communityId, communityName, existingIds, onDone, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<Song[] | null>(null);
  const [saved, setSaved] = useState<Song[] | null>(null);
  const [catalog, setCatalog] = useState<Song[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);

  // Selection — keep full song objects so the chip strip can show titles.
  const [selectedMap, setSelectedMap] = useState<Map<string, Song>>(new Map());
  const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lazy load each list on open; cache between tab switches.
  useEffect(() => {
    if (!open) return;
    setSelectedMap(new Map());
    setQ('');
    setErr(null);
    setTab('mine');
    setMine(null); setSaved(null); setCatalog(null); setPlaylists(null);
    fetchMyLibrary().then((r) => setMine(r.filter((s) => s.ownerId !== null).map(fromCloud))).catch(() => setMine([]));
    fetchMyLikedSongs().then(setSaved).catch(() => setSaved([]));
    fetchCatalog({ sort: 'popular', limit: 200 }).then((page) => setCatalog(page.songs.map(fromCloud))).catch(() => setCatalog([]));
    listMyPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  }, [open]);

  // Scroll-lock the body while the modal is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset search and scroll on tab change.
  useEffect(() => { setQ(''); listRef.current?.scrollTo({ top: 0 }); }, [tab]);

  const sourceForTab = (t: Tab): (Song[] | null) =>
    t === 'mine' ? mine : t === 'saved' ? saved : t === 'catalog' ? catalog : null;

  const filtered = useMemo<Song[]>(() => {
    const src = sourceForTab(tab);
    if (!src) return [];
    const needle = q.trim().toLowerCase();
    const base = src.filter((s) => s.origin === 'cloud');
    if (!needle) return base;
    return base.filter((s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle));
  }, [tab, mine, saved, catalog, q]);

  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(needle));
  }, [playlists, q]);

  const isSelected = (id: string) => selectedMap.has(id);
  const toggle = (s: Song) => {
    setSelectedMap((cur) => {
      const next = new Map(cur);
      if (next.has(s.id)) next.delete(s.id); else next.set(s.id, s);
      return next;
    });
  };
  const deselect = (id: string) => {
    setSelectedMap((cur) => { const n = new Map(cur); n.delete(id); return n; });
  };

  // ⌘A: select all visible (in song tabs)
  const selectAllVisible = () => {
    if (tab === 'playlists') return;
    setSelectedMap((cur) => {
      const next = new Map(cur);
      for (const s of filtered) {
        if (!existingIds.has(s.id)) next.set(s.id, s);
      }
      return next;
    });
  };

  const addEntirePlaylist = async (pl: Playlist) => {
    if (pendingPlaylistId) return;
    setPendingPlaylistId(pl.id);
    try {
      const songs = await listPlaylistSongs(pl.id);
      if (songs.length === 0) {
        setErr(`Playlist "${pl.name}" is empty.`);
        return;
      }
      setSelectedMap((cur) => {
        const next = new Map(cur);
        for (const cs of songs) {
          const s = fromCloud(cs);
          if (!existingIds.has(s.id)) next.set(s.id, s);
        }
        return next;
      });
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPendingPlaylistId(null);
    }
  };

  const submit = async () => {
    if (selectedMap.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await addSongsToCommunity(communityId, [...selectedMap.keys()]);
      onDone(result);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: Esc close, ⌘A select-all-visible, ⌘↵ submit
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' &&
          !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        selectAllVisible();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, tab, selectedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const renderSongRow = (s: Song) => {
    const inCommunity = existingIds.has(s.id);
    const checked = isSelected(s.id);
    return (
      <li key={s.id} className={`picker-row ${inCommunity ? 'picker-row-disabled' : ''} ${checked ? 'picker-row-on' : ''}`}>
        <label>
          <span className={`picker-check ${checked ? 'picker-check-on' : ''}`} aria-hidden="true">
            {checked && <Icon name="check" size={14} />}
          </span>
          <input
            type="checkbox"
            checked={checked}
            disabled={inCommunity}
            onChange={() => toggle(s)}
          />
          <div className="picker-row-info">
            <div className="picker-row-title">{s.title}</div>
            <div className="picker-row-artist">
              <span>{s.artist || 'Unknown'}</span>
              {s.originalKey && <span className="card-pill card-pill-key">{s.originalKey}</span>}
              {s.visibility === 'private' && <span className="card-pill" title="Private — will be promoted to community-visible when shared">Will share</span>}
              {inCommunity && <span className="card-pill">Already in</span>}
            </div>
          </div>
        </label>
      </li>
    );
  };

  const currentList = sourceForTab(tab);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <h2>Add songs to <em>{communityName}</em></h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <nav className="tab-row picker-tabs">
          {TAB_ORDER.map((t) => {
            const list = t === 'playlists' ? playlists : sourceForTab(t);
            return (
              <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
                {TAB_LABEL[t]} {list && <span className="tab-count">({list.length})</span>}
              </button>
            );
          })}
        </nav>

        <div className="picker-search">
          <Icon name="star" size={14} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'playlists' ? 'Find a playlist…' : 'Search title or artist…'}
            autoFocus
          />
          {tab !== 'playlists' && filtered.length > 0 && (
            <button className="text-btn picker-select-all" onClick={selectAllVisible} title="⌘A">
              Select all
            </button>
          )}
        </div>

        <div className="picker-list" ref={listRef}>
          {tab === 'playlists' ? (
            playlists === null ? (
              <div className="list-empty">Loading…</div>
            ) : filteredPlaylists.length === 0 ? (
              <div className="list-empty">{q ? 'No playlists match.' : 'No playlists yet. Create one on the Playlists page.'}</div>
            ) : (
              <ul className="picker-list-ul">
                {filteredPlaylists.map((pl) => (
                  <li key={pl.id} className="picker-row picker-row-playlist">
                    <div className="picker-row-info">
                      <div className="picker-row-title">{pl.name}</div>
                      <div className="picker-row-artist">
                        {pl.description || (pl.isPublic ? 'Public' : 'Private')} · playlist
                      </div>
                    </div>
                    <button
                      className="ghost-btn"
                      onClick={() => addEntirePlaylist(pl)}
                      disabled={pendingPlaylistId === pl.id || busy}
                    >
                      {pendingPlaylistId === pl.id ? 'Adding…' : 'Add all songs'}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : currentList === null ? (
            <div className="list-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="list-empty">
              {q ? 'No matches.' : tab === 'mine'
                ? 'Your library is empty — import or fork a song first.'
                : tab === 'saved'
                  ? 'You haven\'t saved any songs yet.'
                  : 'Catalog is empty.'}
            </div>
          ) : (
            <ul className="picker-list-ul">{filtered.map(renderSongRow)}</ul>
          )}
        </div>

        {selectedMap.size > 0 && (
          <div className="picker-selection">
            {[...selectedMap.values()].slice(0, 50).map((s) => (
              <button key={s.id} className="picker-chip" onClick={() => deselect(s.id)} title="Remove from selection">
                <span>{s.title}</span>
                <Icon name="close" size={10} />
              </button>
            ))}
            {selectedMap.size > 50 && (
              <span className="picker-chip picker-chip-more">+{selectedMap.size - 50} more</span>
            )}
          </div>
        )}

        {err && <div className="picker-err">{err}</div>}

        <div className="picker-footer">
          <span className="picker-count">
            {selectedMap.size === 0 ? 'No songs selected' : `${selectedMap.size} selected`}
          </span>
          {selectedMap.size > 0 && (
            <button className="text-btn" onClick={() => setSelectedMap(new Map())} disabled={busy}>Clear</button>
          )}
          <span className="picker-shortcut">⌘↵</span>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={submit} disabled={selectedMap.size === 0 || busy}>
            {busy ? 'Adding…' : selectedMap.size > 0 ? `Add ${selectedMap.size}` : 'Add'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
