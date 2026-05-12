export type Unit = { chord: string | null; lyric: string; annot?: string };
export type ChordLine = { kind: 'chord'; units: Unit[]; chordOnly?: boolean };
export type TabLine = { kind: 'tab'; rows: string[] };
export type Line = ChordLine | TabLine;
export type Section = { label: string | null; annotation?: string | null; lines: Line[] };
export type Song = { sections: Section[] };

// --- chord grammar ---
// Tension-or-bass slash:  /9 /11 /13  → tension extension (rare, e.g. C6/9)
//                          /A /F#     → bass note
const ROOT = '[A-G](?:##|bb|#|b)?';
const QUALITY = '(?:maj|min|mi|ma|m(?!aj)|M(?!aj)|dim|aug|°|ø|\\+)?';
const NUMBER = '(?:\\d{1,2})?';
const ALT_TENSION = '(?:[-b#+]\\d{1,2}|\\([-b#+]?\\d{1,2}\\))';
const SUS = '(?:sus[24]?)?';
const ADD = '(?:add[#b]?\\d{1,2})?';
const SLASH = '(?:\\/(?:\\d{1,2}|' + ROOT + '))?';
const CHORD_RE = new RegExp(
  '^' + ROOT + QUALITY + NUMBER + '(?:' + ALT_TENSION + ')*' + SUS + ADD + SLASH + '$'
);

const NO_CHORD_RE = /^N\.?C\.?$/i;
const REPEAT_RE = /^\(?x\d+\)?$/i;
const BARE_SECTION_RE =
  /^\s*(intro|outro|verse|chorus|pre[\s-]?chorus|bridge|interlude|solo|coda|tag|refrain|hook|breakdown|instrumental|riff)(\s*\d+)?\s*:?\s*(\([^)]*\))?\s*$/i;
const SECTION_LABEL_RE = /^\s*\[([^\]]+)\]\s*(.*)$/;
const INLINE_CHORD_RE = /\[([^\]]+)\]|\{([^}]+)\}|\(([^)]+)\)/g;

export function isChordToken(s: string): boolean {
  const t = s.trim();
  if (t === '') return false;
  if (NO_CHORD_RE.test(t)) return true;
  return CHORD_RE.test(t);
}

export function isNoChordToken(s: string): boolean {
  return NO_CHORD_RE.test(s.trim());
}

function isRepeatMarker(s: string): boolean {
  return REPEAT_RE.test(s.trim());
}

function isBarline(t: string): boolean {
  return t === '|' || t === ':|' || t === '|:' || t === '||' || t === ':||' || t === '||:';
}

function isFiller(t: string): boolean {
  return t === '' || isBarline(t) || isRepeatMarker(t);
}

function tokenizeChordRow(line: string): string[] {
  return line.split(/[\s|]+/).filter((t) => t.length > 0);
}

export function isTabRow(line: string): boolean {
  const trimmed = line.replace(/^\s+/, '');
  if (trimmed.length < 4) return false;
  if (!/-{2,}/.test(trimmed)) return false;
  const body = trimmed.replace(/^[a-gA-G]?\|/, '');
  if (body.length === 0) return false;
  const tabChars = (body.match(/[\-\d\sxhpbr\/\\~()|.]/g) || []).length;
  return tabChars / body.length > 0.85 && /-/.test(body);
}

export function parse(input: string): Song {
  const rawLines = input.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];
  let current: Section = { label: null, annotation: null, lines: [] };
  sections.push(current);

  const openSection = (label: string, annotation: string | null) => {
    current = { label, annotation, lines: [] };
    sections.push(current);
  };

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    const labelMatch = line.match(SECTION_LABEL_RE);
    if (labelMatch && !isChordToken(labelMatch[1].trim())) {
      const label = labelMatch[1].trim();
      const trailing = labelMatch[2].trim();
      // If trailing content parses as chord-only, treat as the section's first chord line.
      // Otherwise it's a free-form annotation like "(with whistling)".
      if (trailing !== '' && isChordOnlyLine(trailing)) {
        openSection(label, null);
        current.lines.push({ kind: 'chord', units: chordOnlyUnits(trailing), chordOnly: true });
      } else {
        openSection(label, trailing === '' ? null : trailing);
      }
      i++;
      continue;
    }

    const bareMatch = line.match(BARE_SECTION_RE);
    if (bareMatch && !isChordToken(line.trim())) {
      const parts = [bareMatch[1], bareMatch[2]].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
      const annotation = (bareMatch[3] || '').trim();
      openSection(parts, annotation === '' ? null : annotation);
      i++;
      continue;
    }

    if (line.trim() === '') {
      current.lines.push({ kind: 'chord', units: [{ chord: null, lyric: '' }] });
      i++;
      continue;
    }

    if (isTabRow(line)) {
      const rows: string[] = [];
      while (i < rawLines.length && isTabRow(rawLines[i])) {
        rows.push(rawLines[i]);
        i++;
      }
      current.lines.push({ kind: 'tab', rows });
      continue;
    }

    if (hasInlineChords(line)) {
      current.lines.push({ kind: 'chord', units: parseInlineLine(line) });
      i++;
      continue;
    }

    if (
      isChordOnlyLine(line) &&
      i + 1 < rawLines.length &&
      rawLines[i + 1].trim() !== '' &&
      !isChordOnlyLine(rawLines[i + 1]) &&
      !isTabRow(rawLines[i + 1])
    ) {
      current.lines.push({ kind: 'chord', units: alignChordsToLyrics(line, rawLines[i + 1]) });
      i += 2;
      continue;
    }

    if (isChordOnlyLine(line)) {
      current.lines.push({ kind: 'chord', units: chordOnlyUnits(line), chordOnly: true });
      i++;
      continue;
    }

    current.lines.push({ kind: 'chord', units: [{ chord: null, lyric: line }] });
    i++;
  }

  if (sections[0].label === null && sections[0].lines.length === 0) sections.shift();
  if (sections.length === 0) sections.push({ label: null, annotation: null, lines: [] });
  return { sections };
}

