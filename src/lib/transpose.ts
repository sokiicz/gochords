import type { Song, Section, Line, Unit } from './parser';

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

const ROOT_RE = /^([A-G](?:##|bb|#|b)?)(.*)$/;

// Conventional spelling per chromatic step (pop-music defaults: sharps for C#/F#, flats for Eb/Ab/Bb).
const KEY_SPELLING: string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ALL_KEYS: string[] = [
  ...KEY_SPELLING,
  ...KEY_SPELLING.map((k) => k + 'm'),
];

export function parseRoot(chord: string): { root: string; suffix: string } | null {
  const m = chord.match(ROOT_RE);
  if (!m) return null;
  return { root: m[1], suffix: m[2] };
}

function preferFlats(key: string): boolean {
  return FLAT_KEYS.has(key);
}

function noteFromSemitone(semi: number, useFlats: boolean): string {
  const norm = ((semi % 12) + 12) % 12;
  return useFlats ? FLAT_NOTES[norm] : SHARP_NOTES[norm];
}

export function transposeChord(chord: string, semitones: number, useFlats: boolean): string {
  const parsed = parseRoot(chord);
  if (!parsed) return chord;
  const baseSemi = NOTE_TO_SEMITONE[parsed.root];
  if (baseSemi === undefined) return chord;
  const newRoot = noteFromSemitone(baseSemi + semitones, useFlats);

  let suffix = parsed.suffix;
  const slashIdx = suffix.indexOf('/');
  if (slashIdx >= 0) {
    const bassPart = suffix.slice(slashIdx + 1);
    const bassParsed = parseRoot(bassPart);
    if (bassParsed) {
      const bassSemi = NOTE_TO_SEMITONE[bassParsed.root];
      if (bassSemi !== undefined) {
        const newBass = noteFromSemitone(bassSemi + semitones, useFlats);
        suffix = suffix.slice(0, slashIdx) + '/' + newBass + bassParsed.suffix;
      }
    }
  }
  return newRoot + suffix;
}

/**
 * Net semitone shift applied to the source chords for display.
 *
 *   shift = transpose + (defaultCapo - capo)
 *
 * Source chords are treated as the *fingering* the song author intended at `defaultCapo`.
 * Moving the capo away from `defaultCapo` re-shapes the chords so the *sounding* pitch is preserved,
 * unless the user also dials in a non-zero `transpose` on top.
 */
export function effectiveShift(transpose: number, capo: number, defaultCapo = 0): number {
  return transpose + (defaultCapo - capo);
}

export function transposeTabRow(row: string, shift: number): string {
  if (shift === 0) return row;
  return row.replace(/(-*)(\d+)/g, (_match, dashes: string, num: string) => {
    let n = parseInt(num, 10) + shift;
    while (n < 0) n += 12;
    const next = String(n);
    const total = dashes.length + num.length;
    if (next.length > total) return next;
    return '-'.repeat(total - next.length) + next;
  });
}

export function transposeSong(
  song: Song,
  transpose: number,
  capo: number,
  originalKey?: string,
  defaultCapo = 0,
): Song {
  const shift = effectiveShift(transpose, capo, defaultCapo);
  if (shift === 0) return song;
  const useFlats = originalKey ? preferFlats(shiftKey(originalKey, shift)) : shift < 0;
  return {
    sections: song.sections.map<Section>((s) => ({
      label: s.label,
      annotation: s.annotation,
      lines: s.lines.map<Line>((l) => {
        if (l.kind === 'tab') {
          return { kind: 'tab', rows: l.rows.map((r) => transposeTabRow(r, shift)) };
        }
        if (l.kind === 'strum') return l;
        return {
          kind: 'chord',
          chordOnly: l.chordOnly,
          units: l.units.map<Unit>((u) => ({
            chord: u.chord ? transposeChord(u.chord, shift, useFlats) : null,
            lyric: u.lyric,
            annot: u.annot,
          })),
        };
      }),
    })),
  };
}

export function simplifyChord(name: string): string {
  const parsed = parseRoot(name);
  if (!parsed) return name;
  const suffix = parsed.suffix.split('/')[0];
  if (/^m(?!aj)/.test(suffix)) return parsed.root + 'm';
  if (/^dim/.test(suffix)) return parsed.root + 'dim';
  if (/^aug/.test(suffix)) return parsed.root + 'aug';
  return parsed.root;
}

export function simplifySong(song: Song): Song {
  return {
    sections: song.sections.map<Section>((s) => ({
      label: s.label,
      annotation: s.annotation,
      lines: s.lines.map<Line>((l) => {
        if (l.kind === 'tab' || l.kind === 'strum') return l;
        return {
          kind: 'chord',
          chordOnly: l.chordOnly,
          units: l.units.map<Unit>((u) => ({
            chord: u.chord ? simplifyChord(u.chord) : null,
            lyric: u.lyric,
            annot: u.annot,
          })),
        };
      }),
    })),
  };
}

function shiftKey(key: string, semitones: number): string {
  const parsed = parseRoot(key);
  if (!parsed) return key;
  const baseSemi = NOTE_TO_SEMITONE[parsed.root];
  if (baseSemi === undefined) return key;
  const minor = /^m(?!aj)/.test(parsed.suffix);
  const idx = ((baseSemi + semitones) % 12 + 12) % 12;
  return KEY_SPELLING[idx] + (minor ? 'm' : '');
}

/** Semitone delta to land `fromKey` on `toKey`. Result is normalized to (-6, +6]. */
export function keyDelta(fromKey: string, toKey: string): number {
  const a = parseRoot(fromKey);
  const b = parseRoot(toKey);
  if (!a || !b) return 0;
  const fa = NOTE_TO_SEMITONE[a.root];
  const fb = NOTE_TO_SEMITONE[b.root];
  if (fa === undefined || fb === undefined) return 0;
  let d = (fb - fa) % 12;
  if (d > 6) d -= 12;
  if (d <= -6) d += 12;
  return d;
}

/** The displayed key after applying transpose+capo to the original key. */
export function effectiveKey(originalKey: string | undefined, shift: number): string | null {
  if (!originalKey) return null;
  return shiftKey(originalKey, shift);
}
