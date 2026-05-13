/**
 * Search normalization helpers.
 *
 * normalize(s) collapses everything users intuitively expect to ignore when
 * searching for a song or artist:
 *   - diacritics ("Kača" === "kaca")
 *   - case
 *   - apostrophes and curly quotes ("don't" === "dont" === "don´t")
 *   - the connectives &, "and", "a" — folded to a single space so
 *     "Sun and Moon" === "sun & moon" === "sun a moon" (Czech "a")
 *   - punctuation and double spaces
 */
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return (
    s
      // Strip diacritics: NFKD then drop combining marks.
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Quote variants → nothing
      .replace(/['’‘`´']/g, '')
      // Standalone connectives → space
      .replace(/\s*(?:&|\+)\s*/g, ' ')
      .replace(/\b(?:and|a)\b/g, ' ')
      // Remaining non-alphanum (punctuation) → space
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Match-token test: does haystack contain every whitespace-split token of needle? */
export function matches(needle: string, ...haystacks: (string | null | undefined)[]): boolean {
  const n = normalize(needle);
  if (n === '') return true;
  const hay = haystacks.map(normalize).join(' ');
  return n.split(' ').every((tok) => hay.includes(tok));
}

/** Slug for URLs: ASCII-only, dashes, ≤64 chars. */
export function slugify(s: string): string {
  return normalize(s).replace(/\s+/g, '-').slice(0, 64) || 'unknown';
}

/** Parse "Artist ft. X, Y" / "Artist feat. X & Y" → primary + featured[] */
export function parseArtists(raw: string | null | undefined): { primary: string; featured: string[] } {
  const src = (raw ?? '').trim();
  if (!src) return { primary: '', featured: [] };
  // Split on ft./feat./featuring. Keep first chunk as primary.
  const parts = src.split(/\s+(?:ft\.?|feat\.?|featuring)\s+/i);
  const primary = parts[0].trim();
  const rest = parts.slice(1).join(' ');
  if (!rest) return { primary, featured: [] };
  // Split featured on , / & / "and" (whole word).
  const featured = rest
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return { primary, featured };
}

/** All artist names (primary + featured) for matching/searching purposes. */
export function allArtists(raw: string | null | undefined): string[] {
  const { primary, featured } = parseArtists(raw);
  return [primary, ...featured].filter(Boolean);
}
