import type { Song, TabLine } from './parser';
import type { Instrument } from './chords';

const TUNINGS: Record<'guitar' | 'ukulele', { labels: string[]; pitches: number[]; maxFret: number }> = {
  // Guitar standard EADGBe; top row is high-e
  guitar:  { labels: ['e', 'B', 'G', 'D', 'A', 'E'], pitches: [64, 59, 55, 50, 45, 40], maxFret: 19 },
  // Ukulele gCEA (high-G re-entrant); top row is A
  ukulele: { labels: ['A', 'E', 'C', 'G'],           pitches: [69, 64, 60, 67],         maxFret: 12 },
};

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function detectTabSource(rows: string[]): 'guitar' | 'ukulele' | null {
  if (rows.length === 6) return 'guitar';
  if (rows.length === 4) return 'ukulele';
  return null;
}

function labelLenOf(row: string): number {
  const m = row.match(/^[a-zA-Z]?\|/);
  return m ? m[0].length : 0;
}

/** Find the best target string for a given pitch, octave-folding to land in
 *  the playable range. Prefers a "comfort fret" (3) to avoid all-zero ukulele. */
function placeNote(pitch: number, dstPitches: number[], maxFret: number): { stringIdx: number; fret: number } | null {
  for (let oct = 0; oct < 4; oct++) {
    const p = pitch + oct * 12;
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestFret = 0;
    for (let r = 0; r < dstPitches.length; r++) {
      const fret = p - dstPitches[r];
      if (fret < 0 || fret > maxFret) continue;
      // Prefer frets near 3 (comfortable position), prefer lower string numbers as tiebreak.
      const score = Math.abs(fret - 3) + r * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = r;
        bestFret = fret;
      }
    }
    if (bestIdx !== -1) return { stringIdx: bestIdx, fret: bestFret };
  }
  return null;
}

function convertStringTab(
  rows: string[],
  source: 'guitar' | 'ukulele',
  target: 'guitar' | 'ukulele',
): string[] {
  if (source === target) return rows;

  const src = TUNINGS[source];
  const dst = TUNINGS[target];

  const labelLens = rows.map(labelLenOf);
  const bodies = rows.map((r, i) => r.slice(labelLens[i]));
  const maxBody = Math.max(...bodies.map((b) => b.length));

  // Per target-string: column → fret (lowest fret wins on collision).
  const placements: Map<number, number>[] = dst.pitches.map(() => new Map());

  rows.forEach((_row, idx) => {
    const stringPitch = src.pitches[idx];
    const body = bodies[idx];
    const re = /\d+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const fret = parseInt(m[0], 10);
      const placed = placeNote(stringPitch + fret, dst.pitches, dst.maxFret);
      if (!placed) continue;
      const stringMap = placements[placed.stringIdx];
      const existing = stringMap.get(m.index);
      if (existing === undefined || placed.fret < existing) {
        stringMap.set(m.index, placed.fret);
      }
    }
  });

  const out: string[] = [];
  for (let r = 0; r < dst.pitches.length; r++) {
    const slot = Array.from({ length: maxBody }, () => '-');
    // Drop-on-collision: if a multi-digit fret would overlap another note's column, skip.
    const events = [...placements[r].entries()]
      .map(([col, fret]) => ({ col, fretStr: String(fret) }))
      .sort((a, b) => a.col - b.col);
    let writeUntil = 0;
    for (const ev of events) {
      if (ev.col < writeUntil) continue; // collision: drop later note to keep timing
      for (let k = 0; k < ev.fretStr.length; k++) {
        if (ev.col + k < slot.length) slot[ev.col + k] = ev.fretStr[k];
      }
      writeUntil = ev.col + ev.fretStr.length;
    }
    out.push(`${dst.labels[r]}|${slot.join('')}`);
  }
  return out;
}

/** Build a single time-ordered note sequence for piano rendering.
 *  Returns rows like ['notes:', 'C5  E5  G5  ...']. */
function tabToPianoNotes(rows: string[], source: 'guitar' | 'ukulele'): string[] {
  const src = TUNINGS[source];
  const labelLens = rows.map(labelLenOf);
  type Note = { col: number; pitch: number };
  const notes: Note[] = [];
  rows.forEach((row, idx) => {
    const stringPitch = src.pitches[idx];
    const body = row.slice(labelLens[idx]);
    const re = /\d+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const fret = parseInt(m[0], 10);
      notes.push({ col: m.index, pitch: stringPitch + fret });
    }
  });
  if (notes.length === 0) return rows;
  notes.sort((a, b) => a.col - b.col || a.pitch - b.pitch);

  // Render single line: notes positioned at their column, with octave numbers (C4, E5, etc.)
  const maxBody = Math.max(...rows.map((r, i) => r.length - labelLens[i]));
  const slot = Array.from({ length: maxBody }, () => ' ');
  let writeUntil = 0;
  for (const n of notes) {
    if (n.col < writeUntil) continue;
    const noteName = NOTE_NAMES[((n.pitch % 12) + 12) % 12];
    const octave = Math.floor(n.pitch / 12) - 1; // MIDI 60 = C4
    const text = noteName + octave;
    for (let k = 0; k < text.length; k++) {
      if (n.col + k < slot.length) slot[n.col + k] = text[k];
    }
    writeUntil = n.col + text.length + 1;
  }
  return [`notes |${slot.join('')}`];
}

export function adaptTabsForInstrument(song: Song, instrument: Instrument): Song {
  const sections = song.sections.map((section) => ({
    ...section,
    lines: section.lines.map((line) => {
      if (line.kind !== 'tab') return line;
      const source = detectTabSource(line.rows);
      if (!source) return line;

      let rows: string[];
      if (instrument === 'piano') {
        rows = tabToPianoNotes(line.rows, source);
      } else {
        rows = convertStringTab(line.rows, source, instrument);
      }
      const out: TabLine = { kind: 'tab', rows };
      return out;
    }),
  }));
  return { sections };
}
