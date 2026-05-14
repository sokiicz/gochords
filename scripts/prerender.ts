/**
 * Post-build pre-render. For each canonical URL we care about for SEO,
 * writes a copy of dist/index.html at the clean path with route-specific
 * <title>, <meta description>, canonical, and OG/Twitter tags swapped in.
 *
 * Targets:
 *   /browse/index.html
 *   /song/<id>/index.html       (top N by like_count, default 100)
 *   /artist/<slug>/index.html   (every unique artist among indexed songs)
 *   /u/<handle>/index.html      (every profile with a handle)
 *
 * Also copies dist/index.html → dist/404.html so any non-pre-rendered route
 * still 200s on GitHub Pages and the path-to-hash bridge takes over.
 *
 * Credentials in D:/ai/Apps/Secrets/gochords.txt. If missing or fetch fails,
 * still writes 404.html (and exits 0) so the build doesn't break on a fresh
 * clone or in a TLS-broken CI environment.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { slugify } from '../src/lib/search';
import { loadSupabaseCreds } from './_supabase-env';

const SITE = 'https://gochords.online';
const DIST = 'dist';
const TOP_N_SONGS = 100;

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;',
  );
}

interface Meta {
  title: string;
  description: string;
  canonical: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  jsonLd?: object;
}

function applyMeta(shell: string, m: Meta): string {
  const img = m.image || `${SITE}/og-default.png`;
  const type = m.type || 'website';
  const ld = m.jsonLd
    ? `<script type="application/ld+json" id="gochords-jsonld">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  const tags = `
    <meta name="description" content="${esc(m.description)}" />
    <link rel="canonical" href="${esc(m.canonical)}" />
    <meta property="og:title" content="${esc(m.title)}" />
    <meta property="og:description" content="${esc(m.description)}" />
    <meta property="og:url" content="${esc(m.canonical)}" />
    <meta property="og:image" content="${esc(img)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="GoChords" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(m.title)}" />
    <meta name="twitter:description" content="${esc(m.description)}" />
    <meta name="twitter:image" content="${esc(img)}" />
    ${ld}
  `.trim();
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/(<\/head>)/, `${tags}\n  $1`);
}

function writeRoute(path: string, html: string) {
  const dir = `${DIST}${path}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, html);
}

function firstLyrics(source: string): string {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[\[\{]/.test(l) && !/^(verse|chorus|bridge|intro|outro|pre-chorus|interlude|solo)/i.test(l))
    .slice(0, 2)
    .join(' ')
    .slice(0, 160);
}

async function main() {
  const shellPath = `${DIST}/index.html`;
  if (!existsSync(shellPath)) {
    console.warn(`prerender: no ${shellPath} — skipping (run after vite build)`);
    return;
  }
  const shell = readFileSync(shellPath, 'utf8');

  // /404.html — GH Pages SPA fallback. Same shell, same bridge, no specific meta.
  writeFileSync(`${DIST}/404.html`, shell);

  // /browse — catalog landing.
  writeRoute('/browse', applyMeta(shell, {
    title: 'Public chord sheets | GoChords',
    description: 'Browse public chord sheets on GoChords — transpose, change capo, and play along in your browser.',
    canonical: `${SITE}/browse`,
  }));

  const creds = loadSupabaseCreds();
  if (!creds) {
    console.warn('prerender: no Supabase credentials — wrote /browse + /404.html only');
    return;
  }

  const headers = { apikey: creds.key, Authorization: `Bearer ${creds.key}` };
  const rest = (path: string) => `${creds.url}/rest/v1/${path}`;

  let songs: Array<{ id: string; title: string; artist: string; source: string }>;
  try {
    const r = await fetch(
      rest(`songs?select=id,title,artist,source&visibility=eq.public&order=like_count.desc.nullslast&limit=${TOP_N_SONGS}`),
      { headers },
    );
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    songs = await r.json() as typeof songs;
  } catch (e) {
    console.warn(`prerender: fetch songs failed (${(e as Error).message}) — wrote /browse + /404.html only`);
    return;
  }

  const artists = new Map<string, string>(); // slug → display name
  for (const s of songs) {
    const a = (s.artist || '').trim();
    if (!a) continue;
    const slug = slugify(a);
    if (slug && !artists.has(slug)) artists.set(slug, a);
  }

  for (const s of songs) {
    const canonical = `${SITE}/song/${s.id}`;
    writeRoute(`/song/${s.id}`, applyMeta(shell, {
      title: `${s.title} — ${s.artist} chords | GoChords`,
      description: firstLyrics(s.source) || `${s.title} by ${s.artist}. Chord sheet on GoChords — transpose, capo, and play in your browser.`,
      canonical,
      type: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'MusicComposition',
        name: s.title,
        url: canonical,
        composer: s.artist ? { '@type': 'MusicGroup', name: s.artist } : undefined,
      },
    }));
  }

  for (const [slug, name] of artists) {
    const canonical = `${SITE}/artist/${slug}`;
    writeRoute(`/artist/${slug}`, applyMeta(shell, {
      title: `${name} chords & tabs | GoChords`,
      description: `Chord sheets for songs by ${name} on GoChords. Transpose, change capo, and play along in your browser.`,
      canonical,
      jsonLd: { '@context': 'https://schema.org', '@type': 'MusicGroup', name, url: canonical },
    }));
  }

  // Profiles with handles
  let profileCount = 0;
  try {
    const r = await fetch(rest('profiles?select=handle,display_name&handle=not.is.null'), { headers });
    if (r.ok) {
      const profiles = await r.json() as Array<{ handle: string; display_name: string | null }>;
      for (const p of profiles) {
        if (!p.handle) continue;
        const name = p.display_name?.trim() || `@${p.handle}`;
        const canonical = `${SITE}/u/${p.handle}`;
        writeRoute(`/u/${encodeURIComponent(p.handle)}`, applyMeta(shell, {
          title: `${name}'s chord sheets | GoChords`,
          description: `Chord sheets contributed by ${name} on GoChords.`,
          canonical,
          type: 'profile',
          jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name, alternateName: `@${p.handle}`, url: canonical },
        }));
        profileCount++;
      }
    }
  } catch { /* profile fetch is best-effort */ }

  console.log(`prerender: wrote /browse, /404.html, ${songs.length} songs, ${artists.size} artists, ${profileCount} profiles`);
}

main().catch((e) => { console.error(e); process.exit(1); });
