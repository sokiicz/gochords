import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse, uniqueChords } from '../lib/parser';
import { effectiveKey, effectiveShift, simplifySong, transposeSong } from '../lib/transpose';
import { parseArtists, slugify } from '../lib/search';
import { fetchProfile, type Profile } from '../lib/profile';
import { routeHref } from '../lib/router';
import { adaptTabsForInstrument } from '../lib/tabConvert';
import type { Instrument } from '../lib/chords';
import { isEditable, type Song } from '../lib/songModel';
import type { DiagramSize } from '../lib/storage';
import { fetchSongState, upsertSongState } from '../lib/cloudSongs';
import { loadSongState, saveSongState } from '../lib/storage';
import { ControlsBar } from '../components/ControlsBar';
import { ChordSheet } from '../components/ChordSheet';
import { ChordDiagramPopup } from '../components/ChordDiagramPopup';
import { UsedChordsStrip } from '../components/UsedChordsStrip';
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
  onToggleDark: () => void;
  onFontSizeChange: (v: 0 | 1 | 2) => void;
  onScrollSpeedChange: (v: number) => void;
  onInstrumentChange: (v: Instrument) => void;
  onDiagramSizeChange: (v: DiagramSize) => void;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const carryRef = useRef(0);
  const stateSaveTimer = useRef<number | null>(null);
  const skipNextStateSave = useRef(false);

  // Load per-song state when the song changes
  useEffect(() => {
    skipNextStateSave.current = true;
    setScrollPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    if (song.origin === 'cloud' && signedIn) {
      fetchSongState(song.id).then((s) => {
        if (s) {
          setTranspose(s.transpose);
          setCapo(s.capo);
          setSimplify(s.simplify);
        } else {
          setTranspose(0);
          setCapo(song.defaultCapo);
          setSimplify(false);
        }
      }).catch(() => {
        setTranspose(0);
        setCapo(song.defaultCapo);
        setSimplify(false);
      });
    } else {
      const s = loadSongState(song.id);
      setTranspose(s.transpose);
      setCapo(s.capo ?? song.defaultCapo);
      setSimplify(s.simplify);
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

  // Auto-scroll loop
  useEffect(() => {
    if (!scrollPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      carryRef.current = 0;
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = scrollRef.current;
      if (el) {
        const pxPerSec = p.scrollSpeed * 8;
        carryRef.current += pxPerSec * dt;
        const whole = Math.floor(carryRef.current);
        if (whole > 0) {
          el.scrollTop += whole;
          carryRef.current -= whole;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setScrollPlaying(false); return; }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [scrollPlaying, p.scrollSpeed]);

  const stopScroll = useCallback(() => { if (scrollPlaying) setScrollPlaying(false); }, [scrollPlaying]);
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
    <div className="player">
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
        simplify={simplify}
        onTransposeChange={setTranspose}
        onCapoChange={setCapo}
        onFontSizeChange={p.onFontSizeChange}
        onDiagramSizeChange={p.onDiagramSizeChange}
        onToggleDark={p.onToggleDark}
        onScrollSpeedChange={p.onScrollSpeedChange}
        onToggleScroll={() => setScrollPlaying((v) => !v)}
        onInstrumentChange={p.onInstrumentChange}
        onToggleSimplify={() => setSimplify((v) => !v)}
        onResetAll={resetAll}
        canReset={canReset}
        onMenu={() => { /* hamburger handled by AppShell */ }}
      />

      <div
        className="sheet-scroll"
        ref={scrollRef}
        onClick={stopScroll}
        onTouchStart={stopScroll}
      >
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
                />
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
            <span className="key-pill key-pill-inst">{p.instrument}</span>
            {simplify && <span className="key-pill">Simplified</span>}
            {song.visibility === 'private' && <span className="key-pill">Private</span>}
            {song.parentId && <span className="key-pill">Fork</span>}
            {song.seeded && <span className="key-pill key-pill-readonly">Demo</span>}
            {song.tempo && <span className="key-pill">{song.tempo} BPM</span>}
          </div>
          <div className="song-credit">
            {ownerProfile && (ownerProfile.displayName || ownerProfile.handle) && (
              <span>Added by <strong>{ownerProfile.displayName ?? `@${ownerProfile.handle}`}</strong></span>
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
