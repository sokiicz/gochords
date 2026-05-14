import { useEffect, useState } from 'react';
import { fetchUpdates, type UpdateEvent } from '../lib/profile';
import { cloudEnabled } from '../lib/supabase';
import { navigate, routeHref } from '../lib/router';
import { Icon } from '../components/Icon';
import { markUpdatesSeen } from '../lib/notifications';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
}

export function UpdatesPage({ signedIn, onSignInClick }: Props) {
  const [events, setEvents] = useState<UpdateEvent[]>([]);
  const [loading, setLoading] = useState(signedIn && cloudEnabled);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchUpdates()
      .then((e) => {
        if (cancelled) return;
        setEvents(e);
        setLoading(false);
        // Mark seen after we have the latest list so the badge clears immediately.
        markUpdatesSeen();
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Sign in to see updates</h2>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Updates</h1>
          <p className="page-sub">Activity on your songs and from people you follow.</p>
        </div>
      </div>

      {err && <div className="list-error">{err}</div>}
      {loading && <div className="page-empty">Loading…</div>}

      {!loading && events.length === 0 && (
        <div className="page-empty">
          <h3>No activity yet</h3>
          <p>Saves on your songs, new followers, and new uploads from people you follow show up here.</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <ul className="updates-list">
          {events.map((e, i) => (
            <li key={i} className="updates-row">
              <UpdateRow event={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpdateRow({ event }: { event: UpdateEvent }) {
  const actor = event.actor;
  const actorTarget = actor ? { name: 'user' as const, handle: actor.handle ?? actor.id } : null;
  const actorName = actor?.displayName ?? (actor?.handle ? `@${actor.handle}` : 'Someone');

  const goActor = (e: React.MouseEvent) => {
    if (!actorTarget) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    navigate(actorTarget);
  };
  const goSong = (e: React.MouseEvent) => {
    if (!event.song) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    navigate({ name: 'song', id: event.song.id });
  };

  return (
    <div className="updates-card">
      <Icon name={event.kind === 'new_follower' ? 'users' : event.kind === 'like_on_my_song' ? 'heart' : 'plusCircle'} size={16} />
      <div className="updates-text">
        {event.kind === 'like_on_my_song' && (
          <>
            {actorTarget ? <a href={routeHref(actorTarget)} onClick={goActor}><strong>{actorName}</strong></a> : <strong>{actorName}</strong>}
            {' saved '}
            {event.song && <a href={routeHref({ name: 'song', id: event.song.id })} onClick={goSong}><strong>{event.song.title}</strong></a>}
          </>
        )}
        {event.kind === 'new_follower' && (
          <>
            {actorTarget ? <a href={routeHref(actorTarget)} onClick={goActor}><strong>{actorName}</strong></a> : <strong>{actorName}</strong>}
            {' started following you'}
          </>
        )}
        {event.kind === 'song_from_followed' && (
          <>
            {actorTarget ? <a href={routeHref(actorTarget)} onClick={goActor}><strong>{actorName}</strong></a> : <strong>{actorName}</strong>}
            {' added '}
            {event.song && <a href={routeHref({ name: 'song', id: event.song.id })} onClick={goSong}><strong>{event.song.title}</strong></a>}
            {event.song?.artist ? ` — ${event.song.artist}` : ''}
          </>
        )}
      </div>
      <span className="updates-time" title={new Date(event.at).toLocaleString()}>{shortAgo(event.at)}</span>
    </div>
  );
}

function shortAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString();
}
