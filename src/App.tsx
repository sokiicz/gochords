import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Instrument } from './lib/chords';
import {
  loadSongs, saveSongs, loadPrefs, savePrefs, newId,
  deleteSongState,
  type StoredSong,
} from './lib/storage';
import {
  insertSong, updateSong, deleteSong, fetchSong,
} from './lib/cloudSongs';
import { fetchMyLikedSongIds, likeSong, unlikeSong } from './lib/likes';
import { fromCloud, fromLocal, type Song } from './lib/songModel';
import { cloudEnabled } from './lib/supabase';
import { useAuth } from './lib/auth';
import { detectLanguage, mergeLanguageTag } from './lib/language';
import { useMyProfile } from './lib/profile';
import { navigate, useHashRoute } from './lib/router';
import { NavSidebar } from './components/NavSidebar';
import { Toasts, type Toast } from './components/Toasts';
import { SignInModal } from './components/AuthMenu';
import { Icon } from './components/Icon';

// BrowsePage is eager — it's the default route + most-common landing.
// Everything else is route-level code-split. Vite resolves each `import('./views/X')`
// into its own JS chunk; first paint downloads only what the current route needs.
import { BrowsePage } from './views/BrowsePage';
const LibraryPage         = lazy(() => import('./views/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const SongPlayerPage      = lazy(() => import('./views/SongPlayerPage').then((m) => ({ default: m.SongPlayerPage })));
const SongFormPage        = lazy(() => import('./views/SongFormPage').then((m) => ({ default: m.SongFormPage })));
const PlaylistsPage       = lazy(() => import('./views/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })));
const PlaylistDetailPage  = lazy(() => import('./views/PlaylistDetailPage').then((m) => ({ default: m.PlaylistDetailPage })));
const CommunitiesPage     = lazy(() => import('./views/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })));
const CommunityDetailPage = lazy(() => import('./views/CommunityDetailPage').then((m) => ({ default: m.CommunityDetailPage })));
const JoinPage            = lazy(() => import('./views/JoinPage').then((m) => ({ default: m.JoinPage })));
const ProfilePage         = lazy(() => import('./views/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ArtistPage          = lazy(() => import('./views/ArtistPage').then((m) => ({ default: m.ArtistPage })));
const ContributionsPage   = lazy(() => import('./views/ContributionsPage').then((m) => ({ default: m.ContributionsPage })));
const UserProfilePage     = lazy(() => import('./views/UserProfilePage').then((m) => ({ default: m.UserProfilePage })));
const FollowingPage       = lazy(() => import('./views/FollowingPage').then((m) => ({ default: m.FollowingPage })));
const UpdatesPage         = lazy(() => import('./views/UpdatesPage').then((m) => ({ default: m.UpdatesPage })));

// Drag SongFormDraft type from the source (lazy import doesn't surface types eagerly).
import type { SongFormDraft } from './views/SongFormPage';

// Route-name → dynamic import factory. Used to *preload* the chunk for the
// current route on mount, so the Suspense fallback never shows on direct deep
// links (e.g. someone landing on a pre-rendered /song/<id>). The browser
// module cache means React.lazy's later import resolves instantly.
const ROUTE_PRELOADS: Record<string, () => Promise<unknown>> = {
  library:        () => import('./views/LibraryPage'),
  song:           () => import('./views/SongPlayerPage'),
  edit:           () => import('./views/SongFormPage'),
  import:         () => import('./views/SongFormPage'),
  playlists:      () => import('./views/PlaylistsPage'),
  playlist:       () => import('./views/PlaylistDetailPage'),
  communities:    () => import('./views/CommunitiesPage'),
  community:      () => import('./views/CommunityDetailPage'),
  join:           () => import('./views/JoinPage'),
  profile:        () => import('./views/ProfilePage'),
  artist:         () => import('./views/ArtistPage'),
  contributions:  () => import('./views/ContributionsPage'),
  user:           () => import('./views/UserProfilePage'),
  following:      () => import('./views/FollowingPage'),
  updates:        () => import('./views/UpdatesPage'),
};

export default function App() {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  const userId = auth.user?.id ?? null;
  const myProfile = useMyProfile(signedIn);
  const isAdmin = myProfile?.role === 'admin';
  const route = useHashRoute();

  // Preload the chunk for the current route as soon as the route name is known.
  // Fire-and-forget; failures are harmless (Suspense fallback covers).
  useEffect(() => { ROUTE_PRELOADS[route.name]?.(); }, [route.name]);

  const [localSongs, setLocalSongs] = useState<StoredSong[]>(() => loadSongs());

  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [darkMode, setDarkMode] = useState(initialPrefs.darkMode);
  const [fontSize, setFontSize] = useState<0 | 1 | 2>(initialPrefs.fontSize);
  const [scrollSpeed, setScrollSpeed] = useState(initialPrefs.scrollSpeed);
  const [instrument, setInstrument] = useState<Instrument>(initialPrefs.instrument);
  const [diagramSize, setDiagramSize] = useState(initialPrefs.diagramSize);
  const [stickyChords, setStickyChords] = useState(initialPrefs.stickyChords);

  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [signInModal, setSignInModal] = useState<{ reason?: string } | null>(null);

  const [routeSong, setRouteSong] = useState<Song | null>(null);
  const [routeSongLoading, setRouteSongLoading] = useState(false);
  const [routeSongErr, setRouteSongErr] = useState<string | null>(null);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => savePrefs({ darkMode, fontSize, scrollSpeed, instrument, diagramSize, stickyChords }), [darkMode, fontSize, scrollSpeed, instrument, diagramSize, stickyChords]);
  useEffect(() => { document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'; }, [darkMode]);
  useEffect(() => { document.documentElement.dataset.fontsize = String(fontSize); }, [fontSize]);

  // Track liked song ids globally so any view can reflect the set.
  useEffect(() => {
    if (!signedIn) { setLikedIds(new Set()); return; }
    fetchMyLikedSongIds().then(setLikedIds).catch(() => {});
  }, [signedIn, libraryRefresh]);

  const pushToast = useCallback((message: string, opts?: { action?: { label: string; run: () => void }; durationMs?: number }) => {
    setToasts((ts) => [...ts, { id: Date.now() + Math.random(), message, ...opts }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const persistLocal = useCallback((next: StoredSong[]) => { setLocalSongs(next); saveSongs(next); }, []);

  const requireAuth = useCallback((reason: string): boolean => {
    if (signedIn || !cloudEnabled) return true;
    setSignInModal({ reason });
    return false;
  }, [signedIn]);

  // Resolve song for `song/:id` and `edit/:id` routes
  useEffect(() => {
    const id = (route.name === 'song' || route.name === 'edit') ? route.id : null;
    if (!id) { setRouteSong(null); setRouteSongErr(null); return; }
    const local = localSongs.find((s) => s.id === id);
    if (local) { setRouteSong(fromLocal(local)); setRouteSongErr(null); return; }
    if (!cloudEnabled) { setRouteSongErr('Song not found.'); return; }
    setRouteSongLoading(true);
    fetchSong(id)
      .then((s) => {
        if (s) { setRouteSong(fromCloud(s)); setRouteSongErr(null); }
        else { setRouteSong(null); setRouteSongErr('Song not found or you don’t have access.'); }
      })
      .catch((e) => { setRouteSong(null); setRouteSongErr(e.message); })
      .finally(() => setRouteSongLoading(false));
  }, [route, localSongs, libraryRefresh]);

  // ============ Song actions ============

  const openImport = useCallback(() => {
    navigate({ name: 'import', from: window.location.hash });
  }, []);
  const openEdit = useCallback((song: Song) => {
    navigate({ name: 'edit', id: song.id });
  }, []);

  const handleFormSubmit = useCallback(async (draft: SongFormDraft) => {
    const tempo = draft.tempo.trim() ? Number(draft.tempo) : null;
    const userTags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const tags = mergeLanguageTag(userTags, detectLanguage(draft.source));
    const isCloud = signedIn && cloudEnabled;

    try {
      if (draft.id) {
        const local = localSongs.find((s) => s.id === draft.id);
        if (local) {
          const next = localSongs.map((s) =>
            s.id === draft.id
              ? { ...s, title: draft.title, artist: draft.artist, originalKey: draft.originalKey || undefined,
                  defaultCapo: draft.defaultCapo, tempo, tags, source: draft.source, updatedAt: Date.now() }
              : s
          );
          persistLocal(next);
          pushToast('Song saved');
          navigate({ name: 'song', id: draft.id });
        } else {
          await updateSong(draft.id, {
            title: draft.title, artist: draft.artist,
            originalKey: draft.originalKey || undefined,
            source: draft.source, visibility: draft.visibility,
            defaultCapo: draft.defaultCapo, tempo, tags,
          });
          setLibraryRefresh((n) => n + 1);
          pushToast('Song saved');
          navigate({ name: 'song', id: draft.id });
        }
      } else if (isCloud) {
        const created = await insertSong({
          title: draft.title, artist: draft.artist,
          originalKey: draft.originalKey || undefined,
          source: draft.source, visibility: draft.visibility,
          defaultCapo: draft.defaultCapo, tempo, tags,
        });
        setLibraryRefresh((n) => n + 1);
        pushToast(draft.visibility === 'public' ? 'Published to catalog' : 'Saved to your library');
        navigate({ name: 'song', id: created.id });
      } else {
        const now = Date.now();
        const song: StoredSong = {
          id: newId(), title: draft.title, artist: draft.artist,
          originalKey: draft.originalKey || undefined,
          defaultCapo: draft.defaultCapo, tempo, tags,
          source: draft.source, createdAt: now, updatedAt: now,
        };
        persistLocal([song, ...localSongs]);
        pushToast('Saved on this device');
        navigate({ name: 'song', id: song.id });
      }
    } catch (e: any) {
      pushToast(`Save failed: ${e.message}`);
    }
  }, [signedIn, localSongs, persistLocal, pushToast]);

  const handleFormDelete = useCallback(async (id: string) => {
    const local = localSongs.find((s) => s.id === id);
    if (local) {
      persistLocal(localSongs.filter((s) => s.id !== id));
      deleteSongState(id);
      pushToast('Song deleted');
      navigate({ name: 'library' });
      return;
    }
    try {
      await deleteSong(id);
      setLibraryRefresh((n) => n + 1);
      pushToast('Song deleted');
      navigate({ name: 'library' });
    } catch (e: any) {
      pushToast(`Delete failed: ${e.message}`);
    }
  }, [localSongs, persistLocal, pushToast]);

  const handleLocalDelete = useCallback((id: string) => {
    persistLocal(localSongs.filter((s) => s.id !== id));
    deleteSongState(id);
    pushToast('Song deleted');
  }, [localSongs, persistLocal, pushToast]);

  const handleFork = useCallback((song: Song) => {
    if (!requireAuth('Sign in to fork this song into your library.')) return;
    (async () => {
      try {
        const forked = await insertSong({
          title: `${song.title} (copy)`, artist: song.artist,
          originalKey: song.originalKey, source: song.source,
          visibility: 'private',
          parentId: song.origin === 'cloud' ? song.id : null,
          defaultCapo: song.defaultCapo, tempo: song.tempo, tags: song.tags,
        });
        setLibraryRefresh((n) => n + 1);
        pushToast('Forked into your library');
        navigate({ name: 'song', id: forked.id });
      } catch (e: any) {
        pushToast(`Fork failed: ${e.message}`);
      }
    })();
  }, [requireAuth, pushToast]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!requireAuth('Sign in to save songs.')) return;
    if (song.origin !== 'cloud') { pushToast('Only cloud songs can be saved.'); return; }
    const wasLiked = likedIds.has(song.id);
    setLikedIds((set) => { const n = new Set(set); if (wasLiked) n.delete(song.id); else n.add(song.id); return n; });
    try {
      if (wasLiked) await unlikeSong(song.id);
      else await likeSong(song.id);
      pushToast(wasLiked ? 'Removed from saved' : 'Saved to library');
    } catch (e: any) {
      // revert
      setLikedIds((set) => { const n = new Set(set); if (wasLiked) n.add(song.id); else n.delete(song.id); return n; });
      pushToast(`Failed: ${e.message}`);
    }
  }, [requireAuth, likedIds, pushToast]);

  // Sync local songs to cloud account
  const handleSync = useCallback(async () => {
    if (!signedIn || !cloudEnabled) return;
    const candidates = localSongs.filter((s) => !s.seeded && !s.syncedAt);
    if (candidates.length === 0) { pushToast('Nothing to sync.'); return; }
    let ok = 0;
    let failed = 0;
    for (const s of candidates) {
      try {
        await insertSong({
          title: s.title, artist: s.artist,
          originalKey: s.originalKey, source: s.source,
          visibility: 'private',
          defaultCapo: s.defaultCapo ?? 0,
          tempo: s.tempo ?? null,
          tags: s.tags ?? [],
        });
        ok++;
      } catch {
        failed++;
      }
    }
    if (ok > 0) {
      const droppedIds = new Set(candidates.slice(0, ok).map((s) => s.id));
      persistLocal(localSongs.filter((s) => !droppedIds.has(s.id)));
      setLibraryRefresh((n) => n + 1);
    }
    pushToast(failed > 0 ? `Synced ${ok}, ${failed} failed` : `Synced ${ok} song${ok === 1 ? '' : 's'} to your account`);
  }, [signedIn, localSongs, persistLocal, pushToast]);

  const requireSignInForActions = useCallback((reason: string) => setSignInModal({ reason }), []);

  // ============ Routing render ============

  let main: JSX.Element;
  switch (route.name) {
    case 'browse':
      main = (
        <BrowsePage
          signedIn={signedIn}
          onImport={() => requireAuth('Sign in to publish to the catalog.') && openImport()}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
        />
      );
      break;
    case 'library':
      main = (
        <LibraryPage
          signedIn={signedIn}
          localSongs={localSongs}
          onImport={openImport}
          onLocalDelete={handleLocalDelete}
          onCloudDeleted={() => setLibraryRefresh((n) => n + 1)}
          onSyncRequest={handleSync}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to sync your library across devices.' })}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
          refreshKey={libraryRefresh}
        />
      );
      break;
    case 'playlists':
      main = (
        <PlaylistsPage
          signedIn={signedIn}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to use playlists.' })}
        />
      );
      break;
    case 'playlist':
      main = <PlaylistDetailPage playlistId={route.id} userId={userId} />;
      break;
    case 'communities':
      main = (
        <CommunitiesPage
          signedIn={signedIn}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to join or create communities.' })}
        />
      );
      break;
    case 'community':
      main = (
        <CommunityDetailPage
          slug={route.slug}
          signedIn={signedIn}
          userId={userId}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to join.' })}
          onToast={pushToast}
        />
      );
      break;
    case 'join':
      main = (
        <JoinPage
          code={route.code}
          signedIn={signedIn}
          onSignInClick={(reason) => setSignInModal({ reason })}
        />
      );
      break;
    case 'artist':
      main = (
        <ArtistPage
          slug={route.slug}
          signedIn={signedIn}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
        />
      );
      break;
    case 'user':
      main = (
        <UserProfilePage
          handle={route.handle}
          signedIn={signedIn}
          userId={userId}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
        />
      );
      break;
    case 'updates':
      main = (
        <UpdatesPage
          signedIn={signedIn}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to see updates.' })}
        />
      );
      break;
    case 'following':
      main = (
        <FollowingPage
          signedIn={signedIn}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to follow other users.' })}
        />
      );
      break;
    case 'contributions':
      main = (
        <ContributionsPage
          signedIn={signedIn}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to see your contributions.' })}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
        />
      );
      break;
    case 'profile':
      main = (
        <ProfilePage
          signedIn={signedIn}
          email={auth.user?.email ?? null}
          onSignInClick={() => setSignInModal({ reason: 'Sign in to access your profile.' })}
          onToast={pushToast}
        />
      );
      break;
    case 'import':
      main = (
        <SongFormPage
          mode="import"
          cloudWritable={signedIn && cloudEnabled}
          onSubmit={handleFormSubmit}
          onCancel={() => navigate({ name: 'browse' })}
        />
      );
      break;
    case 'edit':
      if (routeSongLoading) main = <PageLoading />;
      else if (routeSongErr || !routeSong) main = <PageError message={routeSongErr ?? 'Song not found.'} />;
      else main = (
        <SongFormPage
          mode="edit"
          initial={routeSong}
          cloudWritable={signedIn && cloudEnabled}
          onSubmit={handleFormSubmit}
          onDelete={handleFormDelete}
          onCancel={() => navigate({ name: 'song', id: routeSong.id })}
        />
      );
      break;
    case 'song':
      if (routeSongLoading) main = <PageLoading />;
      else if (routeSongErr || !routeSong) main = <PageError message={routeSongErr ?? 'Song not found.'} />;
      else main = (
        <SongPlayerPage
          song={routeSong}
          signedIn={signedIn}
          userId={userId}
          isAdmin={isAdmin}
          darkMode={darkMode}
          fontSize={fontSize}
          scrollSpeed={scrollSpeed}
          instrument={instrument}
          diagramSize={diagramSize}
          stickyChords={stickyChords}
          onToggleDark={() => setDarkMode((v) => !v)}
          onFontSizeChange={setFontSize}
          onScrollSpeedChange={setScrollSpeed}
          onInstrumentChange={setInstrument}
          onDiagramSizeChange={setDiagramSize}
          onToggleStickyChords={() => setStickyChords((v) => !v)}
          onEdit={openEdit}
          onFork={handleFork}
          liked={likedIds.has(routeSong.id)}
          onToggleLike={() => toggleLike(routeSong)}
          onRequireSignIn={requireSignInForActions}
          onToast={pushToast}
        />
      );
      break;
    default:
      main = <PageError message="Unknown route." />;
  }

  return (
    <div className="app-shell">
      <NavSidebar
        route={route}
        cloudEnabled={cloudEnabled}
        signedIn={signedIn}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onImport={openImport}
        onSignInRequest={() => setSignInModal({})}
      />
      <header className="mobile-topbar" role="banner">
        <button className="mobile-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <a
          className="mobile-brand"
          href="#/browse"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            navigate({ name: 'browse' });
          }}
          aria-label="GoChords home"
        >
          <span className="mobile-brand-mark">♪</span>
          <span className="mobile-brand-text">GoChords</span>
        </a>
      </header>
      <div className="main-area">
        <Suspense fallback={<PageLoading />}>{main}</Suspense>
      </div>
      {signInModal && <SignInModal reason={signInModal.reason} onClose={() => setSignInModal(null)} />}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function PageLoading() { return <div className="page page-narrow"><div className="page-empty"><h2>Loading…</h2></div></div>; }
function PageError({ message }: { message: string }) {
  return (
    <div className="page page-narrow">
      <div className="page-empty">
        <h2>Hmm</h2>
        <p>{message}</p>
        <button className="primary-btn" onClick={() => navigate({ name: 'browse' })}>Back to Catalog</button>
      </div>
    </div>
  );
}