function hasInlineChords(line: string): boolean {
  for (const m of line.matchAll(INLINE_CHORD_RE)) {
    const tok = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (isChordToken(tok)) return true;
  }
  return false;
}

function parseInlineLine(line: string): Unit[] {
  const units: Unit[] = [];
  let lastIdx = 0;
  let pendingChord: string | null = null;
  let pendingLyric = '';

  const flush = () => {
    if (pendingChord !== null || pendingLyric !== '') {
      units.push({ chord: pendingChord, lyric: pendingLyric });
    }
    pendingChord = null;
    pendingLyric = '';
  };

  for (const m of line.matchAll(INLINE_CHORD_RE)) {
    const tok = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!isChordToken(tok)) continue;
    const before = line.slice(lastIdx, m.index);
    if (before.length > 0) {
      pendingLyric += before;
      flush();
    } else if (pendingChord !== null) {
      flush();
    }
    pendingChord = tok;
    lastIdx = m.index + m[0].length;
  }
  pendingLyric += line.slice(lastIdx);
  flush();

  if (units.length === 0) units.push({ chord: null, lyric: line });
  return units;
}

function isChordOnlyLine(line: string): boolean {
  const tokens = tokenizeChordRow(line);
  if (tokens.length === 0) return false;
  let hasChord = false;
  for (const t of tokens) {
    if (isFiller(t)) continue;
    if (!isChordToken(t)) return false;
    hasChord = true;
  }
  return hasChord;
}

/** Units for a chord-only line. Repeat markers (x2) ride along on the previous unit's `annot`. */
function chordOnlyUnits(line: string): Unit[] {
  const tokens = tokenizeChordRow(line);
  const units: Unit[] = [];
  for (const t of tokens) {
    if (isBarline(t)) continue;
    if (isRepeatMarker(t)) {
      if (units.length > 0) units[units.length - 1].annot = t;
      else units.push({ chord: null, lyric: '', annot: t });
      continue;
    }
    units.push({ chord: t, lyric: '' });
  }
  if (units.length === 0) return [{ chord: null, lyric: line }];
  return units;
}

function alignChordsToLyrics(chordLine: string, lyricLine: string): Unit[] {
  const positions: { col: number; chord: string }[] = [];
  let i = 0;
  while (i < chordLine.length) {
    const ch = chordLine[i];
    if (ch === ' ' || ch === '\t' || ch === '|') {
      i++;
      continue;
    }
    let j = i;
    while (j < chordLine.length && chordLine[j] !== ' ' && chordLine[j] !== '\t' && chordLine[j] !== '|') j++;
    const tok = chordLine.slice(i, j);
    if (isChordToken(tok) && !isRepeatMarker(tok)) positions.push({ col: i, chord: tok });
    i = j;
  }

  if (positions.length === 0) return [{ chord: null, lyric: lyricLine }];

  const units: Unit[] = [];
  if (positions[0].col > 0 && lyricLine.length > 0) {
    units.push({ chord: null, lyric: lyricLine.slice(0, positions[0].col) });
  }
  for (let p = 0; p < positions.length; p++) {
    const start = positions[p].col;
    const end = p + 1 < positions.length ? positions[p + 1].col : Math.max(lyricLine.length, start);
    const slice = lyricLine.length > start ? lyricLine.slice(start, end) : '';
    units.push({ chord: positions[p].chord, lyric: slice });
  }
  return units;
}

export function uniqueChords(song: Song): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'chord') continue;
      for (const u of line.units) {
        if (u.chord && !seen.has(u.chord) && !isNoChordToken(u.chord)) {
          seen.add(u.chord);
          order.push(u.chord);
        }
      }
    }
  }
  return order;
}
