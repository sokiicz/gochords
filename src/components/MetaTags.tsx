import { useEffect } from 'react';

interface Props {
  /** Full page title. Falls back to "GoChords — Chord sheets in your browser". */
  title?: string;
  /** Meta description (≤160 chars works best for SERP snippets). */
  description?: string;
  /** Canonical URL for the page (clean path, no hash). */
  canonical?: string;
  /** Absolute URL for the OG/Twitter card image. Defaults to /og-default.png. */
  image?: string;
  /** og:type. Defaults to 'website'; use 'article' for songs. */
  type?: 'website' | 'article' | 'profile';
  /** Optional JSON-LD payload to inject as a <script type="application/ld+json">. */
  jsonLd?: object;
}

const DEFAULT_TITLE = 'GoChords — Chord sheets in your browser';
const DEFAULT_DESC = 'GoChords — import, transpose, and play chord sheets in your browser.';
const SITE = 'https://gochords.online';

/**
 * Imperatively writes per-route meta tags to document.head. Each `<MetaTags>`
 * mount replaces the same set of tags (keyed by name/property) so a SPA route
 * change cleanly updates them without leaking duplicates.
 *
 * Note: For real crawler/SEO benefit, Sprint 2.5 also needs to pre-render
 * these tags into the served HTML — search engines often don't execute JS.
 */
export function MetaTags({ title, description, canonical, image, type = 'website', jsonLd }: Props) {
  useEffect(() => {
    const t = title || DEFAULT_TITLE;
    const d = description || DEFAULT_DESC;
    const img = image || `${SITE}/og-default.png`;
    const url = canonical || (typeof window !== 'undefined' ? `${SITE}${window.location.pathname}` : SITE);

    document.title = t;

    upsertMeta({ name: 'description' }, d);
    upsertLink('canonical', url);

    upsertMeta({ property: 'og:title' }, t);
    upsertMeta({ property: 'og:description' }, d);
    upsertMeta({ property: 'og:url' }, url);
    upsertMeta({ property: 'og:image' }, img);
    upsertMeta({ property: 'og:type' }, type);
    upsertMeta({ property: 'og:site_name' }, 'GoChords');

    upsertMeta({ name: 'twitter:card' }, 'summary_large_image');
    upsertMeta({ name: 'twitter:title' }, t);
    upsertMeta({ name: 'twitter:description' }, d);
    upsertMeta({ name: 'twitter:image' }, img);

    upsertJsonLd('gochords-jsonld', jsonLd ?? null);
  }, [title, description, canonical, image, type, jsonLd]);

  return null;
}

function upsertJsonLd(id: string, payload: object | null) {
  const existing = document.getElementById(id);
  if (!payload) { if (existing) existing.remove(); return; }
  const el = existing ?? document.createElement('script');
  el.setAttribute('type', 'application/ld+json');
  el.setAttribute('id', id);
  el.textContent = JSON.stringify(payload);
  if (!existing) document.head.appendChild(el);
}

function upsertMeta(attr: { name?: string; property?: string }, content: string) {
  const key = attr.name ? `name="${attr.name}"` : `property="${attr.property}"`;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}]`);
  if (!el) {
    el = document.createElement('meta');
    if (attr.name) el.setAttribute('name', attr.name);
    if (attr.property) el.setAttribute('property', attr.property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// ---------- Per-route content helpers ----------

export function songMeta(song: { id: string; title: string; artist: string; source?: string }): Props {
  const firstLyrics = (song.source ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[\[\{]/.test(l) && !/^(verse|chorus|bridge|intro|outro|pre-chorus|interlude|solo)/i.test(l))
    .slice(0, 2)
    .join(' ')
    .slice(0, 160);
  const canonical = `${SITE}/song/${song.id}`;
  return {
    title: `${song.title} — ${song.artist} chords | GoChords`,
    description: firstLyrics || `${song.title} by ${song.artist}. Chord sheet on GoChords — transpose, capo, and play in your browser.`,
    canonical,
    type: 'article',
    // schema.org/MusicComposition is the right vocab for "song with lyrics + chords",
    // distinct from MusicRecording (a specific performance). Google maps both to
    // music rich results when present.
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'MusicComposition',
      name: song.title,
      url: canonical,
      composer: song.artist ? { '@type': 'MusicGroup', name: song.artist } : undefined,
      inLanguage: undefined, // populated upstream if we ever pass it in
    },
  };
}

export function artistMeta(name: string, slug: string): Props {
  const canonical = `${SITE}/artist/${slug}`;
  return {
    title: `${name} chords & tabs | GoChords`,
    description: `Chord sheets for songs by ${name} on GoChords. Transpose, change capo, and play along in your browser.`,
    canonical,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'MusicGroup',
      name,
      url: canonical,
    },
  };
}

export function userProfileMeta(handle: string, displayName?: string | null): Props {
  const name = displayName?.trim() || `@${handle}`;
  const canonical = `${SITE}/u/${handle}`;
  return {
    title: `${name}'s chord sheets | GoChords`,
    description: `Chord sheets contributed by ${name} on GoChords.`,
    canonical,
    type: 'profile',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      alternateName: `@${handle}`,
      url: canonical,
    },
  };
}

export function catalogMeta(): Props {
  return {
    title: 'Public chord sheets | GoChords',
    description: 'Browse public chord sheets on GoChords — transpose, change capo, and play along in your browser.',
    canonical: `${SITE}/browse`,
  };
}
