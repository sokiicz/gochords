import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse, uniqueChords } from '../lib/parser';
import { effectiveKey, effectiveShift, simplifySong, transposeSong } from '../lib/transpose';
import { parseArtists, slugify } from '../lib/search';
import { fetchProfile, type Profile } from '../lib/profile';
import { routeHref, parseHashQuery } from '../lib/router';
import { adaptTabsForInstrument } from '../lib/tabConvert';
import type { Instrument } from '../lib/chords';
import { isEditable, type Song } from '../lib/songModel';
import { chordStats } from '../lib/difficulty';
import type { DiagramSize } from '../lib/storage';
import { fetchSongState, upsertSongState } from '../lib/cloudSongs';
import { loadSongState, saveSongState } from '../lib/storage';
import { fetchPlaylistSongState, type PlaylistSongState } from '../lib/playlists';
import { ControlsBar } from '../components/ControlsBar';
import { ChordSheet } from '../components/ChordSheet';
import { ChordDiagramPopup } from '../components/ChordDiagramPopup';
import { UsedChordsStrip } from '../components/UsedChordsStrip';
import { MetaTags, songMeta } from '../components/MetaTags';
import { Icon } from '../components/Icon';
import { SongActionsMenu } from '../components/SongActionsMenu';
import { useKeyboard } from '../hooks/useKeyboard';

const clampTranspose = (n: number) => Math.max(-11, Math.min(11, n));

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  if (diff < m) return 'just now';
  if (diff < h) return `${Math.floor(diff / m)} min ago`;
  if (diff < d) return `${Math.floor(diff / h)} h ago`;
  if (diff < 30 * d) return `${Math.floor(diff / d)} d ago`;
  return new Date(ts).toLocaleDateString();
}

interface Props {
  song: Song;
  signedIn: boolean;
  userId: string | null;
  darkMode: boolean;
  fontSize: 0 | 1 | 2;
  scrollSpeed: number;
  instrument: Instrument;
  diagramSize: DiagramSize;
  stickyChords: boolean;
  onToggleDark: () => void;
  onFontSizeChange: (v: 0 | 1 | 2) => void;
  onScrollSpeedChange: (v: number) => void;
  onInstrumentChange: (v: Instrument) => void;
  onDiagramSizeChange: (v: DiagramSize) => void;
  onToggleStickyChords: () => void;
  onEdit: (song: Song) => void;
  onFork: (song: Song) => void;
  liked: boolean;
  onToggleLike: () => void;
  onRequireSignIn: (reason: string) => void;
  onToast: (msg: string) => void;
}

