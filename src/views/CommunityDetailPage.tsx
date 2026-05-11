import { useEffect, useState } from 'react';
import {
  fetchCommunity, listCommunityMembers, listCommunitySongs,
  joinPublicCommunity, leaveCommunity, removeSongFromCommunity,
  VISIBILITY_DESC, VISIBILITY_LABEL,
  type Community, type CommunityMember,
} from '../lib/communities';
import { listCommunityPlaylists, createPlaylist, type Playlist } from '../lib/playlists';
import type { CloudSong } from '../lib/cloudSongs';
import { fromCloud } from '../lib/songModel';
import { navigate, navigateBack } from '../lib/router';
import { Icon } from '../components/Icon';
import { AddSongsToCommunityModal } from '../components/AddSongsToCommunityModal';

interface Props {
  slug: string;
  signedIn: boolean;
  userId: string | null;
  onSignInClick: () => void;
  onToast: (msg: string) => void;
}

type Tab = 'songs' | 'playlists' | 'members';

export function CommunityDetailPage({ slug, signedIn, userId, onSignInClick, onToast }: Props) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [songs, setSongs] = useState<CloudSong[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('songs');
  const [creatingPl, setCreatingPl] = useState(false);
  const [draftPlName, setDraftPlName] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    setLoading(true);
    fetchCommunity(slug)
      .then(async (c) => {
        if (!c) throw new Error('Not found');
        setCommunity(c);
        const [s, p, m] = await Promise.all([
          listCommunitySongs(c.id).catch(() => []),
          listCommunityPlaylists(c.id).catch(() => []),
          listCommunityMembers(c.id).catch(() => []),
        ]);
        setSongs(s); setPlaylists(p); setMembers(m);
        setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };

  useEffect(load, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMember = !!members.find((m) => m.userId === userId);
  const isOwner = community?.ownerId === userId;
  const canViewContent = community
    ? community.visibility === 'public' || community.visibility === 'open' || isMember
    : false;
  const canAddContent = community
    ? community.visibility === 'open' || isMember
    : false;

  const handleJoin = async () => {
    if (!signedIn) { onSignInClick(); return; }
    if (!community) return;
    try {
      await joinPublicCommunity(community.id);
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const handleLeave = async () => {
    if (!community) return;
    if (!confirm(`Leave "${community.name}"?`)) return;
    try {
      await leaveCommunity(community.id);
      navigate({ name: 'communities' });
    } catch (e: any) { setErr(e.message); }
  };

  const handleCreatePlaylist = async () => {
    if (!community || !draftPlName.trim()) return;
    const pl = await createPlaylist({ name: draftPlName.trim(), communityId: community.id, isPublic: true });
    setPlaylists((p) => [pl, ...p]);
    setDraftPlName('');
    setCreatingPl(false);
    navigate({ name: 'playlist', id: pl.id });
  };

  const handleRemoveSong = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (!community) return;
    if (!confirm('Remove this song from the community?')) return;
    await removeSongFromCommunity(community.id, songId);
    setSongs((s) => s.filter((x) => x.id !== songId));
  };

  if (loading) return <div className="page page-narrow"><div className="page-empty"><h2>Loading…</h2></div></div>;
  if (err || !community) return <div className="page page-narrow"><div className="page-empty"><h2>Community not found</h2><p>{err}</p></div></div>;

  const inviteUrl = community.inviteCode ? `${window.location.origin}${window.location.pathname}#/join/${community.inviteCode}` : null;
  const joinable = (community.visibility === 'public' || community.visibility === 'open') && !isMember;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="ghost-btn back-btn" onClick={() => navigateBack({ name: 'communities' })}>← Back</button>
          <h1>{community.name}</h1>
          <p className="page-sub">
            <span className={`card-pill card-vis-${community.visibility}`} style={{ marginRight: 8 }}>{VISIBILITY_LABEL[community.visibility]}</span>
            {community.description || VISIBILITY_DESC[community.visibility]}
          </p>
        </div>
        <div className="page-header-actions">
          {joinable && <button className="primary-btn" onClick={handleJoin}>Join</button>}
          {isMember && !isOwner && <button className="ghost-btn" onClick={handleLeave}>Leave</button>}
        </div>
      </div>

      {inviteUrl && isMember && (
        <div className="banner banner-info">
          <span>Invite link:</span>
          <code style={{ flex: 1, background: 'var(--bg-elev)', padding: '6px 10px', borderRadius: 6, fontSize: 12, overflow: 'auto' }}>{inviteUrl}</code>
          <button className="ghost-btn" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copy</button>
        </div>
      )}

      {!canViewContent && (
        <div className="page-empty">
          <h3>This community's content is private</h3>
          <p>{community.visibility === 'listed'
            ? 'You can see it exists, but songs and playlists are members-only.'
            : 'Members only.'}
          </p>
          {community.inviteCode == null && community.visibility === 'listed' && (
            <p style={{ color: 'var(--text-dim)' }}>Ask the owner for an invite code.</p>
          )}
        </div>
      )}

      {canViewContent && (
        <>
          <nav className="tab-row">
            <button className={`tab ${tab === 'songs' ? 'tab-active' : ''}`} onClick={() => setTab('songs')}>Songs ({songs.length})</button>
            <button className={`tab ${tab === 'playlists' ? 'tab-active' : ''}`} onClick={() => setTab('playlists')}>Playlists ({playlists.length})</button>
            <button className={`tab ${tab === 'members' ? 'tab-active' : ''}`} onClick={() => setTab('members')}>Members ({members.length})</button>
          </nav>

          {tab === 'songs' && (
            <>
              {canAddContent && (
                <div className="banner" style={{ background: 'transparent', border: '1px dashed var(--border-strong)' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                    Pick songs from your library or add whole playlists at once.
                  </span>
                  <button className="primary-btn" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
                    <Icon name="plusCircle" size={14} /> Add songs
                  </button>
                </div>
              )}
              {songs.length === 0 ? (
                <div className="page-empty">
                  <h3>No songs here yet</h3>
                  <p>{canAddContent
                    ? 'Use "Add songs" above, or open a single song and ••• → Share to community.'
                    : 'Members can add songs from their library or playlists.'}</p>
                </div>
              ) : (
                <div className="grid">
                  {songs.map((cs) => {
                    const song = fromCloud(cs);
                    return (
                      <article key={song.id} className="card" onClick={() => navigate({ name: 'song', id: song.id })}>
                        {canAddContent && (
                          <button className="card-delete" onClick={(e) => handleRemoveSong(e, song.id)} aria-label="Remove">
                            <Icon name="close" size={14} />
                          </button>
                        )}
                        <div className="card-title">{song.title}</div>
                        <div className="card-artist">{song.artist || 'Unknown'}</div>
                        <div className="card-foot">
                          {song.originalKey && <span className="card-pill card-pill-key">{song.originalKey}</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'playlists' && (
            <>
              {canAddContent && !creatingPl && (
                <button className="ghost-btn" onClick={() => setCreatingPl(true)} style={{ marginBottom: 16 }}>
                  <Icon name="plusCircle" size={14} /> New community playlist
                </button>
              )}
              {creatingPl && (
                <div className="banner banner-info">
                  <input
                    autoFocus
                    value={draftPlName}
                    onChange={(e) => setDraftPlName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlaylist(); if (e.key === 'Escape') setCreatingPl(false); }}
                    placeholder="Playlist name"
                    style={{ flex: 1, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)' }}
                  />
                  <button className="ghost-btn" onClick={() => setCreatingPl(false)}>Cancel</button>
                  <button className="primary-btn" onClick={handleCreatePlaylist} disabled={!draftPlName.trim()}>Create</button>
                </div>
              )}
              {playlists.length === 0 ? (
                <div className="page-empty">
                  <h3>No playlists yet</h3>
                  <p>Members can create shared setlists.</p>
                </div>
              ) : (
                <div className="grid">
                  {playlists.map((pl) => (
                    <article key={pl.id} className="card" onClick={() => navigate({ name: 'playlist', id: pl.id })}>
                      <div className="card-title">{pl.name}</div>
                      <div className="card-artist">{pl.description || 'Community playlist'}</div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'members' && (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.userId} className="member-row">
                  <span className="member-avatar">{(m.displayName?.[0] || '?').toUpperCase()}</span>
                  <span className="member-name">{m.displayName || m.userId.slice(0, 8)}</span>
                  <span className="member-role">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {community && (
        <AddSongsToCommunityModal
          open={addOpen}
          communityId={community.id}
          communityName={community.name}
          existingIds={new Set(songs.map((s) => s.id))}
          onClose={() => setAddOpen(false)}
          onDone={(msg) => { onToast(msg); setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}
