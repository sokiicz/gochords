import { SEED_SONGS } from './seedSongs';
import type { Instrument } from './chords';

export interface StoredSong {
  id: string;
  title: string;
  artist: string;
  originalKey?: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  defaultCapo?: number;
  tempo?: number | null;
  tags?: string[];
  /** True for shipped demo songs — they are read-only. */
  seeded?: boolean;
  /** Set after a song has been pushed to the cloud account; suppresses sync prompt. */
  syncedAt?: number;
}

export function isReadOnly(song: StoredSong): boolean {
  return song.seeded === true;
}

const SONGS_KEY = 'gochords:songs:v1';
const PREFS_KEY = 'gochords:prefs:v1';
const SEEDED_KEY = 'gochords:seeded:v1';
const SONG_STATE_KEY = 'gochords:songstate:v1';

export type DiagramSize = 'sm' | 'md' | 'lg';

export interface Prefs {
  darkMode: boolean;
  fontSize: 0 | 1 | 2;
  scrollSpeed: number;
  instrument: Instrument;
  diagramSize: DiagramSize;
  stickyChords: boolean;
}

const DEFAULT_PREFS: Prefs = {
  darkMode: false,
  fontSize: 1,
  scrollSpeed: 12,
  instrument: 'guitar',
  diagramSize: 'md',
  stickyChords: false,
};

const MIGRATION_KEY = 'gochords:migrated:v2';

export function loadSongs(): StoredSong[] {
  let songs: StoredSong[] | null = null;
  try {
    const raw = localStorage.getItem(SONGS_KEY);
    if (raw) songs = JSON.parse(raw) as StoredSong[];
  } catch {}

  if (!songs) {
    if (!localStorage.getItem(SEEDED_KEY)) {
      const now = Date.now();
      const fresh = SEED_SONGS.map((s) => ({ ...s, createdAt: now, updatedAt: now, seeded: true }));
      saveSongs(fresh);
      localStorage.setItem(SEEDED_KEY, '1');
      localStorage.setItem(MIGRATION_KEY, '1');
      return fresh;
    }
    return [];
  }

  // One-shot migration: stamp the seeded flag on existing demo rows so we
  // don't have to rely on id-prefix detection forever.
  if (!localStorage.getItem(MIGRATION_KEY)) {
    const seedIds = new Set(SEED_SONGS.map((s) => s.id));
    const migrated = songs.map((s) => (seedIds.has(s.id) || s.id.startsWith('demo-') ? { ...s, seeded: true } : s));
    saveSongs(migrated);
    localStorage.setItem(MIGRATION_KEY, '1');
    return migrated;
  }

  return songs;
}

export function saveSongs(songs: StoredSong[]): void {
  localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const merged: Prefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      // Migrate old 1..10 scrollSpeed scale to new 1..50 (was speed*8 px/s, now speed*2 px/s).
      if (merged.scrollSpeed <= 10) merged.scrollSpeed = Math.max(2, Math.round(merged.scrollSpeed * 4));
      return merged;
    }
  } catch {}
  return DEFAULT_PREFS;
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function newId(): string {
  return 'song-' + Math.random().toString(36).slice(2, 10);
}

export interface SongState {
  transpose: number;
  capo: number;
  simplify: boolean;
}

const DEFAULT_SONG_STATE: SongState = { transpose: 0, capo: 0, simplify: false };

function loadAllSongState(): Record<string, SongState> {
  try {
    const raw = localStorage.getItem(SONG_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function loadSongState(songId: string): SongState {
  const all = loadAllSongState();
  return { ...DEFAULT_SONG_STATE, ...(all[songId] || {}) };
}

export function saveSongState(songId: string, state: SongState): void {
  const all = loadAllSongState();
  all[songId] = state;
  localStorage.setItem(SONG_STATE_KEY, JSON.stringify(all));
}

export function deleteSongState(songId: string): void {
  const all = loadAllSongState();
  delete all[songId];
  localStorage.setItem(SONG_STATE_KEY, JSON.stringify(all));
}
