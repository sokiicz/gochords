export type Unit = { chord: string | null; lyric: string };
export type ChordLine = { kind: 'chord'; units: Unit[] };
export type TabLine = { kind: 'tab'; rows: string[] };
export type Line = ChordLine | TabLine;
export type Section = { label: string | null; lines: Line[] };
export type Song = { sections: Section[] };

const CHORD_RE =
  /^[A-G](##|bb|#|b)?(maj|min|mi|ma|m|M|sus|add|dim|aug|°|ø|\+|-)?(\d{1,2})?(\((b|#)\d+\))?(sus[24]?)?(add\d+)?(\/[A-G](##|bb|#|b)?)?$/;

const SECTION_LABEL_RE = /^\s*\[([^\]]+)\]\s*$/;
const INLINE_CHORD_RE = /\[([^\]]+)\]|\{([^}]+)\}|\(([^)]+)\)/g;

export function isChordToken(s: string): boolean {
  return CHORD_RE.test(s.trim());
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
  let current: Section = { label: null, lines: [] };
  sections.push(current);

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    const labelMatch = line.match(SECTION_LABEL_RE);
    if (labelMatch && !isChordToken(labelMatch[1].trim())) {
      current = { label: labelMatch[1].trim(), lines: [] };
      sections.push(current);
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
      current.lines.push({ kind: 'chord', units: alignChordsToLyrics(line, '') });
      i++;
      continue;
    }

    current.lines.push({ kind: 'chord', units: [{ chord: null, lyric: line }] });
    i++;
  }

  if (sections[0].label === null && sections[0].lines.length === 0) sections.shift();
  if (sections.length === 0) sections.push({ label: null, lines: [] });
  return { sections };
}

function hasInlineChords(line: string): boolean {
  INLINE_CHORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_CHORD_RE.exec(line)) !== null) {
    const tok = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (isChordToken(tok)) return true;
  }
  return false;
}

function parseInlineLine(line: string): Unit[] {
  const units: Unit[] = [];
  INLINE_CHORD_RE.lastIndex = 0;
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

  let m: RegExpExecArray | null;
  while ((m = INLINE_CHORD_RE.exec(line)) !== null) {
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
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) => isChordToken(t));
}

function alignChordsToLyrics(chordLine: string, lyricLine: string): Unit[] {
  const positions: { col: number; chord: string }[] = [];
  let i = 0;
  while (i < chordLine.length) {
    if (chordLine[i] !== ' ' && chordLine[i] !== '\t') {
      let j = i;
      while (j < chordLine.length && chordLine[j] !== ' ' && chordLine[j] !== '\t') j++;
      const tok = chordLine.slice(i, j);
      if (isChordToken(tok)) positions.push({ col: i, chord: tok });
      i = j;
    } else {
      i++;
    }
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

/** Walk the song and collect unique chord names in first-appearance order. */
export function uniqueChords(song: Song): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'chord') continue;
      for (const u of line.units) {
        if (u.chord && !seen.has(u.chord)) {
          seen.add(u.chord);
          order.push(u.chord);
        }
      }
    }
  }
  return order;
}
