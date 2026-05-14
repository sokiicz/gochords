/**
 * Build-time sitemap generator. Reads public songs/artists/profiles from Supabase
 * and writes `public/sitemap.xml` with canonical clean URLs:
 *   /                  homepage / browse
 *   /song/<id>         each public song
 *   /artist/<slug>     each unique artist
 *   /u/<handle>        each public profile with a handle
 *
 * Hash routing still serves the app today; Sprint 2.5 adds the path-to-hash bridge
 * + per-route meta so these clean URLs become canonical.
 *
 * Credentials read from D:/ai/Apps/Secrets/gochords.txt. If the file is missing
 * (e.g. in CI without secrets), writes a minimal homepage-only sitemap and exits 0
 * so the build never breaks on a fresh clone.
 *
 * Run:  npm run sitemap
 *       (also runs automatically as part of `npm run build`)
 */
import { writeFileSync } from 'node:fs';
import { slugify } from '../src/lib/search';
import { loadSupabaseCreds } from './_supabase-env';

const SITE = 'https://gochords.online';
const OUT_PATH = 'public/sitemap.xml';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '&' ? '&amp;' :
    c === "'" ? '&apos;' : '&quot;',
  );
}

interface UrlEntry { loc: string; lastmod?: string; changefreq?: string; priority?: number; }

function renderSitemap(urls: UrlEntry[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const u of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(u.loc)}</loc>`);
    if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`);
    if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
    if (u.priority != null) lines.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return lines.join('\n') + '\n';
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const urls: UrlEntry[] = [
    { loc: `${SITE}/`, lastmod: today, changefreq: 'daily', priority: 1.0 },
  ];

  const creds = loadSupabaseCreds();
  if (!creds) {
    console.warn('sitemap: no Supabase credentials — writing homepage-only sitemap');
    writeFileSync(OUT_PATH, renderSitemap(urls));
    return;
  }

  const headers = { apikey: creds.key, Authorization: `Bearer ${creds.key}` };
  const rest = (path: string) => `${creds.url}/rest/v1/${path}`;

  // Public songs (paginated to keep memory bounded; 1000 per page is the REST default cap).
  const PAGE = 1000;
  const songRows: Array<{ id: string; artist: string; updated_at: string }> = [];
  try {
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetch(
        rest(`songs?select=id,artist,updated_at&visibility=eq.public&order=updated_at.desc&offset=${offset}&limit=${PAGE}`),
        { headers },
      );
      if (!res.ok) throw new Error(`fetch songs: ${res.status} ${await res.text()}`);
      const batch = (await res.json()) as typeof songRows;
      songRows.push(...batch);
      if (batch.length < PAGE) break;
    }
  } catch (e) {
    console.warn(`sitemap: fetch songs failed (${(e as Error).message}) — writing homepage-only sitemap`);
    writeFileSync(OUT_PATH, renderSitemap(urls));
    return;
  }

  for (const s of songRows) {
    urls.push({
      loc: `${SITE}/song/${s.id}`,
      lastmod: s.updated_at.slice(0, 10),
      changefreq: 'weekly',
      priority: 0.7,
    });
  }

  // Unique artists derived from songs (artists don't live in their own table).
  const artistSlugs = new Set<string>();
  for (const s of songRows) {
    if (!s.artist) continue;
    const slug = slugify(s.artist);
    if (slug) artistSlugs.add(slug);
  }
  for (const slug of artistSlugs) {
    urls.push({ loc: `${SITE}/artist/${slug}`, changefreq: 'weekly', priority: 0.6 });
  }

  // Profiles with handles.
  const profileRes = await fetch(
    rest('profiles?select=handle&handle=not.is.null'),
    { headers },
  );
  if (profileRes.ok) {
    const profiles = (await profileRes.json()) as Array<{ handle: string | null }>;
    for (const p of profiles) {
      if (!p.handle) continue;
      urls.push({ loc: `${SITE}/u/${encodeURIComponent(p.handle)}`, changefreq: 'weekly', priority: 0.5 });
    }
  }

  writeFileSync(OUT_PATH, renderSitemap(urls));
  console.log(`sitemap: wrote ${urls.length} URLs to ${OUT_PATH} (${songRows.length} songs, ${artistSlugs.size} artists)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
