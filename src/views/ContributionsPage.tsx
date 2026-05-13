import { useEffect, useMemo, useState } from 'react';
import { fetchMyLibrary, type CloudSong } from '../lib/cloudSongs';
import { cloudEnabled } from '../lib/supabase';
import { navigate, routeHref } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

type SortKey = 'updated' | 'plays' | 'saves' | 'title';

export function ContributionsPage({ signedIn, onSignInClick }: Props) {
  const [mine, setMine] = useState<CloudSong[]>([]);
  const [loading, setLoading] = useState(signedIn && cloudEnabled);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('updated');

  useEffect(() => {
    if (!signedIn || !cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchMyLibrary()
      .then((rows) => { if (!cancelled) { setMine(rows); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn]);

  const stats = useMemo(() => {
    const total = mine.length;
    const published = mine.filter((s) => s.visibility === 'public').length;
    const drafts = total - published;
    const saves = mine.reduce((acc, s) => acc + (s.likeCount ?? 0), 0);
    const plays = mine.reduce((acc, s) => acc + (s.playCount ?? 0), 0);
    return { total, published, drafts, saves, plays };
  }, [mine]);

  const sorted = useMemo(() => {
    const arr = [...mine];
    switch (sort) {
      case 'plays': arr.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)); break;
      case 'saves': arr.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0)); break;
      case 'title': arr.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'updated':
      default: arr.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return arr;
  }, [mine, sort]);

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Sign in to see your contributions</h2>
          <p>Once signed in, this page tracks songs you've added and the love they've received.</p>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My contributions</h1>
          <p className="page-sub">Songs you've added or edited and how the community has engaged.</p>
        </div>
      </div>

      <div className="stats-row">
        <Stat label="Songs" value={stats.total} />
        <Stat label="Public" value={stats.published} />
        <Stat label="Drafts" value={stats.drafts} />
        <Stat label="Saves" value={stats.saves} />
        <Stat label="Plays" value={stats.plays} />
      </div>

      {err && <div className="list-error">{err}</div>}
      {loading && <div className="page-empty">Loading…</div>}

      {!loading && mine.length === 0 && (
        <div className="page-empty">
          <h3>No contributions yet</h3>
          <p>Add a song and it'll show up here.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'import' })}>Add a song</button>
        </div>
      )}

      {!loading && mine.length > 0 && (
        <>
          <div className="contrib-toolbar">
            <span className="contrib-toolbar-label">Sort</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="updated">Recently updated</option>
              <option value="plays">Most plays</option>
              <option value="saves">Most saves</option>
              <option value="title">Title (A → Z)</option>
            </select>
          </div>
          <div className="contrib-list" role="list">
            {sorted.map((s) => (
              <a
                key={s.id}
                className="contrib-row"
                role="listitem"
                href={routeHref({ name: 'song', id: s.id })}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  navigate({ name: 'song', id: s.id });
                }}
              >
                <div className="contrib-row-main">
                  <div className="contrib-row-title">{s.title}</div>
                  <div className="contrib-row-artist">{s.artist || 'Unknown artist'}</div>
                </div>
                <div className="contrib-row-stats" aria-label="Stats">
                  <Stat3 icon="play" value={s.playCount ?? 0} title="Plays" />
                  <Stat3 icon="heart" value={s.likeCount ?? 0} title="Saves" />
                </div>
                <div className="contrib-row-pills">
                  {s.visibility === 'public' ? (
                    <span className="key-pill key-pill-inst">Public</span>
                  ) : (
                    <span className="key-pill">Draft</span>
                  )}
                  <span className="contrib-row-updated">{shortDate(s.updatedAt)}</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Stat3({ icon, value, title }: { icon: 'play' | 'heart'; value: number; title: string }) {
  return (
    <span className="contrib-stat" title={title}>
      <Icon name={icon} size={13} />
      <span>{value}</span>
    </span>
  );
}

function shortDate(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString();
}
