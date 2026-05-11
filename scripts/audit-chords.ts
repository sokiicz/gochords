// Verifies every shape in the chord DB plays the notes its name implies.
// Run via:  npm run audit
import { GUITAR_CHORDS, UKULELE_CHORDS, type FretShape } from '../src/lib/chords';
import { parseRoot } from '../src/lib/transpose';

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];
const UKULELE_TUNING = [67, 60, 64, 69];

function requiredNotes(name: string): number[] {
  const parsed = parseRoot(name);
  if (!parsed) return [];
  const root = NOTE_TO_SEMITONE[parsed.root];
  if (root === undefined) return [];
  const s = parsed.suffix.split('/')[0];
  const at = (semi: number) => (root + semi) % 12;
  if (/^maj7/.test(s)) return [at(0), at(4), at(11)];
  if (/^m7b5/.test(s)) return [at(0), at(3), at(6), at(10)];
  if (/^m7/.test(s)) return [at(0), at(3), at(10)];
  if (/^dim7/.test(s)) return [at(0), at(3), at(6), at(9)];
  if (/^dim/.test(s)) return [at(0), at(3), at(6)];
  if (/^aug/.test(s)) return [at(0), at(4), at(8)];
  if (/^sus2/.test(s)) return [at(0), at(2), at(7)];
  if (/^sus4/.test(s)) return [at(0), at(5), at(7)];
  if (/^sus/.test(s)) return [at(0), at(5), at(7)];
  if (/^7/.test(s)) return [at(0), at(4), at(10)];
  if (/^6/.test(s)) return [at(0), at(4), at(9)];
  if (/^m/.test(s)) return [at(0), at(3)];
  return [at(0), at(4)];
}

function playedNotes(shape: FretShape, tuning: number[]): number[] {
  const set = new Set<number>();
  shape.frets.forEach((fret, i) => {
    if (fret < 0) return;
    set.add(((tuning[i] + fret) % 12 + 12) % 12);
  });
  return [...set].sort((a, b) => a - b);
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const fmt = (notes: number[]) => notes.map((n) => NAMES[n]).join(' ');

function audit(label: string, db: Record<string, FretShape>, tuning: number[]): number {
  console.log(`\n=== ${label} ===`);
  let bad = 0;
  for (const [name, shape] of Object.entries(db)) {
    const expected = requiredNotes(name);
    const played = playedNotes(shape, tuning);
    const missing = expected.filter((e) => !played.includes(e));
    if (missing.length > 0) {
      console.error(`  BAD ${label} ${name}: played [${fmt(played)}], expected [${fmt(expected)}], missing [${fmt(missing)}]`);
      bad++;
    }
  }
  if (bad === 0) console.log(`  ${Object.keys(db).length} shapes ok.`);
  else console.log(`  ${bad} bad shape(s).`);
  return bad;
}

const total = audit('GUITAR', GUITAR_CHORDS, GUITAR_TUNING) + audit('UKULELE', UKULELE_CHORDS, UKULELE_TUNING);
process.exit(total === 0 ? 0 : 1);
