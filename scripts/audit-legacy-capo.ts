/**
 * Read-only audit. For every song with default_capo > 0, compare what the
 * OLD effectiveShift = transpose - capo would have rendered at the default
 * display state (transpose 0, capo = defaultCapo) versus what the CURRENT
 * code renders. Emits a CSV to stdout (and optionally a file).
 *
 * Old formula:  shift_old = 0 - defaultCapo = -defaultCapo
 * New formula:  shift_new = 0 + (defaultCapo - defaultCapo) = 0
 * Delta:        +defaultCapo  (every song with defaultCapo > 0 shifted up)
 *
 * For each song we also sample its first three unique chords and show both
 * spellings so the user can eyeball which songs were actually being authored
 * around the old behavior.
 *
 * Run:
 *   npx tsx scripts/audit-legacy-capo.ts                 # print to stdout
 *   npx tsx scripts/audit-legacy-capo.ts > capo-audit.csv
 *
 * Reads credentials from D:/ai/Apps/Secrets/gochords.txt.
 * This script never writes to the database.
 */
import { readFileSync } from 'node:fs';
import { parse, uniqueChords } from '../src/lib/parser';
import { transposeChord } from '../src/lib/transpose';

const SECRETS_PATH = 'D:/ai/Apps/Secrets/gochords.txt';

function loadSecrets(): Record<string, string> {
  const raw = readFileSync(SECRETS_PATH, 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  default_capo: number;
  source: string;
  visibility: string;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const secrets = loadSecrets();
  const url = secrets.SUPABASE_URL;
  const key = secrets.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in secrets file.');
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  const restUrl = (path: string) => `${url}/rest/v1/${path}`;

  const PAGE = 500;
  let offset = 0;
  const rows: SongRow[] = [];
  while (true) {
    const res = await fetch(
      restUrl(
        `songs?select=id,title,artist,default_capo,source,visibility` +
          `&default_capo=gt.0&order=created_at.asc&offset=${offset}&limit=${PAGE}`,
      ),
      { headers },
    );
    if (!res.ok) {
      throw new Error(`Supabase list failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as SongRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  // CSV header
  const header = [
    'id',
    'title',
    'artist',
    'visibility',
    'default_capo',
    'shift_old',
    'shift_new',
    'delta_semitones',
    'sample_chord_1_was',
    'sample_chord_1_now',
    'sample_chord_2_was',
    'sample_chord_2_now',
    'sample_chord_3_was',
    'sample_chord_3_now',
  ];
  process.stdout.write(header.join(',') + '\n');

  let moved = 0;
  for (const r of rows) {
    const defaultCapo = r.default_capo;
    const shiftOld = -defaultCapo; // 0 - defaultCapo
    const shiftNew = 0; //              0 + (defaultCapo - defaultCapo)
    const delta = shiftNew - shiftOld; // = defaultCapo
    if (delta === 0) continue; // shouldn't happen for default_capo > 0, but be safe.
    moved += 1;

    const parsed = parse(r.source);
    const chords = uniqueChords(parsed).slice(0, 3);
    const samples: Array<[string, string]> = chords.map((c) => {
      // c is already the "new" default rendering (shift_new = 0 → unchanged).
      // The "old" default rendering is c transposed by shiftOld (= -defaultCapo).
      // shiftOld is always negative here, so prefer flat spellings.
      const wasUnderOld = transposeChord(c, shiftOld, true);
      return [wasUnderOld, c];
    });
    while (samples.length < 3) samples.push(['', '']);

    const out = [
      r.id,
      r.title,
      r.artist ?? '',
      r.visibility,
      String(defaultCapo),
      String(shiftOld),
      String(shiftNew),
      String(delta),
      samples[0][0], samples[0][1],
      samples[1][0], samples[1][1],
      samples[2][0], samples[2][1],
    ].map(csvEscape);
    process.stdout.write(out.join(',') + '\n');
  }

  process.stderr.write(
    `\nScanned ${rows.length} songs with default_capo > 0. ${moved} have a non-zero default-display delta.\n` +
      `Every such song now renders at the source pitch by default. Under the old code, the\n` +
      `same song rendered transposed DOWN by its default_capo semitones. Review per-song\n` +
      `whether the source was authored expecting the old behavior.\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`Audit failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