export function SongPlayerPage(p: Props) {
  const { song, signedIn, userId } = p;

  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(song.defaultCapo);
  const [simplify, setSimplify] = useState(false);
  const [scrollPlaying, setScrollPlaying] = useState(false);
  const [diagramChord, setDiagramChord] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const carryRef = useRef(0);
  const stateSaveTimer = useRef<number | null>(null);
  const skipNextStateSave = useRef(false);

  const [playlistPreset, setPlaylistPreset] = useState<PlaylistSongState | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);

  // Load per-song state when the song changes. Precedence per PLAN.md:
  // jam > playlist > URL > local > default. URL = `?t&c`, playlist = preset
  // attached to the playlist_songs row identified by `?playlist=<id>`.
  useEffect(() => {
    skipNextStateSave.current = true;
    setScrollPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const qp = parseHashQuery();
    const urlT = qp.has('t') ? clampTranspose(Number(qp.get('t')) || 0) : null;
    const urlC = qp.has('c') ? Math.max(0, Math.min(11, Number(qp.get('c')) || 0)) : null;
    const pid = qp.get('playlist');
    setPlaylistId(pid);

    const apply = (t: number, c: number, simp: boolean, preset: PlaylistSongState | null) => {
      // Playlist preset (if present) overrides URL overrides local.
      const finalT = preset?.transpose ?? urlT ?? t;
      const finalC = preset?.capo ?? urlC ?? c;
      setTranspose(finalT);
      setCapo(finalC);
      setSimplify(simp);
      setPlaylistPreset(preset);
    };

    const localOrDefault = (): { t: number; c: number; simp: boolean } => {
      const s = loadSongState(song.id);
      return { t: s.transpose, c: s.capo ?? song.defaultCapo, simp: s.simplify };
    };

    const presetPromise = pid && song.origin === 'cloud'
      ? fetchPlaylistSongState(pid, song.id).catch(() => null)
      : Promise.resolve(null);

    if (song.origin === 'cloud' && signedIn) {
      Promise.all([fetchSongState(song.id).catch(() => null), presetPromise]).then(([s, preset]) => {
        if (s) apply(s.transpose, s.capo, s.simplify, preset);
        else apply(0, song.defaultCapo, false, preset);
      });
    } else {
      presetPromise.then((preset) => {
        const lod = localOrDefault();
        apply(lod.t, lod.c, lod.simp, preset);
      });
    }
  }, [song.id, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save per-song state (debounced)
  useEffect(() => {
    if (skipNextStateSave.current) { skipNextStateSave.current = false; return; }
    if (stateSaveTimer.current) clearTimeout(stateSaveTimer.current);
    stateSaveTimer.current = window.setTimeout(() => {
      const state = { transpose, capo, simplify };
      if (song.origin === 'cloud' && signedIn) {
        upsertSongState(song.id, state).catch(() => {});
      } else {
        saveSongState(song.id, state);
      }
    }, 300);
  }, [song.id, song.origin, signedIn, transpose, capo, simplify]);

  const parsed = useMemo(() => parse(song.source), [song]);
  const shift = effectiveShift(transpose, capo, song.defaultCapo);
  const displayKey = effectiveKey(song.originalKey, shift);
  const artists = useMemo(() => parseArtists(song.artist), [song.artist]);

  const [ownerProfile, setOwnerProfile] = useState<Profile | null>(null);
  useEffect(() => {
    setOwnerProfile(null);
    if (song.origin === 'cloud' && song.ownerId) {
      fetchProfile(song.ownerId).then(setOwnerProfile).catch(() => {});
    }
  }, [song.id, song.origin, song.ownerId]);
  const displaySong = useMemo(() => {
    let s = transposeSong(parsed, transpose, capo, song.originalKey, song.defaultCapo);
    if (simplify) s = simplifySong(s);
    s = adaptTabsForInstrument(s, p.instrument);
    return s;
  }, [parsed, transpose, capo, simplify, p.instrument, song.originalKey, song.defaultCapo]);
  const usedChords = useMemo(() => uniqueChords(displaySong), [displaySong]);
  const stats = useMemo(() => chordStats(song), [song.source]);

  // Collapse the full controls when the user has scrolled past the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setCollapsed(el.scrollTop > 40);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [song.id]);

  // Auto-scroll loop. Hands control back to the user the moment they touch /
  // wheel / drag the sheet, so manual scrolling always wins — auto-scroll just
  // resumes from the new position after a short idle window.
  const userScrollUntil = useRef(0);
  useEffect(() => {
    if (!scrollPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      carryRef.current = 0;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    // Treat any of these as "user is taking the wheel right now."
    const RESUME_DELAY_MS = 700;
    const markInteracting = () => {
      userScrollUntil.current = performance.now() + RESUME_DELAY_MS;
      carryRef.current = 0;
    };
    el.addEventListener('wheel', markInteracting, { passive: true });
    el.addEventListener('touchstart', markInteracting, { passive: true });
    el.addEventListener('touchmove', markInteracting, { passive: true });
    el.addEventListener('pointerdown', markInteracting);

    let last = performance.now();
    let lastAutoScrollTop = el.scrollTop;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // User moved the scroll behind our back (keyboard, scrollbar drag) — accept it.
      if (Math.abs(el.scrollTop - lastAutoScrollTop) > 1) {
        markInteracting();
        lastAutoScrollTop = el.scrollTop;
      }
      const interacting = now < userScrollUntil.current;
      if (!interacting) {
        const pxPerSec = p.scrollSpeed * 2;
        carryRef.current += pxPerSec * dt;
        const whole = Math.floor(carryRef.current);
        if (whole > 0) {
          el.scrollTop += whole;
          lastAutoScrollTop = el.scrollTop;
          carryRef.current -= whole;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setScrollPlaying(false); return; }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      el.removeEventListener('wheel', markInteracting);
      el.removeEventListener('touchstart', markInteracting);
      el.removeEventListener('touchmove', markInteracting);
      el.removeEventListener('pointerdown', markInteracting);
    };
  }, [scrollPlaying, p.scrollSpeed]);

  const resetAll = useCallback(() => { setTranspose(0); setCapo(song.defaultCapo); setSimplify(false); }, [song.defaultCapo]);

  useKeyboard(
    {
      togglePlay: () => setScrollPlaying((v) => !v),
      transposeUp: () => setTranspose((v) => clampTranspose(v + 1)),
      transposeDown: () => setTranspose((v) => clampTranspose(v - 1)),
      resetAll,
      openImport: () => {},
      openEdit: () => { if (isEditable(song, userId)) p.onEdit(song); },
      capoUp: () => setCapo((v) => Math.min(11, v + 1)),
      capoDown: () => setCapo((v) => Math.max(0, v - 1)),
      toggleSimplify: () => setSimplify((v) => !v),
    },
    diagramChord === null,
  );

  const canReset = transpose !== 0 || capo !== song.defaultCapo || simplify;

  return (
    <div className={'player' + (collapsed ? ' player-collapsed' : '')}>
      <MetaTags {...songMeta(song)} />
      <ControlsBar
        transpose={transpose}
        capo={capo}
        defaultCapo={song.defaultCapo}
        originalKey={song.originalKey}
        fontSize={p.fontSize}
        darkMode={p.darkMode}
        scrollSpeed={p.scrollSpeed}
        scrollPlaying={scrollPlaying}
        instrument={p.instrument}
        diagramSize={p.diagramSize}
        stickyChords={p.stickyChords}
        simplify={simplify}
        onTransposeChange={setTranspose}
        onCapoChange={setCapo}
        onFontSizeChange={p.onFontSizeChange}
        onDiagramSizeChange={p.onDiagramSizeChange}
        onToggleStickyChords={p.onToggleStickyChords}
        onToggleDark={p.onToggleDark}
        onScrollSpeedChange={p.onScrollSpeedChange}
        onToggleScroll={() => setScrollPlaying((v) => !v)}
        onInstrumentChange={p.onInstrumentChange}
        onToggleSimplify={() => setSimplify((v) => !v)}
        onResetAll={resetAll}
        canReset={canReset}
        onMenu={() => { /* hamburger handled by AppShell */ }}
      />

      {collapsed && (
        <div className="mini-controls" role="toolbar" aria-label="Auto-scroll">
          <button
            className="play-btn"
            onClick={() => setScrollPlaying((v) => !v)}
            aria-label={scrollPlaying ? 'Pause auto-scroll' : 'Start auto-scroll'}
          >
            <Icon name={scrollPlaying ? 'pause' : 'play'} size={14} />
          </button>
          <input
            type="range"
            className="speed-slider"
            min={1}
            max={50}
            step={1}
            value={p.scrollSpeed}
            onChange={(e) => p.onScrollSpeedChange(Math.max(1, Math.min(50, Number(e.target.value))))}
            aria-label="Auto-scroll speed"
            title={`Speed ${p.scrollSpeed}`}
          />
          <button
            className={`icon-btn ${p.stickyChords ? 'icon-btn-on' : ''}`}
            onClick={p.onToggleStickyChords}
            aria-pressed={p.stickyChords}
            aria-label="Pin chord strip while scrolling"
            title="Pin chord diagrams to the top while scrolling"
          >
            <Icon name="pin" size={14} />
          </button>
        </div>
      )}

      <div className="sheet-scroll" ref={scrollRef}>
        <div className="sheet-page">
        <header className="song-header">
          <div className="song-hero">
            <div className="song-hero-art">{(song.title || '?').trim()[0]?.toUpperCase() ?? '?'}</div>
            <div className="song-hero-text">
              <div className="song-hero-eyebrow">
                {artists.primary ? (
                  <>
                    <a href={routeHref({ name: 'artist', slug: slugify(artists.primary) })}>{artists.primary}</a>
                    {artists.featured.map((f, i) => (
                      <span key={f}>
                        {i === 0 ? ' feat. ' : ', '}
                        <a href={routeHref({ name: 'artist', slug: slugify(f) })}>{f}</a>
                      </span>
                    ))}
                  </>
                ) : (
                  'Unknown artist'
                )}
              </div>
              <h2>{song.title}</h2>
              <div className="song-hero-actions">
                <SongActionsMenu
                  song={song}
                  signedIn={signedIn}
                  liked={p.liked}
                  onToggleLike={p.onToggleLike}
                  onRequireSignIn={p.onRequireSignIn}
                  onDone={(msg) => msg && p.onToast(msg)}
                  playerState={{
                    transpose,
                    capo,
                    diagramSize: p.diagramSize === 'sm' ? 'S' : p.diagramSize === 'lg' ? 'L' : 'M',
                  }}
                />
                <button className="ghost-btn" onClick={async () => {
                  const params = new URLSearchParams();
                  if (transpose !== 0) params.set('t', String(transpose));
                  if (capo !== song.defaultCapo) params.set('c', String(capo));
                  const q = params.toString();
                  // Clean URL — the path-to-hash bridge in index.html unpacks it
                  // into the SPA's hash router on landing. Cleaner for share previews.
                  const url = `https://gochords.online/song/${encodeURIComponent(song.id)}${q ? `?${q}` : ''}`;
                  const withState = !!q;
                  const title = `${song.title} — ${song.artist} chords`;

                  // Mobile native share sheet when available.
                  if (typeof navigator !== 'undefined' && (navigator as any).share) {
                    try {
                      await (navigator as any).share({ title, url });
                      return;
                    } catch (e: any) {
                      // AbortError = user dismissed; don't fall through to clipboard
                      if (e?.name === 'AbortError') return;
                    }
                  }
                  try {
                    await navigator.clipboard.writeText(url);
                    p.onToast(withState ? 'Share link copied (preserves your key & capo)' : 'Share link copied');
                  } catch {
                    // Final fallback: prompt with the URL pre-selected so the user can copy manually.
                    window.prompt('Copy this share link:', url);
                  }
                }} title="Share this chord sheet (preserves transpose / capo)">
                  <Icon name="share" size={14} /> Share
                </button>
                {isEditable(song, userId) ? (
                  <button className="ghost-btn" onClick={() => p.onEdit(song)} title="Edit song (⌘E)">
                    <Icon name="edit" size={14} /> Edit
                  </button>
                ) : (
                  <button className="ghost-btn" onClick={() => p.onFork(song)} title="Make editable copy">
                    <Icon name="duplicate" size={14} /> Fork
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="song-meta">
            {displayKey && (
              <span className="key-pill" title={song.originalKey && displayKey !== song.originalKey ? `Original: ${song.originalKey}` : undefined}>
                Key: {displayKey}
                {song.originalKey && displayKey !== song.originalKey && (
                  <span className="key-pill-original"> (from {song.originalKey})</span>
                )}
              </span>
            )}
            {capo > 0 && <span className="key-pill">Capo {capo}</span>}
            {transpose !== 0 && <span className="key-pill">{transpose > 0 ? `+${transpose}` : transpose}</span>}
            {playlistId && playlistPreset && (
              <span className="key-pill key-pill-preset" title="Settings stored on this playlist entry">
                Playlist preset
                {playlistPreset.transpose != null && playlistPreset.transpose !== 0 && ` ${playlistPreset.transpose > 0 ? '+' : ''}${playlistPreset.transpose}`}
                {playlistPreset.capo != null && playlistPreset.capo > 0 && ` · Cap.${playlistPreset.capo}`}
              </span>
            )}
            {stats.unique > 0 && (
              <span className="key-pill" title={`${stats.unique} unique chord${stats.unique === 1 ? '' : 's'}${stats.barre ? `, ${stats.barre} typically barre` : ''}`}>
                {stats.unique} chord{stats.unique === 1 ? '' : 's'}{stats.barre > 0 && ` · ${stats.barre} barre`}
              </span>
            )}
            <span className="key-pill key-pill-inst">{p.instrument}</span>
            {simplify && <span className="key-pill">Simplified</span>}
            {song.visibility === 'private' && <span className="key-pill">Private</span>}
            {song.parentId && <span className="key-pill">Fork</span>}
            {song.seeded && <span className="key-pill key-pill-readonly">Demo</span>}
            {song.tempo && <span className="key-pill">{song.tempo} BPM</span>}
          </div>
          <div className="song-credit">
            {ownerProfile && (
              <span>
                Added by{' '}
                <a href={routeHref({ name: 'user', handle: ownerProfile.handle ?? ownerProfile.id })}>
                  <strong>{ownerProfile.displayName ?? (ownerProfile.handle ? `@${ownerProfile.handle}` : 'user')}</strong>
                </a>
              </span>
            )}
            {song.updatedAt > 0 && (
              <span title={new Date(song.updatedAt).toLocaleString()}>
                Updated {relativeTime(song.updatedAt)}
              </span>
            )}
          </div>
        </header>

        <UsedChordsStrip
          chords={usedChords}
          instrument={p.instrument}
          darkMode={p.darkMode}
          size={p.diagramSize}
          sticky={p.stickyChords}
          onChordClick={(c) => setDiagramChord(c)}
        />

        <ChordSheet song={displaySong} onChordClick={(c) => setDiagramChord(c)} />
        </div>
      </div>

      <ChordDiagramPopup
        chord={diagramChord}
        instrument={p.instrument}
        darkMode={p.darkMode}
        onClose={() => setDiagramChord(null)}
      />
    </div>
  );
}
