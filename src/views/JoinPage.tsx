import { useEffect, useState } from 'react';
import { joinCommunityByCode } from '../lib/communities';
import { navigate } from '../lib/router';

interface Props {
  code: string;
  signedIn: boolean;
  onSignInClick: (reason: string) => void;
}

export function JoinPage({ code, signedIn, onSignInClick }: Props) {
  const [status, setStatus] = useState<'idle' | 'joining' | 'failed'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) { onSignInClick('Sign in to join this community.'); return; }
    setStatus('joining');
    joinCommunityByCode(code)
      .then((c) => navigate({ name: 'community', slug: c.slug }))
      .catch((e) => { setErr(e.message); setStatus('failed'); });
  }, [signedIn, code, onSignInClick]);

  return (
    <div className="page page-narrow">
      <div className="page-empty">
        {!signedIn && (
          <>
            <h2>Sign in to join</h2>
            <p>This invite is for a private community.</p>
            <button className="primary-btn" onClick={() => onSignInClick('Sign in to join this community.')}>Sign in</button>
          </>
        )}
        {status === 'joining' && <h2>Joining…</h2>}
        {status === 'failed' && (
          <>
            <h2>Couldn't join</h2>
            <p>{err}</p>
            <button className="primary-btn" onClick={() => navigate({ name: 'communities' })}>Browse communities</button>
          </>
        )}
      </div>
    </div>
  );
}
