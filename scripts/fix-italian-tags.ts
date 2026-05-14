/**
 * Sprint 1.2 — Ensure every Italian song carries the `it` language tag.
 *
 * The auto-detect catches most Italian songs (Sprint 1.5), but very short titles
 * like "Ti Amo" don't have enough lyrics for `detectLanguage()` to commit. This
 * script targets that gap with an explicit title list. PostgREST PATCH; idempotent.
 *
 *   npm run fix:italian-tags -- --dry
 *   npm run fix:italian-tags
 */
import { loadSupabaseCreds } from './_supabase-env';
import { mergeLanguageTag, pickLanguageTag } from '../src/lib/language';

// Songs whose lyrics are too short / chord-heavy for auto-detect but are clearly Italian.
// Extend this list as new false-negatives surface; the script is idempotent.
const TITLES_TO_TAG_AS_IT = [
  'Ti Amo',
];

async function main() {
  const dry = process.argv.includes('--dry');
  const creds = loadSupabaseCreds({ requireServiceRole: true });
  if (!creds) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (writes need service role).');

  const headers = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    'Content-Type': 'application/json',
  };
  const rest = (path: string) => `${creds.url}/rest/v1/${path}`;

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const title of TITLES_TO_TAG_AS_IT) {
    // PostgREST: title=eq.<URL-encoded>
    const url = rest(`songs?select=id,title,tags&title=eq.${encodeURIComponent(title)}`);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch "${title}": ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ id: string; title: string; tags: string[] | null }>;

    if (rows.length === 0) { missing++; console.log(`  miss  "${title}" (no row matched)`); continue; }

    for (const row of rows) {
      const tags = row.tags ?? [];
      if (pickLanguageTag(tags) === 'it') { skipped++; console.log(`  skip  "${row.title}" (already 'it')`); continue; }
      if (pickLanguageTag(tags)) { skipped++; console.log(`  skip  "${row.title}" (tagged as ${pickLanguageTag(tags)}, not overwriting)`); continue; }
      const next = mergeLanguageTag(tags, 'it');
      if (dry) {
        console.log(`  [dry] "${row.title}" → ${JSON.stringify(next)}`);
        continue;
      }
      const up = await fetch(rest(`songs?id=eq.${row.id}`), {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ tags: next }),
      });
      if (!up.ok) { console.error(`  FAIL  "${row.title}": ${up.status} ${await up.text()}`); continue; }
      updated++;
      console.log(`  ok    "${row.title}" → ${JSON.stringify(next)}`);
    }
  }

  console.log(`\n== summary ==\nupdated: ${dry ? '(dry, none)' : updated}\nskipped: ${skipped}\nmissing: ${missing}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
