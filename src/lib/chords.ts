import { parseRoot } from './transpose';

export type Instrument = 'guitar' | 'ukulele' | 'piano';

export const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'guitar', label: 'Guitar' },
  { id: 'ukulele', label: 'Ukulele' },
  { id: 'piano', label: 'Piano' },
];

export interface FretShape {
  frets: number[];          // fret per string. -1 = muted, 0 = open. Order: low-pitch (lowest string) to high.
  fingers?: number[];
  barre?: { fret: number; from: number; to: number }; // string indices into `frets`
}

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
};

// 6 strings: low E (6th) → high E (1st). Cross-checked against common chord references.
export const GUITAR_CHORDS: Record<string, FretShape> = {
  // Major triads
  C:  { frets: [-1, 3, 2, 0, 1, 0] },
  'C#': { frets: [-1, 4, 6, 6, 6, 4], barre: { fret: 4, from: 1, to: 5 } },
  D:  { frets: [-1, -1, 0, 2, 3, 2] },
  Eb: { frets: [-1, 6, 5, 3, 4, 3] },
  E:  { frets: [0, 2, 2, 1, 0, 0] },
  F:  { frets: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#': { frets: [2, 4, 4, 3, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  G:  { frets: [3, 2, 0, 0, 0, 3] },
  Ab: { frets: [4, 6, 6, 5, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  A:  { frets: [-1, 0, 2, 2, 2, 0] },
  Bb: { frets: [-1, 1, 3, 3, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  B:  { frets: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },
  // Minor triads
  Cm: { frets: [-1, 3, 5, 5, 4, 3], barre: { fret: 3, from: 1, to: 5 } },
  'C#m': { frets: [-1, 4, 6, 6, 5, 4], barre: { fret: 4, from: 1, to: 5 } },
  Dm: { frets: [-1, -1, 0, 2, 3, 1] },
  Ebm: { frets: [-1, 6, 8, 8, 7, 6], barre: { fret: 6, from: 1, to: 5 } },
  Em: { frets: [0, 2, 2, 0, 0, 0] },
  Fm: { frets: [1, 3, 3, 1, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  Gm: { frets: [3, 5, 5, 3, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
  Abm: { frets: [4, 6, 6, 4, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  Am: { frets: [-1, 0, 2, 2, 1, 0] },
  Bbm: { frets: [-1, 1, 3, 3, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
  // Dominant 7ths
  C7: { frets: [-1, 3, 2, 3, 1, 0] },
  'C#7': { frets: [-1, 4, 3, 4, 2, 4] },
  D7: { frets: [-1, -1, 0, 2, 1, 2] },
  Eb7: { frets: [-1, 6, 5, 6, 4, 6] },
  E7: { frets: [0, 2, 0, 1, 0, 0] },
  F7: { frets: [1, 3, 1, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  'F#7': { frets: [2, 4, 2, 3, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  G7: { frets: [3, 2, 0, 0, 0, 1] },
  Ab7: { frets: [4, 6, 4, 5, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  A7: { frets: [-1, 0, 2, 0, 2, 0] },
  Bb7: { frets: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, from: 1, to: 5 } },
  B7: { frets: [-1, 2, 1, 2, 0, 2] },
  // Minor 7ths
  Am7: { frets: [-1, 0, 2, 0, 1, 0] },
  Bm7: { frets: [-1, 2, 0, 2, 0, 2] },
  'C#m7': { frets: [-1, 4, 6, 4, 5, 4], barre: { fret: 4, from: 1, to: 5 } },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1] },
  Em7: { frets: [0, 2, 0, 0, 0, 0] },
  'F#m7': { frets: [2, 4, 2, 2, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
  Gm7: { frets: [3, 5, 3, 3, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
  Abm7: { frets: [4, 6, 4, 4, 4, 4], barre: { fret: 4, from: 0, to: 5 } },
  Bbm7: { frets: [-1, 1, 3, 1, 2, 1], barre: { fret: 1, from: 1, to: 5 } },
  Cm7: { frets: [-1, 3, 5, 3, 4, 3], barre: { fret: 3, from: 1, to: 5 } },
  // Major 7ths
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0] },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2] },
  Emaj7: { frets: [0, 2, 1, 1, 0, 0] },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0] },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2] },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0] },
  // Sus
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3] },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0] },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0] },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0] },
  Esus4: { frets: [0, 2, 2, 2, 0, 0] },
};

// 4 strings, displayed left-to-right in chart order: G, C, E, A (high-G re-entrant tuning)
export const UKULELE_CHORDS: Record<string, FretShape> = {
  // Major triads
  C:  { frets: [0, 0, 0, 3] },
  'C#': { frets: [1, 1, 1, 4] },
  D:  { frets: [2, 2, 2, 0] },
  Eb: { frets: [0, 3, 3, 1] },
  E:  { frets: [4, 4, 4, 2], barre: { fret: 4, from: 0, to: 2 } },
  F:  { frets: [2, 0, 1, 0] },
  'F#': { frets: [3, 1, 2, 1] },
  G:  { frets: [0, 2, 3, 2] },
  Ab: { frets: [5, 3, 4, 3] },
  A:  { frets: [2, 1, 0, 0] },
  Bb: { frets: [3, 2, 1, 1] },
  B:  { frets: [4, 3, 2, 2] },
  // Minor triads
  Cm: { frets: [0, 3, 3, 3], barre: { fret: 3, from: 1, to: 3 } },
  'C#m': { frets: [1, 1, 0, 4] },
  Dm: { frets: [2, 2, 1, 0] },
  Ebm: { frets: [3, 3, 2, 1] },
  Em: { frets: [0, 4, 3, 2] },
  Fm: { frets: [1, 0, 1, 3] },
  'F#m': { frets: [2, 1, 2, 0] },
  Gm: { frets: [0, 2, 3, 1] },
  Abm: { frets: [1, 3, 4, 2] },
  Am: { frets: [2, 0, 0, 0] },
  Bbm: { frets: [3, 1, 1, 1] },
  Bm: { frets: [4, 2, 2, 2], barre: { fret: 2, from: 1, to: 3 } },
  // Dominant 7ths
  C7: { frets: [0, 0, 0, 1] },
  D7: { frets: [2, 2, 2, 3] },
  E7: { frets: [1, 2, 0, 2] },
  F7: { frets: [2, 3, 1, 3] },
  'F#7': { frets: [3, 4, 2, 4] },
  G7: { frets: [0, 2, 1, 2] },
  Ab7: { frets: [1, 3, 2, 3] },
  A7: { frets: [0, 1, 0, 0] },
  Bb7: { frets: [1, 2, 1, 1] },
  B7: { frets: [2, 3, 2, 2], barre: { fret: 2, from: 0, to: 3 } },
  Eb7: { frets: [3, 3, 3, 4] },
  // Minor 7ths
  Am7: { frets: [0, 0, 0, 0] },
  Bm7: { frets: [2, 2, 2, 2], barre: { fret: 2, from: 0, to: 3 } },
  'C#m7': { frets: [1, 1, 0, 2] },
  Dm7: { frets: [2, 2, 1, 3] },
  Em7: { frets: [0, 2, 0, 2] },
  'F#m7': { frets: [2, 4, 2, 4] },
  Gm7: { frets: [0, 2, 1, 1] },
  Abm7: { frets: [1, 3, 2, 2] },
  Cm7: { frets: [3, 3, 3, 3], barre: { fret: 3, from: 0, to: 3 } },
  // Major 7ths
  Cmaj7: { frets: [0, 0, 0, 2] },
  Dmaj7: { frets: [2, 2, 2, 4] },
  Emaj7: { frets: [1, 3, 0, 2] },
  Fmaj7: { frets: [2, 4, 1, 3] },
  Gmaj7: { frets: [0, 2, 2, 2] },
  Amaj7: { frets: [1, 1, 0, 0] },
  // Sus
  Dsus4: { frets: [0, 2, 3, 0] },
  Dsus2: { frets: [2, 2, 0, 0] },
  Asus4: { frets: [2, 2, 0, 0] },
  Asus2: { frets: [2, 4, 5, 2] },
  Esus4: { frets: [4, 4, 5, 2] },
};

const FRET_DBS: Record<Exclude<Instrument, 'piano'>, Record<string, FretShape>> = {
  guitar: GUITAR_CHORDS,
  ukulele: UKULELE_CHORDS,
};

export function findShape(name: string, instrument: Exclude<Instrument, 'piano'>): FretShape | null {
  if (!name) return null;
  const db = FRET_DBS[instrument];
  const tries = new Set<string>();
  tries.add(name);
  const parsed = parseRoot(name);
  if (parsed) {
    const enh = SHARP_TO_FLAT[parsed.root] ?? FLAT_TO_SHARP[parsed.root];
    if (enh) tries.add(enh + parsed.suffix);
    const noSlash = parsed.suffix.split('/')[0] || '';
    tries.add(parsed.root + noSlash);
    if (enh) tries.add(enh + noSlash);
    let triad = '';
    if (/^m(?!aj)/.test(noSlash)) triad = 'm';
    else if (/^maj/.test(noSlash)) triad = 'maj7';
    tries.add(parsed.root + triad);
    if (enh) tries.add(enh + triad);
    tries.add(parsed.root);
    if (enh) tries.add(enh);
  }
  for (const t of tries) if (db[t]) return db[t];
  return null;
}

// ===== Piano: derive notes from chord name =====

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// Order matters — longest match first.
const QUALITY_INTERVALS: { match: RegExp; intervals: number[] }[] = [
  { match: /^maj7/, intervals: [0, 4, 7, 11] },
  { match: /^m7b5/, intervals: [0, 3, 6, 10] },
  { match: /^m7/,   intervals: [0, 3, 7, 10] },
  { match: /^maj/,  intervals: [0, 4, 7] },
  { match: /^min/,  intervals: [0, 3, 7] },
  { match: /^dim7/, intervals: [0, 3, 6, 9] },
  { match: /^dim/,  intervals: [0, 3, 6] },
  { match: /^aug/,  intervals: [0, 4, 8] },
  { match: /^sus2/, intervals: [0, 2, 7] },
  { match: /^sus4/, intervals: [0, 5, 7] },
  { match: /^sus/,  intervals: [0, 5, 7] },
  { match: /^add9/, intervals: [0, 4, 7, 14] },
  { match: /^6/,    intervals: [0, 4, 7, 9] },
  { match: /^7/,    intervals: [0, 4, 7, 10] },
  { match: /^9/,    intervals: [0, 4, 7, 10, 14] },
  { match: /^11/,   intervals: [0, 4, 7, 10, 14, 17] },
  { match: /^13/,   intervals: [0, 4, 7, 10, 14, 21] },
  { match: /^m6/,   intervals: [0, 3, 7, 9] },
  { match: /^m9/,   intervals: [0, 3, 7, 10, 14] },
  { match: /^m/,    intervals: [0, 3, 7] },
];

export function chordNotes(name: string): number[] | null {
  const parsed = parseRoot(name);
  if (!parsed) return null;
  const root = NOTE_TO_SEMITONE[parsed.root];
  if (root === undefined) return null;
  let suffix = parsed.suffix;
  // strip slash bass
  const slash = suffix.indexOf('/');
  let bass: number | null = null;
  if (slash >= 0) {
    const bassStr = suffix.slice(slash + 1);
    suffix = suffix.slice(0, slash);
    const bp = parseRoot(bassStr);
    if (bp && NOTE_TO_SEMITONE[bp.root] !== undefined) bass = NOTE_TO_SEMITONE[bp.root];
  }
  let intervals = [0, 4, 7]; // major triad default
  for (const q of QUALITY_INTERVALS) {
    if (q.match.test(suffix)) {
      intervals = q.intervals;
      break;
    }
  }
  const notes = intervals.map((i) => (root + i) % 12);
  if (bass !== null && !notes.includes(bass)) notes.unshift(bass);
  return notes;
}

// ===== Drawing =====

export interface DiagramTheme {
  bg: string;
  line: string;
  text: string;
  accent: string;
  muted: string;
}

function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 240;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export function drawFretDiagram(
  canvas: HTMLCanvasElement,
  shape: FretShape,
  theme: DiagramTheme,
): void {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w: cssW, h: cssH } = setup;

  const stringCount = shape.frets.length;
  const padX = Math.max(18, cssW * 0.12);
  const padTop = Math.max(28, cssH * 0.16);
  const padBottom = 10;
  const fretCount = 4;
  const gridW = cssW - padX * 2;
  const gridH = cssH - padTop - padBottom;
  const stringSpacing = gridW / Math.max(1, stringCount - 1);
  const fretSpacing = gridH / fretCount;

  const playedFrets = shape.frets.filter((f) => f > 0);
  const minPlayed = playedFrets.length ? Math.min(...playedFrets) : 1;
  const maxPlayed = playedFrets.length ? Math.max(...playedFrets) : 1;
  const baseFret = maxPlayed > 4 ? minPlayed : 1;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = baseFret === 1 ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(padX, padTop);
  ctx.lineTo(padX + gridW, padTop);
  ctx.stroke();

  ctx.lineWidth = 1.3;
  for (let i = 1; i <= fretCount; i++) {
    const y = padTop + fretSpacing * i;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + gridW, y);
    ctx.stroke();
  }

  for (let s = 0; s < stringCount; s++) {
    const x = padX + stringSpacing * s;
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + gridH);
    ctx.stroke();
  }

  if (baseFret > 1) {
    ctx.fillStyle = theme.text;
    ctx.font = `${Math.max(10, cssH * 0.05)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${baseFret}fr`, padX + gridW + 4, padTop + fretSpacing / 2);
  }

  // X / O markers
  ctx.font = `${Math.max(11, cssH * 0.058)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let s = 0; s < stringCount; s++) {
    const x = padX + stringSpacing * s;
    const y = padTop - Math.max(10, cssH * 0.06);
    const f = shape.frets[s];
    if (f === -1) {
      ctx.fillStyle = theme.muted;
      ctx.fillText('×', x, y);
    } else if (f === 0) {
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, cssH * 0.022), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (shape.barre) {
    const { fret, from, to } = shape.barre;
    const localFret = fret - baseFret + 1;
    if (localFret >= 1 && localFret <= fretCount) {
      const y = padTop + fretSpacing * (localFret - 0.5);
      const x1 = padX + stringSpacing * from;
      const x2 = padX + stringSpacing * to;
      const r = Math.min(fretSpacing * 0.36, stringSpacing * 0.45);
      ctx.fillStyle = theme.accent;
      roundRect(ctx, x1 - r * 0.7, y - r, x2 - x1 + r * 1.4, r * 2, r);
      ctx.fill();
    }
  }

  for (let s = 0; s < stringCount; s++) {
    const f = shape.frets[s];
    if (f <= 0) continue;
    const localFret = f - baseFret + 1;
    if (localFret < 1 || localFret > fretCount) continue;
    const x = padX + stringSpacing * s;
    const y = padTop + fretSpacing * (localFret - 0.5);
    const r = Math.min(fretSpacing * 0.34, stringSpacing * 0.42);
    const inBarre = shape.barre && shape.barre.fret === f && s >= shape.barre.from && s <= shape.barre.to;
    if (!inBarre) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11];          // C D E F G A B
const BLACK_NOTES_AT_WHITE_INDEX: Record<number, number> = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 }; // index in whites → black semitone

export function drawPianoDiagram(
  canvas: HTMLCanvasElement,
  notes: number[],
  theme: DiagramTheme,
): void {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w: cssW, h: cssH } = setup;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const padX = 8;
  const padY = 10;
  const padBottom = 18;
  const octaves = 1.3; // C..E next octave to cover all notes once
  const totalWhites = Math.ceil(7 * octaves); // 10 white keys
  const whiteW = (cssW - padX * 2) / totalWhites;
  const whiteH = cssH - padY - padBottom;
  const blackW = whiteW * 0.6;
  const blackH = whiteH * 0.6;

  const noteSet = new Set(notes.map((n) => ((n % 12) + 12) % 12));

  // Draw white keys
  for (let i = 0; i < totalWhites; i++) {
    const x = padX + i * whiteW;
    const semitone = WHITE_NOTES[i % 7];
    const isHighlighted = noteSet.has(semitone);
    ctx.fillStyle = isHighlighted ? theme.accent : theme.bg;
    ctx.fillRect(x, padY, whiteW, whiteH);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, padY + 0.5, whiteW - 1, whiteH - 1);

    if (isHighlighted) {
      ctx.fillStyle = theme.bg;
      ctx.font = `bold ${Math.max(9, whiteW * 0.32)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const labels = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      ctx.fillText(labels[i % 7], x + whiteW / 2, padY + whiteH - 4);
    }
  }

  // Draw black keys on top
  for (let i = 0; i < totalWhites; i++) {
    const within = i % 7;
    const blackSemi = BLACK_NOTES_AT_WHITE_INDEX[within];
    if (blackSemi === undefined) continue;
    const xWhite = padX + i * whiteW;
    const x = xWhite + whiteW - blackW / 2;
    const isHighlighted = noteSet.has(blackSemi);
    ctx.fillStyle = isHighlighted ? theme.accent : theme.text;
    ctx.fillRect(x, padY, blackW, blackH);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, padY + 0.5, blackW - 1, blackH - 1);
  }
}

/** Top-level draw: dispatches to fret or piano renderer. Returns true if drawn. */
export function drawChordDiagram(
  canvas: HTMLCanvasElement,
  chordName: string,
  instrument: Instrument,
  theme: DiagramTheme,
): boolean {
  if (instrument === 'piano') {
    const notes = chordNotes(chordName);
    if (!notes) return false;
    drawPianoDiagram(canvas, notes, theme);
    return true;
  }
  const shape = findShape(chordName, instrument);
  if (!shape) return false;
  drawFretDiagram(canvas, shape, theme);
  return true;
}

export function hasDiagram(chordName: string, instrument: Instrument): boolean {
  if (instrument === 'piano') return chordNotes(chordName) !== null;
  return findShape(chordName, instrument) !== null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
