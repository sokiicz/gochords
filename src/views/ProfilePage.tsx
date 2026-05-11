import { useEffect, useState } from 'react';
import { fetchMyProfile, updateMyProfile, type Profile } from '../lib/profile';
import { signOut } from '../lib/auth';
import { navigate, navigateBack } from '../lib/router';

interface Props {
  signedIn: boolean;
  email: string | null;
  onSignInClick: () => void;
  onToast: (msg: string) => void;
}

export function ProfilePage({ signedIn, email, onSignInClick, onToast }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setLoading(true);
    fetchMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p?.displayName ?? '');
        setHandle(p?.handle ?? '');
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="page page-narrow">
        <div className="page-empty">
          <h2>Profile</h2>
          <p>Sign in to view and edit your profile.</p>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      </div>
    );
  }

  const dirty = (profile?.displayName ?? '') !== displayName || (profile?.handle ?? '') !== handle;
  const initial = (displayName || email || '?').trim()[0]?.toUpperCase() ?? '?';

  const handleSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = await updateMyProfile({ displayName, handle });
      setProfile(next);
      onToast('Profile saved');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ name: 'browse' });
  };

  return (
    <div className="page page-narrow">
      <div className="form-page-header">
        <button className="ghost-btn back-btn" onClick={() => navigateBack({ name: 'browse' })}>← Back</button>
        <h1>Profile</h1>
      </div>

      {loading && <div className="list-empty">Loading…</div>}

      {!loading && (
        <div className="profile-card">
          <div className="profile-head">
            <div className="profile-avatar">{initial}</div>
            <div className="profile-head-info">
              <div className="profile-email">{email || '—'}</div>
              <div className="profile-hint">Signed in via Supabase</div>
            </div>
          </div>

          <div className="form-fields">
            <label>
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                maxLength={64}
              />
            </label>
            <label>
              <span>Handle <em className="hint-em">(unique, for sharing)</em></span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="e.g. tomas-z"
                maxLength={32}
              />
            </label>

            {err && <div className="signin-error">{err}</div>}

            <div className="profile-actions">
              <button className="ghost-btn danger" onClick={handleSignOut}>Sign out</button>
              <span style={{ flex: 1 }} />
              <button className="primary-btn" onClick={handleSave} disabled={!dirty || busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
