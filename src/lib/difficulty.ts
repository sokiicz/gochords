import type { Song } from './songModel';
import { parse, uniqueChords } from './parser';

export interface ChordStats {
  unique: number;
  barre: number;
  extended: number;
}

// Hard-coded "typically a barre on guitar in standard tuning" set. Crude but
// honest — the badge wording ("N chords · M barre") signals this is heuristic.
const BARRE_TYPICAL = new Set([
  'F', 'Fm', 'F#', 'F#m', 'Gb', 'Gbm',
  'B', 'Bm', 'Bb', 'Bbm',
  'C#', 'C#m', 'Db', 'Dbm',
  'G#', 'G#m', 'Ab', 'Abm',
  'D#', 'D#m', 'Eb', 'Ebm',
]);

// "Extended" = anything with a 7/9/11/13/sus/add/aug/dim/m7b5/etc qualifier.
const EXTENDED_RE = /(maj|min|m\d|sus|add|aug|dim|7|9|11|13|b5|#5|#9|b9|#11|ø|°|\+)/i;

function rootChord(token: string): string {
  // Strip slash bass note and any annotation in parens.
  return token.split('/')[0].replace(/\([^)]+\)/g, '');
}

/**
 * Compute stats about the chords in a song's parsed source. Pure; safe to call
 * inside a useMemo. NB: barre is a *typical-shape* heuristic — see BARRE_TYPICAL
 * above. The badge wording acknowledges this ("N chords · M barre").
 */
export function chordStats(song: Pick<Song, 'source'>): ChordStats {
  const parsed = parse(song.source ?? '');
  const chords = uniqueChords(parsed);
  let barre = 0;
  let extended = 0;
  for (const c of chords) {
    const root = rootChord(c);
    if (BARRE_TYPICAL.has(root)) barre++;
    if (EXTENDED_RE.test(c)) extended++;
  }
  return { unique: chords.length, barre, extended };
}

/**
 * Module-level LRU-ish cache for stats keyed by (id, source-length+head). A
 * full parse is ~free for one song but stacks up across 100+ cards re-rendering
 * on every filter change. Bounded to 500 entries — eviction is whichever key
 * was inserted first when we exceed the cap. The source-length component
 * invalidates stale entries cheaply if the song is edited.
 */
const CACHE_CAP = 500;
const cache = new Map<string, ChordStats>();
export function chordStatsCached(id: string, source: string): ChordStats {
  const key = `${id}\x00${source.length}\x00${source.slice(0, 32)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const stats = chordStats({ source });
  if (cache.size >= CACHE_CAP) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, stats);
  return stats;
}
