import { useEffect, useState } from 'react';
import { fetchPlaylist, listPlaylistEntries, removeSongFromPlaylist, deletePlaylist, type Playlist, type PlaylistEntry } from '../lib/playlists';
import { fromCloud, type Song } from '../lib/songModel';
import { navigate, navigateBack } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  playlistId: string;
  userId: string | null;
}

export function PlaylistDetailPage({ playlistId, userId }: Props) {
  const [pl, setPl] = useState<Playlist | null>(null);
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchPlaylist(playlistId), listPlaylistEntries(playlistId)])
      .then(([p, e]) => { setPl(p); setEntries(e); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };

  useEffect(load, [playlistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = pl && userId && pl.ownerId === userId;

  const handleRemove = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    await removeSongFromPlaylist(playlistId, songId);
    setEntries((s) => s.filter((x) => x.song.id !== songId));
  };

  const openInPlaylistContext = (songId: string) => {
    // Bypass navigate() so we can attach ?playlist=<id> — the player reads this
    // on mount and applies the preset stored on this playlist entry.
    window.location.hash = `#/song/${encodeURIComponent(songId)}?playlist=${encodeURIComponent(playlistId)}`;
  };

  const handleDelete = async () => {
    if (!pl || !confirm(`Delete playlist "${pl.name}"?`)) return;
    await deletePlaylist(pl.id);
    navigate({ name: 'playlists' });
  };

  if (loading) return <div className="page page-narrow"><div className="page-empty"><h2>Loading…</h2></div></div>;
  if (err || !pl) return <div className="page page-narrow"><div className="page-empty"><h2>Playlist not found</h2><p>{err}</p></div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="ghost-btn back-btn" onClick={() => navigateBack({ name: 'playlists' })}>← Back</button>
          <h1>{pl.name}</h1>
          <p className="page-sub">
            {pl.description || (pl.isPublic ? 'Public playlist' : 'Private playlist')} · {entries.length} song{entries.length === 1 ? '' : 's'}
          </p>
        </div>
        {isOwner && (
          <div className="page-header-actions">
            <button className="ghost-btn danger" onClick={handleDelete}>
              <Icon name="trash" size={14} /> Delete playlist
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="page-empty">
          <h3>Empty playlist</h3>
          <p>Open a song and use the menu (•••) → "Add to playlist" to drop it in here.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Browse catalog</button>
        </div>
      ) : (
        <ol className="playlist-list">
          {entries.map(({ song: cs, state }, i) => {
            const song: Song = fromCloud(cs);
            const presetBits: string[] = [];
            if (state.transpose != null && state.transpose !== 0) presetBits.push(`${state.transpose > 0 ? '+' : ''}${state.transpose}`);
            if (state.capo != null && state.capo > 0) presetBits.push(`Cap.${state.capo}`);
            return (
              <li key={song.id} className="playlist-row" onClick={() => openInPlaylistContext(song.id)}>
                <span className="playlist-pos">{i + 1}</span>
                <div className="playlist-row-info">
                  <div className="playlist-row-title">{song.title}</div>
                  <div className="playlist-row-artist">{song.artist || 'Unknown'}</div>
                </div>
                <div className="playlist-row-meta">
                  {song.originalKey && <span className="card-pill card-pill-key">{song.originalKey}</span>}
                  {presetBits.length > 0 && (
                    <span className="card-pill card-pill-preset" title="Saved preset for this playlist entry">{presetBits.join(' · ')}</span>
                  )}
                  {song.tempo && <span className="card-pill">{song.tempo} BPM</span>}
                </div>
                {isOwner && (
                  <button className="icon-btn" onClick={(e) => handleRemove(e, song.id)} aria-label="Remove from playlist" title="Remove">
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
