import { useEffect, useState } from 'react';
import { fetchFollowing, type Profile } from '../lib/profile';
import { fetchPublicSongsByOwner, type CloudSong } from '../lib/cloudSongs';
import { cloudEnabled } from '../lib/supabase';
import { navigate, routeHref } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
}

interface FollowedRow {
  profile: Profile;
  songs: CloudSong[];
}

export function FollowingPage({ signedIn, onSignInClick }: Props) {
  const [rows, setRows] = useState<FollowedRow[]>([]);
  const [loading, setLoading] = useState(signedIn && cloudEnabled);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !cloudEnabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchFollowing()
      .then(async (profiles) => {
        const populated = await Promise.all(
          profiles.map(async (p) => ({
            profile: p,
            songs: (await fetchPublicSongsByOwner(p.id)).slice(0, 4),
          })),
        );
        if (!cancelled) { setRows(populated); setLoading(false); }
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Sign in to follow other users</h2>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Following</h1>
          <p className="page-sub">Users you follow and their latest songs.</p>
        </div>
      </div>

      {err && <div className="list-error">{err}</div>}
      {loading && <div className="page-empty">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="page-empty">
          <h3>Not following anyone yet</h3>
          <p>Open any user's profile (click "Added by" on a song) and hit Follow.</p>
          <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Browse catalog</button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="following-list">
          {rows.map(({ profile, songs }) => (
            <section key={profile.id} className="following-card">
              <a
                className="following-card-head"
                href={routeHref({ name: 'user', handle: profile.handle ?? profile.id })}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  navigate({ name: 'user', handle: profile.handle ?? profile.id });
                }}
              >
                <div className="following-avatar">{(profile.displayName ?? profile.handle ?? '?').trim()[0]?.toUpperCase()}</div>
                <div>
                  <div className="following-name">{profile.displayName ?? `@${profile.handle ?? 'user'}`}</div>
                  {profile.handle && <div className="following-handle">@{profile.handle}</div>}
                </div>
              </a>
              {songs.length === 0 ? (
                <div className="following-empty">No public songs yet.</div>
              ) : (
                <ul className="following-songs">
                  {songs.map((s) => (
                    <li key={s.id}>
                      <a
                        href={routeHref({ name: 'song', id: s.id })}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                          e.preventDefault();
                          navigate({ name: 'song', id: s.id });
                        }}
                      >
                        <Icon name="play" size={12} />
                        <span className="following-song-title">{s.title}</span>
                        <span className="following-song-artist">{s.artist}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
