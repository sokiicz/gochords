// Sanity tests for transpose.ts. Run: npm run test:transpose
import { parse } from '../src/lib/parser';
import {
  ALL_KEYS,
  effectiveKey,
  effectiveShift,
  keyDelta,
  transposeChord,
  transposeSong,
  transposeTabRow,
} from '../src/lib/transpose';

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

// --- effectiveShift semantics ---
check('shift: defaults', effectiveShift(0, 0, 0), 0);
check('shift: capo only, no default', effectiveShift(0, 2, 0), -2);
check('shift: capo == defaultCapo', effectiveShift(0, 2, 2), 0);
check('shift: remove capo from default', effectiveShift(0, 0, 2), 2);
check('shift: transpose stacks', effectiveShift(3, 0, 2), 5);
check('shift: transpose + capo change', effectiveShift(1, 4, 2), -1);

// --- transposeChord ---
check('chord: C up 2', transposeChord('C', 2, false), 'D');
check('chord: Am up 3', transposeChord('Am', 3, false), 'Cm');
check('chord: D down 2 flats', transposeChord('D', -2, true), 'C');
check('chord: F#m7-5 up 1', transposeChord('F#m7-5', 1, false), 'Gm7-5');
check('chord: Bb up 2', transposeChord('Bb', 2, false), 'C');
check('chord: C/G up 5', transposeChord('C/G', 5, false), 'F/C');
check('chord: C6/9 up 2 (tension-slash untouched)', transposeChord('C6/9', 2, false), 'D6/9');
check('chord: Bbadd#11 down 1 flats', transposeChord('Bbadd#11', -1, true), 'Aadd#11');

// --- tab row ---
check('tab: shift up 2', transposeTabRow('---3---5---7--', 2), '---5---7---9--');
check('tab: no-op shift', transposeTabRow('---3---5---7--', 0), '---3---5---7--');

// --- key math ---
check('keyDelta: C -> D', keyDelta('C', 'D'), 2);
check('keyDelta: C -> Bb', keyDelta('C', 'Bb'), -2);
check('keyDelta: C -> F#', keyDelta('C', 'F#'), 6);
check('keyDelta: Am -> Cm', keyDelta('Am', 'Cm'), 3);

// --- effectiveKey ---
check('effectiveKey: C +2 = D', effectiveKey('C', 2), 'D');
check('effectiveKey: G -2 = F', effectiveKey('G', -2), 'F');
check('effectiveKey: undefined', effectiveKey(undefined, 4), null);

// --- transposeSong respects defaultCapo ---
{
  const song = parse('Am F C G');
  // Song written for capo 2. User opens it: capo=defaultCapo=2 -> displayed as written.
  const s1 = transposeSong(song, 0, 2, undefined, 2);
  const line1 = s1.sections[0].lines[0];
  if (line1.kind === 'chord') {
    check(
      'song@default capo: as-is',
      line1.units.map((u) => u.chord),
      ['Am', 'F', 'C', 'G'],
    );
  }
  // User removes the capo. Same sounding pitch -> chords shift UP by 2.
  const s2 = transposeSong(song, 0, 0, undefined, 2);
  const line2 = s2.sections[0].lines[0];
  if (line2.kind === 'chord') {
    check(
      'song@no capo from defaultCapo=2: +2',
      line2.units.map((u) => u.chord),
      ['Bm', 'G', 'D', 'A'],
    );
  }
}

// --- ALL_KEYS sanity ---
check('ALL_KEYS count', ALL_KEYS.length, 24);
check('ALL_KEYS includes C and Am', ALL_KEYS.includes('C') && ALL_KEYS.includes('Am'), true);

// --- chord-only / annot preserved across transpose ---
{
  const song = parse('Em D x2');
  const out = transposeSong(song, 2, 0, undefined, 0);
  const line = out.sections[0].lines[0];
  if (line.kind === 'chord') {
    check('preserve chordOnly through transpose', line.chordOnly, true);
    check(
      'preserve annot through transpose',
      line.units.map((u) => u.annot ?? null),
      [null, 'x2'],
    );
    check(
      'transposed chords on chord-only row',
      line.units.map((u) => u.chord),
      ['F#m', 'E'],
    );
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
