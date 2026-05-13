import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, subscribeCatalog, type CatalogSort, type CloudSong } from '../lib/cloudSongs';
import { fetchMyLikedSongIds, likeSong, unlikeSong } from '../lib/likes';
import { fromCloud, type Song } from '../lib/songModel';
import { cloudEnabled } from '../lib/supabase';
import { navigate } from '../lib/router';
import { matches } from '../lib/search';
import { Icon } from '../components/Icon';
import { SongCard } from '../components/SongCard';
import { SkeletonGrid } from '../components/Skeleton';

const SORTS: { id: CatalogSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Most saved' },
  { id: 'alpha', label: 'A → Z' },
];

interface Props {
  signedIn: boolean;
  onImport: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function BrowsePage({ signedIn, onImport, onRequireSignIn, onToast }: Props) {
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [trending, setTrending] = useState<CloudSong[]>([]);
  const [loading, setLoading] = useState(cloudEnabled);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<CatalogSort>('newest');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Fetch the full catalog (sorted) and filter client-side so diacritics, ampersands,
  // and "and/a" alternatives all match. Cap at 500 — when the catalog grows past that,
  // search will need to move to server-side via Postgres' unaccent extension.
  useEffect(() => {
    if (!cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchCatalog({ sort, limit: 500 })
      .then((page) => { if (!cancelled) { setSongs(page.songs); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });

    const unsub = subscribeCatalog((kind, song) => {
      setSongs((cur) => {
        if (kind === 'delete') return cur.filter((s) => s.id !== song.id);
        if (kind === 'insert') return cur.some((s) => s.id === song.id) ? cur : [song, ...cur];
        return cur.map((s) => (s.id === song.id ? song : s));
      });
    });
    return () => { cancelled = true; unsub(); };
  }, [sort]);

  // Trending (only on default view)
  useEffect(() => {
    if (!cloudEnabled || q || activeTags.length > 0 || sort !== 'newest') { setTrending([]); return; }
    fetchCatalog({ sort: 'popular', limit: 6 }).then((page) => setTrending(page.songs)).catch(() => {});
  }, [q, activeTags, sort]);

  // Liked ids
  useEffect(() => {
    if (!signedIn) { setLikedIds(new Set()); return; }
    fetchMyLikedSongIds().then(setLikedIds).catch(() => {});
  }, [signedIn]);

  // Tag chips: union of all tags appearing in the current result, sorted by frequency.
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of songs) for (const t of (s.tags || [])) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 12);
  }, [songs]);

  const filtered = useMemo(() => {
    let out = songs;
    if (q.trim()) out = out.filter((s) => matches(q, s.title, s.artist));
    if (activeTags.length > 0) out = out.filter((s) => activeTags.every((t) => (s.tags || []).includes(t)));
    return out;
  }, [songs, activeTags, q]);

  const toggleTag = (tag: string) => {
    setActiveTags((cur) => cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
  };

  const showHero = !q && activeTags.length === 0 && sort === 'newest';

  const toggleLike = async (s: Song) => {
    if (!signedIn) { onRequireSignIn('Sign in to save songs.'); return; }
    const isLiked = likedIds.has(s.id);
    setLikedIds((set) => { const next = new Set(set); if (isLiked) next.delete(s.id); else next.add(s.id); return next; });
    try {
      if (isLiked) await unlikeSong(s.id); else await likeSong(s.id);
      onToast(isLiked ? 'Removed from library' : 'Saved to library');
    } catch (e: any) {
      onToast(`Save failed: ${e.message}`);
      setLikedIds((set) => { const next = new Set(set); if (isLiked) next.add(s.id); else next.delete(s.id); return next; });
    }
  };

  if (!cloudEnabled) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Cloud catalog isn't connected</h2>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the dev server.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'library' })}>Go to library</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {showHero && (
        <section className="browse-hero">
          <div className="browse-hero-eyebrow">GoChords · Catalog</div>
          <h1>Find your next song.</h1>
          <p>Browse public chord sheets shared by the community. Save favourites, fork to edit, drop into a playlist.</p>
        </section>
      )}

      {!showHero && (
        <div className="page-header">
          <div>
            <h1>Catalog</h1>
            <p className="page-sub">Public songs shared by the community.</p>
          </div>
          <div className="page-header-actions">
            <button className="primary-btn" onClick={onImport}>
              <Icon name="plusCircle" size={16} /> Add a song
            </button>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="star" size={16} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or artist…"
          />
          {q && (
            <button className="filter-clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <div className="filter-sort">
          <span className="filter-sort-label">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="filter-chips">
          {activeTags.length > 0 && (
            <button className="chip chip-clear" onClick={() => setActiveTags([])}>
              <Icon name="close" size={12} /> Clear
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`chip ${activeTags.includes(tag) ? 'chip-active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {err && <div className="list-error">Could not load catalog: {err}</div>}

      {showHero && trending.length > 0 && !loading && (
        <>
          <h2 className="section-h">
            Trending <span className="section-h-sub">most saved</span>
          </h2>
          <div className="grid">
            {trending.map((cs) => {
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
        </>
      )}

      <h2 className="section-h">
        {q || activeTags.length > 0 ? 'Results' : 'All songs'}
        <span className="section-h-sub">{filtered.length} song{filtered.length === 1 ? '' : 's'}</span>
      </h2>

      {loading && <SkeletonGrid count={8} />}

      {!loading && filtered.length === 0 && (
        <div className="page-empty">
          <h3>{q || activeTags.length > 0 ? 'No matches' : 'Catalog is empty'}</h3>
          <p>{q || activeTags.length > 0 ? 'Try a different search or remove a filter.' : 'Be the first to add a song everyone can play.'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid">
          {filtered.map((cs) => {
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
