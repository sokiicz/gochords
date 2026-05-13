// Sanity tests for search.ts. Run: npm test
import { allArtists, matches, normalize, parseArtists, slugify } from '../src/lib/search';

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

// --- normalize ---
check("normalize: 'Don't' === 'dont'", normalize("Don't"), normalize('Dont'));
check("normalize: diacritics", normalize('Kača Štivín'), normalize('kaca stivin'));
check("normalize: & equals 'and' equals 'a'", normalize('Sun & Moon'), normalize('Sun and Moon'));
check("normalize: czech 'a'", normalize('Sun a Moon'), normalize('Sun and Moon'));
check("normalize: punctuation noise", normalize("Hey-Hey! (Wonder)"), 'hey hey wonder');
check("normalize: empty/nullish", normalize(null), '');

// --- matches ---
check("matches: dont -> Don't", matches("dont", "Don't Stop Me Now"), true);
check("matches: kaca -> Kača", matches('kaca', 'Kača Štivín'), true);
check("matches: 'sun moon' -> 'Sun & Moon'", matches('sun moon', 'Sun & Moon'), true);
check("matches: requires every token", matches('foo bar', 'foo only'), false);
check("matches: empty needle matches", matches('', 'anything'), true);

// --- slugify ---
check("slugify: ascii", slugify('Bob Dylan'), 'bob-dylan');
check("slugify: diacritics", slugify('Kača Štivín'), 'kaca-stivin');
check("slugify: ampersand", slugify('Hall & Oates'), 'hall-oates');
check("slugify: empty -> unknown", slugify(''), 'unknown');

// --- parseArtists ---
check("parseArtists: plain", parseArtists('Oasis'), { primary: 'Oasis', featured: [] });
check("parseArtists: ft.", parseArtists('Drake ft. Rihanna'), { primary: 'Drake', featured: ['Rihanna'] });
check("parseArtists: feat.", parseArtists('Drake feat. Rihanna'), { primary: 'Drake', featured: ['Rihanna'] });
check("parseArtists: featuring", parseArtists('Drake featuring Rihanna'), { primary: 'Drake', featured: ['Rihanna'] });
check("parseArtists: multiple with &", parseArtists('Drake ft. Rihanna & Future'), { primary: 'Drake', featured: ['Rihanna', 'Future'] });
check("parseArtists: multiple with comma", parseArtists('Drake ft. Rihanna, Future'), { primary: 'Drake', featured: ['Rihanna', 'Future'] });
check("parseArtists: empty", parseArtists(''), { primary: '', featured: [] });

check("allArtists: includes featured", allArtists('Drake ft. Rihanna & Future'), ['Drake', 'Rihanna', 'Future']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
