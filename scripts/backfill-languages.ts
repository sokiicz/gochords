/**
 * One-shot: walk all songs in Supabase, detect language from the lyrics,
 * and add a language code tag (cs/sk/en/es/de/pl) where missing.
 *
 * Reads credentials from D:/ai/Apps/Secrets/gochords.txt at runtime.
 * Run:  npm run backfill:languages -- --dry
 *       npm run backfill:languages
 *
 * Uses Supabase's PostgREST endpoint directly (no @supabase/supabase-js dependency
 * here, which avoids the Node-20-no-WebSocket realtime init issue and keeps the
 * script's surface tiny).
 */
import { detectLanguage, mergeLanguageTag, pickLanguageTag } from '../src/lib/language';
import { loadSupabaseCreds } from './_supabase-env';

interface SongRow {
  id: string;
  title: string;
  artist: string;
  source: string;
  tags: string[] | null;
  visibility: string;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const creds = loadSupabaseCreds({ requireServiceRole: true });
  if (!creds) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (writes need service role).');

  const headers = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    'Content-Type': 'application/json',
  };
  const restUrl = (path: string) => `${creds.url}/rest/v1/${path}`;

  const PAGE = 500;
  let offset = 0;
  let totalScanned = 0;
  let totalUpdated = 0;
  const skipped = { hasLang: 0, unknown: 0 };
  const langCounts: Record<string, number> = {};

  while (true) {
    const res = await fetch(
      restUrl(`songs?select=id,title,artist,source,tags,visibility&order=created_at.asc&offset=${offset}&limit=${PAGE}`),
      { headers },
    );
    if (!res.ok) throw new Error(`fetch songs failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as SongRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      totalScanned++;
      const tags = row.tags ?? [];
      if (pickLanguageTag(tags)) { skipped.hasLang++; continue; }
      const lang = detectLanguage(row.source ?? '');
      if (!lang) { skipped.unknown++; continue; }
      const nextTags = mergeLanguageTag(tags, lang);
      langCounts[lang] = (langCounts[lang] ?? 0) + 1;
      if (dry) {
        console.log(`[dry] ${row.id.slice(0, 8)}…  "${row.title}" — ${row.artist}  →  ${lang}`);
      } else {
        const up = await fetch(restUrl(`songs?id=eq.${row.id}`), {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ tags: nextTags }),
        });
        if (!up.ok) {
          console.error(`  fail ${row.id}: ${up.status} ${await up.text()}`);
          continue;
        }
        totalUpdated++;
        if (totalUpdated % 25 === 0) console.log(`  …${totalUpdated} updated`);
      }
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log('\n== summary ==');
  console.log(`scanned:        ${totalScanned}`);
  console.log(`already tagged: ${skipped.hasLang}`);
  console.log(`unknown lang:   ${skipped.unknown}`);
  console.log(`updated:        ${dry ? '(dry-run, none)' : totalUpdated}`);
  console.log(`by language:    ${JSON.stringify(langCounts)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
