// Sanity tests for parser.ts. Run: npm test
import { isChordToken, parse, preprocessSource, uniqueChords } from '../src/lib/parser';
import { detectLanguage } from '../src/lib/language';

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}`);
    console.error('  expected:', expected);
    console.error('  actual:  ', actual);
  }
}
const yes = (t: string) => check(`chord '${t}'`, isChordToken(t), true);
const no = (t: string) => check(`not chord '${t}'`, isChordToken(t), false);

// --- chord token coverage ---
['C', 'Em', 'F#', 'Bb', 'Am7', 'Cmaj7', 'Fmaj7', 'CM7', 'G7sus4', 'Cadd9',
 'Bbadd#11', 'F#m7-5', 'F#m7b5', 'Dm7(b5)', 'C/G', 'D/F#', 'Cdim7', 'Caug',
 'C+', 'C+7', 'Cø7', 'C°', 'N.C.', 'NC', 'D5', 'C6/9', 'Cmaj7#11', 'Cm7b5/Eb'
].forEach(yes);
['hello', 'x2', 'verse', '', 'Intro', 'and', 'C/9X'].forEach(no);

// --- bar-line chord row ---
{
  const song = parse('|Em |D |Em |D');
  const line = song.sections[0]?.lines[0];
  check('barline kind', line?.kind, 'chord');
  if (line?.kind === 'chord') {
    check('barline chordOnly flag', line.chordOnly, true);
    check('barline chords', line.units.map((u) => u.chord), ['Em', 'D', 'Em', 'D']);
  }
}

// --- repeat marker survives chord-only rendering ---
{
  const song = parse('Em D x2');
  const line = song.sections[0]?.lines[0];
  if (line?.kind === 'chord') {
    check('repeat chords', line.units.map((u) => u.chord), ['Em', 'D']);
    check('repeat annot on last', line.units[1]?.annot, 'x2');
  }
}

// --- section label with annotation ---
{
  const song = parse('[Intro](with whistling) (x2)\nEm D');
  const sec = song.sections[0];
  check('annot label', sec?.label, 'Intro');
  check('annot text', sec?.annotation, '(with whistling) (x2)');
}

// --- section label followed by chord row on same line ---
{
  const song = parse('[Verse] Am F C G');
  const sec = song.sections[0];
  check('inline-row label', sec?.label, 'Verse');
  check('inline-row no annotation', sec?.annotation, null);
  const line = sec?.lines[0];
  if (line?.kind === 'chord') {
    check('inline-row chords preserved', line.units.map((u) => u.chord), ['Am', 'F', 'C', 'G']);
  } else {
    check('inline-row line exists', !!line, true);
  }
}

// --- bare section keyword ---
{
  const song = parse('Verse 1\nAm F C G');
  check('bare label', song.sections[0]?.label, 'Verse 1');
}

// --- bare keyword does NOT swallow real lyrics ---
{
  const song = parse('Verse song about the river\nAm F');
  // "Verse song about the river" should NOT be a section label.
  check('bare keyword rejected as lyric', song.sections[0]?.label, null);
}

// --- N.C. ---
{
  const song = parse('N.C. Em D');
  const line = song.sections[0]?.lines[0];
  if (line?.kind === 'chord') {
    check('NC tokens', line.units.map((u) => u.chord), ['N.C.', 'Em', 'D']);
  }
  check('NC excluded from uniqueChords', uniqueChords(song), ['Em', 'D']);
}

// --- chordOnly flag on plain chord row ---
{
  const song = parse('Em D G C');
  const line = song.sections[0]?.lines[0];
  check('chord-only flag set', line?.kind === 'chord' && line.chordOnly === true, true);
}

// --- a normal lyric-only line is NOT chordOnly ---
{
  const song = parse('Hello world this is a lyric');
  const line = song.sections[0]?.lines[0];
  check('lyric line not chord-only', line?.kind === 'chord' && line.chordOnly !== true, true);
}

// --- aligned chord+lyric still works and is NOT chordOnly ---
{
  const song = parse('C       G\nHello world');
  const line = song.sections[0]?.lines[0];
  if (line?.kind === 'chord') {
    check('aligned chords', line.units.map((u) => u.chord), ['C', 'G']);
    check('aligned not chord-only', line.chordOnly !== true, true);
  }
}

// --- inline brackets ---
{
  const song = parse('[Am]Hello [F]world');
  const line = song.sections[0]?.lines[0];
  if (line?.kind === 'chord') {
    check('inline pairs', line.units.map((u) => [u.chord, u.lyric]), [['Am', 'Hello '], ['F', 'world']]);
  }
}

// --- repeat-marker alone on chord row ---
{
  const song = parse('Em D Em D (x2)');
  const line = song.sections[0]?.lines[0];
  if (line?.kind === 'chord') {
    check('paren repeat chords', line.units.map((u) => u.chord), ['Em', 'D', 'Em', 'D']);
    check('paren repeat annot', line.units[3]?.annot, '(x2)');
  }
}

// --- UG paste format preprocessing ---
check(
  'preprocessSource: UG [ch]Em[/ch]',
  preprocessSource('[ch]Em[/ch] [ch]D[/ch] hello'),
  '[Em] [D] hello',
);
check(
  'parse: UG-pasted line parses chords inline',
  (() => {
    const song = parse('[ch]Am[/ch]Hello [ch]F[/ch]world');
    const line = song.sections[0]?.lines[0];
    return line?.kind === 'chord' ? line.units.map((u) => u.chord) : [];
  })(),
  ['Am', 'F'],
);

// --- strum line ---
{
  const song = parse('Strum: D D U U D U\n[Am]Hello [F]world');
  const strum = song.sections[0]?.lines[0];
  check(
    'strum: detected',
    strum?.kind,
    'strum',
  );
  if (strum?.kind === 'strum') {
    check('strum: token count', strum.tokens.length, 6);
    check('strum: first is down', strum.tokens[0].kind, 'down');
    check('strum: third is up', strum.tokens[2].kind, 'up');
  }
  const next = song.sections[0]?.lines[1];
  check('strum: chord line still parses after', next?.kind, 'chord');
}

{
  // Without prefix but plenty of strokes
  const song = parse('D D U D D U U D');
  const line = song.sections[0]?.lines[0];
  check('strum: prefix-less ≥3 strokes detected', line?.kind, 'strum');
}

{
  // A single "D" alone must NOT be a strum row
  const song = parse('D');
  const line = song.sections[0]?.lines[0];
  check('strum: lone D is chord-row, not strum', line?.kind, 'chord');
}

{
  // A row of just "D D D" (three same-letter chord names) must NOT be a strum row.
  // Without an explicit "Strum:" prefix, detection now requires a real rhythm cue
  // (mixed D+U, lowercase d/u, X mute, or arrows).
  const song = parse('D D D');
  const line = song.sections[0]?.lines[0];
  check('strum: D D D stays a chord row', line?.kind, 'chord');
}

{
  // lowercase d/u alone is a rhythm cue
  const song = parse('d u d u d u');
  const line = song.sections[0]?.lines[0];
  check('strum: lowercase d/u detected as strum', line?.kind, 'strum');
}

{
  // arrows alone are a rhythm cue
  const song = parse('↓ ↓ ↑ ↓ ↑');
  const line = song.sections[0]?.lines[0];
  check('strum: arrows detected as strum', line?.kind, 'strum');
}

// --- language detection ---
check(
  'lang: clearly English',
  detectLanguage('Today is the day that I will be with you and we know it all the time you are the one for me'),
  'en',
);
check(
  'lang: clearly Czech (ř + stoplist hits)',
  detectLanguage('Dnes je ten den kdy se vrátím k tobě jak jsem už slíbil tak musím přijít domů zase'),
  'cs',
);
check(
  'lang: too short → null',
  detectLanguage('hey ya'),
  null,
);
check(
  'lang: nonsense → null',
  detectLanguage('zxqv mnbg pwop quzr xkrv vmnb pqzr xqvm krwt'),
  null,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
