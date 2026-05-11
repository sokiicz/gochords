import { useEffect, useState } from 'react';
import {
  createCommunity, joinCommunityByCode, joinPublicCommunity,
  listMyCommunities, listListedCommunities,
  VISIBILITY_LABEL,
  type Community, type CommunityVisibility,
} from '../lib/communities';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';

interface Props {
  signedIn: boolean;
  onSignInClick: () => void;
}

interface VisOption {
  id: CommunityVisibility;
  joinLabel: string;
  contributeLabel: string;
  tagline: string;
}

const VIS_OPTIONS: VisOption[] = [
  {
    id: 'private',
    joinLabel: 'Invite-only',
    contributeLabel: 'Any member can add songs',
    tagline: 'Hidden from the directory. Friends join by invite link. Inside, every member can add songs and create playlists.',
  },
  {
    id: 'listed',
    joinLabel: 'Invite-only',
    contributeLabel: 'Any member can add songs',
    tagline: 'Listed in the directory so people see it exists. Songs and members are hidden until you join with an invite link.',
  },
  {
    id: 'public',
    joinLabel: 'Anyone can join',
    contributeLabel: 'Members add songs',
    tagline: 'Anyone can browse the songs and members. Joining lets you add songs and playlists yourself.',
  },
  {
    id: 'open',
    joinLabel: 'Anyone can join',
    contributeLabel: 'Anyone signed in can add',
    tagline: 'A full jam room — any signed-in user can drop a song in, no membership required.',
  },
];

export function CommunitiesPage({ signedIn, onSignInClick }: Props) {
  const [pub, setPub] = useState<Community[]>([]);
  const [mine, setMine] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftVis, setDraftVis] = useState<CommunityVisibility>('private');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([listListedCommunities(), signedIn ? listMyCommunities() : Promise.resolve([])])
      .then(([p, m]) => { setPub(p); setMine(m); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };

  useEffect(load, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const c = await createCommunity({ name, visibility: draftVis });
      setMine((m) => [c, ...m]);
      setDraftName('');
      setDraftVis('private');
      setCreating(false);
      navigate({ name: 'community', slug: c.slug });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const c = await joinCommunityByCode(code);
      setJoinCode('');
      navigate({ name: 'community', slug: c.slug });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinPublic = async (c: Community) => {
    if (!signedIn) { onSignInClick(); return; }
    try {
      await joinPublicCommunity(c.id);
      setMine((m) => [c, ...m]);
      navigate({ name: 'community', slug: c.slug });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const myIds = new Set(mine.map((c) => c.id));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Communities</h1>
          <p className="page-sub">From private friend circles to fully open jam rooms.</p>
        </div>
        <div className="page-header-actions">
          {signedIn && (
            <button className="primary-btn" onClick={() => setCreating(true)}>
              <Icon name="plusCircle" size={16} /> New community
            </button>
          )}
        </div>
      </div>

      {!signedIn && (
        <div className="banner banner-info">
          <span>Browse public communities anonymously. Sign in to join, create, or share songs.</span>
          <button className="primary-btn" onClick={onSignInClick}>Sign in</button>
        </div>
      )}

      {creating && (
        <div className="create-community">
          <h3>New community</h3>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Community name"
            className="big-input"
          />
          <fieldset className="vis-options">
            <legend>Visibility</legend>
            {VIS_OPTIONS.map((opt) => (
              <label key={opt.id} className={`vis-option ${draftVis === opt.id ? 'vis-option-on' : ''}`}>
                <input
                  type="radio"
                  name="vis"
                  value={opt.id}
                  checked={draftVis === opt.id}
                  onChange={() => setDraftVis(opt.id)}
                />
                <div className="vis-option-text">
                  <div className="vis-option-head">
                    <strong>{VISIBILITY_LABEL[opt.id]}</strong>
                    <span className={`card-pill card-vis-${opt.id}`}>{opt.joinLabel}</span>
                    <span className="card-pill">{opt.contributeLabel}</span>
                  </div>
                  <small>{opt.tagline}</small>
                </div>
              </label>
            ))}
          </fieldset>
          <div className="create-community-footer">
            <button className="ghost-btn" onClick={() => setCreating(false)}>Cancel</button>
            <button className="primary-btn" onClick={handleCreate} disabled={!draftName.trim() || busy}>Create</button>
          </div>
        </div>
      )}

      {signedIn && (
        <div className="banner banner-info" style={{ background: 'transparent', border: '1px dashed var(--border)' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Have an invite code?</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABC123"
            style={{ width: 130, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          />
          <button className="ghost-btn" onClick={handleJoinByCode} disabled={!joinCode.trim() || busy}>Join</button>
        </div>
      )}

      {err && <div className="list-error">{err}</div>}
      {loading && <div className="list-empty">Loading…</div>}

      {mine.length > 0 && (
        <>
          <h2 className="section-h">Your communities</h2>
          <div className="grid">
            {mine.map((c) => <CommunityCard key={c.id} community={c} joined />)}
          </div>
        </>
      )}

      <h2 className="section-h">Discover</h2>
      <div className="grid">
        {pub.length === 0 && !loading && <div className="list-empty">No public communities yet. Be the first to create one.</div>}
        {pub.map((c) => (
          <CommunityCard
            key={c.id}
            community={c}
            joined={myIds.has(c.id)}
            onJoin={(c.visibility === 'public' || c.visibility === 'open')
              ? (signedIn ? () => handleJoinPublic(c) : onSignInClick)
              : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function CommunityCard({ community, joined, onJoin }: { community: Community; joined: boolean; onJoin?: () => void }) {
  const visClass = `card-pill card-vis-${community.visibility}`;
  return (
    <article className="card" onClick={() => navigate({ name: 'community', slug: community.slug })}>
      <div className="card-title">{community.name}</div>
      <div className="card-artist">{community.description || '—'}</div>
      <div className="card-foot">
        <span className={visClass}>{VISIBILITY_LABEL[community.visibility]}</span>
        {joined && <span className="card-pill" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>Joined</span>}
        {!joined && onJoin && (
          <button
            className="ghost-btn"
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12 }}
            onClick={(e) => { e.stopPropagation(); onJoin(); }}
          >
            Join
          </button>
        )}
      </div>
    </article>
  );
}
