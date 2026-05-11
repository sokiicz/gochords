import { useEffect, useState } from 'react';
import { fetchPlaylist, listPlaylistSongs, removeSongFromPlaylist, deletePlaylist, type Playlist } from '../lib/playlists';
import { fromCloud, type Song } from '../lib/songModel';
import type { CloudSong } from '../lib/cloudSongs';
import { navigate, navigateBack } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  playlistId: string;
  userId: string | null;
}

export function PlaylistDetailPage({ playlistId, userId }: Props) {
  const [pl, setPl] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchPlaylist(playlistId), listPlaylistSongs(playlistId)])
      .then(([p, s]) => { setPl(p); setSongs(s); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };

  useEffect(load, [playlistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = pl && userId && pl.ownerId === userId;

  const handleRemove = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    await removeSongFromPlaylist(playlistId, songId);
    setSongs((s) => s.filter((x) => x.id !== songId));
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
            {pl.description || (pl.isPublic ? 'Public playlist' : 'Private playlist')} · {songs.length} song{songs.length === 1 ? '' : 's'}
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

      {songs.length === 0 ? (
        <div className="page-empty">
          <h3>Empty playlist</h3>
          <p>Open a song and use the menu (•••) → "Add to playlist" to drop it in here.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Browse catalog</button>
        </div>
      ) : (
        <ol className="playlist-list">
          {songs.map((cs, i) => {
            const song: Song = fromCloud(cs);
            return (
              <li key={song.id} className="playlist-row" onClick={() => navigate({ name: 'song', id: song.id })}>
                <span className="playlist-pos">{i + 1}</span>
                <div className="playlist-row-info">
                  <div className="playlist-row-title">{song.title}</div>
                  <div className="playlist-row-artist">{song.artist || 'Unknown'}</div>
                </div>
                <div className="playlist-row-meta">
                  {song.originalKey && <span className="card-pill card-pill-key">{song.originalKey}</span>}
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
