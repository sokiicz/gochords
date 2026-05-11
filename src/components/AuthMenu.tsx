import { useState } from 'react';
import { signInWithEmail, signInWithGoogle, signOut, useAuth } from '../lib/auth';
import { Icon } from './Icon';

interface AuthMenuProps {
  /** Called when an unauthenticated user clicks "Sign in". App owns the modal so it can render above every stacking context. */
  onSignInRequest: () => void;
}

export function AuthMenu({ onSignInRequest }: AuthMenuProps) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (auth.status === 'unavailable') return null;

  if (auth.status === 'signed-in' && auth.user) {
    const name = auth.user.user_metadata.full_name || auth.user.email?.split('@')[0] || 'You';
    return (
      <div className="auth-rail">
        <button className="auth-rail-btn" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
          <span className="avatar-initial avatar-initial-sm">{name[0]?.toUpperCase()}</span>
          <span className="auth-rail-name">{name}</span>
          <span className="auth-rail-chev">▾</span>
        </button>
        {open && (
          <div className="auth-dropdown" onMouseLeave={() => setOpen(false)}>
            <div className="auth-name">{name}</div>
            <div className="auth-email">{auth.user.email}</div>
            <hr />
            <button className="auth-row danger" onClick={() => { setOpen(false); signOut(); }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button className="auth-rail-signin" onClick={onSignInRequest}>
      <Icon name="users" size={14} />
      <span>Sign in</span>
    </button>
  );
}

interface SignInModalProps {
  onClose: () => void;
  reason?: string;
}

import { createPortal } from 'react-dom';

export function SignInModal({ onClose, reason }: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setBusy(false);
      const message = e?.message || String(e);
      setErr(`Google sign-in failed: ${message}`);
      setShowHelp(true);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="signin-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="signin-header">
          <h2>Sign in</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {reason && <p className="signin-reason">{reason}</p>}

        {sent ? (
          <div className="signin-sent">
            <strong>Check your email.</strong>
            <p>We sent a magic link to <code>{email}</code>. Click it to sign in.</p>
          </div>
        ) : (
          <>
            <button className="primary-btn signin-google" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </button>
            <div className="signin-divider"><span>or</span></div>
            <form onSubmit={handleEmail}>
              <label className="signin-email-label">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  disabled={busy}
                />
              </label>
              <button className="ghost-btn signin-email-btn" type="submit" disabled={busy || !email.trim()}>
                Email me a sign-in link
              </button>
            </form>
            {err && <p className="signin-error">{err}</p>}
            <button type="button" className="text-btn signin-help-toggle" onClick={() => setShowHelp((v) => !v)}>
              {showHelp ? 'Hide setup help' : 'Google sign-in not working?'}
            </button>
            {showHelp && <GoogleSetupHelp />}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function GoogleSetupHelp() {
  const redirect = window.location.origin + window.location.pathname;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return (
    <div className="signin-help">
      <p><strong>Google OAuth needs a one-time setup in Supabase + Google Cloud Console.</strong></p>
      <ol>
        <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console → Credentials</a> → create an <em>OAuth 2.0 Client ID</em> (type: Web application).</li>
        <li>Add this <strong>Authorized redirect URI</strong> exactly:<br /><code>{supabaseUrl}/auth/v1/callback</code></li>
        <li>Copy the Client ID + Secret.</li>
        <li>In Supabase Dashboard → <em>Authentication → Providers → Google</em>: enable, paste Client ID + Secret, save.</li>
        <li>In Supabase Dashboard → <em>Authentication → URL Configuration</em>: add <code>{redirect}</code> to <strong>Redirect URLs</strong> and set Site URL.</li>
        <li>Try again. The magic-link option above always works without OAuth setup.</li>
      </ol>
    </div>
  );
}
