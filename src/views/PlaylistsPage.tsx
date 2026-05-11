import { useEffect, useState } from 'react';
import { createPlaylist, listMyPlaylists, type Playlist } from '../lib/playlists';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
}

export function PlaylistsPage({ signedIn, onSignInClick }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) { setPlaylists([]); return; }
    let c = false;
    setLoading(true);
    listMyPlaylists()
      .then((rows) => { if (!c) { setPlaylists(rows); setLoading(false); } })
      .catch(() => { if (!c) setLoading(false); });
    return () => { c = true; };
  }, [signedIn]);

  const create = async () => {
    if (!draftName.trim()) return;
    setBusy(true);
    try {
      const pl = await createPlaylist({ name: draftName.trim() });
      setPlaylists((p) => [pl, ...p]);
      setDraftName('');
      setCreating(false);
      navigate({ name: 'playlist', id: pl.id });
    } finally { setBusy(false); }
  };

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Playlists</h2>
          <p>Sign in to build playlists you can share with friends.</p>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Playlists</h1>
          <p className="page-sub">Group songs into setlists. Share them publicly or keep them to yourself.</p>
        </div>
        <div className="page-header-actions">
          <button className="primary-btn" onClick={() => setCreating(true)}>
            <Icon name="plusCircle" size={16} /> New playlist
          </button>
        </div>
      </div>

      {creating && (
        <div className="banner banner-info">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setDraftName(''); } }}
            placeholder="Playlist name"
            style={{ flex: 1, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)' }}
          />
          <button className="ghost-btn" onClick={() => { setCreating(false); setDraftName(''); }}>Cancel</button>
          <button className="primary-btn" onClick={create} disabled={!draftName.trim() || busy}>Create</button>
        </div>
      )}

      {loading && <div className="list-empty">Loading…</div>}
      {!loading && playlists.length === 0 && !creating && (
        <div className="page-empty">
          <h3>No playlists yet</h3>
          <p>Create one and start adding songs.</p>
          <button className="primary-btn" onClick={() => setCreating(true)}>
            <Icon name="plusCircle" size={16} /> New playlist
          </button>
        </div>
      )}

      <div className="grid">
        {playlists.map((pl) => (
          <article key={pl.id} className="card" onClick={() => navigate({ name: 'playlist', id: pl.id })}>
            <div className="card-title">{pl.name}</div>
            <div className="card-artist">{pl.description || (pl.isPublic ? 'Public playlist' : 'Private playlist')}</div>
            <div className="card-foot">
              {pl.isPublic ? <span className="card-pill card-pill-public">Public</span> : <span className="card-pill card-pill-private">Private</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
