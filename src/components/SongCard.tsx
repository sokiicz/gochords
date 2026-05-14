import { useMemo } from 'react';
import type { Song } from '../lib/songModel';
import { Icon } from './Icon';
import { SongActionsMenu } from './SongActionsMenu';
import { chordStatsCached } from '../lib/difficulty';

interface Props {
  song: Song;
  onSelect: (song: Song) => void;
  onDelete?: (song: Song) => void;
  signedIn: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function SongCard({ song, onSelect, onDelete, signedIn, liked, onToggleLike, onRequireSignIn, onToast }: Props) {
  const stats = useMemo(() => chordStatsCached(song.id, song.source), [song.id, song.source]);
  return (
    <article className="card" onClick={() => onSelect(song)}>
      <div className="card-actions-row">
        <SongActionsMenu
          song={song}
          signedIn={signedIn}
          liked={liked}
          onToggleLike={onToggleLike}
          onRequireSignIn={onRequireSignIn}
          onDone={(msg) => msg && onToast(msg)}
          compact
        />
        {onDelete && (
          <button className="card-delete" onClick={(e) => { e.stopPropagation(); onDelete(song); }} aria-label="Delete song" title="Delete">
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      <div className="card-title">{song.title}</div>
      <div className="card-artist">{song.artist || 'Unknown'}</div>
      <div className="card-foot">
        {song.originalKey && <span className="card-pill card-pill-key">{song.originalKey}</span>}
        {stats.unique > 0 && (
          <span className="card-pill card-pill-chords" title={`${stats.unique} unique chord${stats.unique === 1 ? '' : 's'}${stats.barre ? `, ${stats.barre} typically barre` : ''}`}>
            {stats.unique} ch{stats.barre > 0 && ` · ${stats.barre} barre`}
          </span>
        )}
        {song.likeCount > 0 && <span className="card-pill"><Icon name="heart" size={11} /> {song.likeCount}</span>}
        {song.tags?.slice(0, 2).map((t) => <span key={t} className="card-pill">{t}</span>)}
        {song.visibility === 'private' && <span className="card-pill card-pill-private">Private</span>}
        {song.origin === 'local' && <span className="card-pill">Local</span>}
        {song.parentId && <span className="card-pill">Fork</span>}
        {song.seeded && <span className="card-pill card-pill-demo">Demo</span>}
      </div>
    </article>
  );
}
