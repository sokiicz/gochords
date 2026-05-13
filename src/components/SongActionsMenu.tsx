import { useEffect, useRef, useState } from 'react';
import type { Song } from '../lib/songModel';
import { listMyPlaylists, createPlaylist, addSongToPlaylist, type Playlist } from '../lib/playlists';
import {
  listMyCommunities,
  listOpenCommunities,
  addSongToCommunity,
  createCommunity,
  type Community,
} from '../lib/communities';
import { Icon } from './Icon';

interface Props {
  song: Song;
  signedIn: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onRequireSignIn: (reason: string) => void;
  onDone?: (msg?: string) => void;
  /** Compact icon-only render (for cards). Otherwise shows heart + label. */
  compact?: boolean;
}

type Submenu = null | 'playlist' | 'community';

export function SongActionsMenu({ song, signedIn, liked, onToggleLike, onRequireSignIn, onDone, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Submenu>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [creatingFor, setCreatingFor] = useState<Submenu>(null);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSub(null);
        setCreatingFor(null);
      }
    };
    setTimeout(() => document.addEventListener('click', onClick), 0);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  useEffect(() => {
    if (sub === 'playlist' && playlists === null && signedIn) {
      listMyPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
    }
    if (sub === 'community' && communities === null && signedIn) {
      // Combine: communities I'm a member of + all 'open' communities anyone signed in can add to.
      Promise.all([listMyCommunities(), listOpenCommunities()])
        .then(([mine, open]) => {
          const seen = new Set<string>();
          const combined: Community[] = [];
          [...mine, ...open].forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); combined.push(c); } });
          setCommunities(combined);
        })
        .catch(() => setCommunities([]));
    }
  }, [sub, signedIn, playlists, communities]);

  const heartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!signedIn) { onRequireSignIn('Sign in to save songs to your library.'); return; }
    onToggleLike();
  };

  const moreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
    setSub(null);
    setCreatingFor(null);
  };

  const handleAddToPlaylist = async (pl: Playlist) => {
    if (song.origin !== 'cloud') {
      onDone?.('Only cloud songs can be added to playlists. Publish or sync first.');
      return;
    }
    setBusy(true);
    try {
      await addSongToPlaylist(pl.id, song.id);
      onDone?.(`Added to "${pl.name}"`);
    } catch (e: any) {
      onDone?.(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
      setOpen(false); setSub(null);
    }
  };

  const handleAddToCommunity = async (c: Community) => {
    if (song.origin !== 'cloud') { onDone?.('Only cloud songs can be added. Publish or sync first.'); return; }
    setBusy(true);
    try {
      await addSongToCommunity(c.id, song.id);
      onDone?.(`Added to ${c.name}`);
    } catch (e: any) {
      onDone?.(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
      setOpen(false); setSub(null);
    }
  };

  const submitNew = async () => {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (creatingFor === 'playlist') {
        const pl = await createPlaylist({ name });
        setPlaylists((cur) => (cur ? [pl, ...cur] : [pl]));
        await handleAddToPlaylist(pl);
      } else if (creatingFor === 'community') {
        const c = await createCommunity({ name });
        setCommunities((cur) => (cur ? [c, ...cur] : [c]));
        await handleAddToCommunity(c);
      }
    } catch (e: any) {
      onDone?.(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
      setDraftName('');
      setCreatingFor(null);
    }
  };

  return (
    <div className="actions" onClick={(e) => e.stopPropagation()}>
      <button
        className={`heart-btn ${liked ? 'heart-btn-on' : ''}`}
        onClick={heartClick}
        aria-label={liked ? 'Remove from library' : 'Save to library'}
        title={liked ? 'Saved to library' : 'Save to library'}
      >
        <Icon name={liked ? 'heartFilled' : 'heart'} size={compact ? 16 : 18} />
        {!compact && <span>{liked ? 'Saved' : 'Save'}</span>}
      </button>

      <div className="more-wrap" ref={popRef}>
        <button
          className="icon-btn"
          onClick={moreClick}
          aria-label="More actions"
          aria-expanded={open}
          title="More"
        >
          <Icon name="more" />
        </button>

        {open && (
          <div className="popover">
            {!sub && (
              <>
                <button className="popover-row" onClick={() => signedIn ? setSub('playlist') : onRequireSignIn('Sign in to use playlists.')}>
                  <Icon name="list" size={14} />
                  <span>Add to playlist</span>
                  <span className="popover-chev">›</span>
                </button>
                <button className="popover-row" onClick={() => signedIn ? setSub('community') : onRequireSignIn('Sign in to share with a community.')}>
                  <Icon name="users" size={14} />
                  <span>Share to community</span>
                  <span className="popover-chev">›</span>
                </button>
              </>
            )}

            {sub === 'playlist' && (
              <>
                <button className="popover-row popover-back" onClick={() => setSub(null)}>← Back</button>
                <div className="popover-section-title">Your playlists</div>
                {playlists === null && <div className="popover-empty">Loading…</div>}
                {playlists?.length === 0 && !creatingFor && <div className="popover-empty">No playlists yet.</div>}
                {playlists?.map((p) => (
                  <button key={p.id} className="popover-row" onClick={() => handleAddToPlaylist(p)} disabled={busy}>
                    <Icon name="list" size={14} />
                    <span>{p.name}</span>
                  </button>
                ))}
                {creatingFor !== 'playlist' && (
                  <button className="popover-row popover-create" onClick={() => setCreatingFor('playlist')}>
                    <Icon name="plus" size={14} />
                    <span>New playlist…</span>
                  </button>
                )}
                {creatingFor === 'playlist' && (
                  <div className="popover-form">
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Playlist name"
                      onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setCreatingFor(null); setDraftName(''); } }}
                    />
                    <button className="primary-btn" onClick={submitNew} disabled={!draftName.trim() || busy}>Create</button>
                  </div>
                )}
              </>
            )}

            {sub === 'community' && (
              <>
                <button className="popover-row popover-back" onClick={() => setSub(null)}>← Back</button>
                <div className="popover-section-title">Your communities</div>
                {communities === null && <div className="popover-empty">Loading…</div>}
                {communities?.length === 0 && !creatingFor && <div className="popover-empty">You're not in any community yet.</div>}
                {communities?.map((c) => (
                  <button key={c.id} className="popover-row" onClick={() => handleAddToCommunity(c)} disabled={busy}>
                    <Icon name="users" size={14} />
                    <span>{c.name}</span>
                    <span className="popover-pill">{c.visibility}</span>
                  </button>
                ))}
                {creatingFor !== 'community' && (
                  <button className="popover-row popover-create" onClick={() => setCreatingFor('community')}>
                    <Icon name="plus" size={14} />
                    <span>New community…</span>
                  </button>
                )}
                {creatingFor === 'community' && (
                  <div className="popover-form">
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Community name"
                      onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setCreatingFor(null); setDraftName(''); } }}
                    />
                    <button className="primary-btn" onClick={submitNew} disabled={!draftName.trim() || busy}>Create</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
