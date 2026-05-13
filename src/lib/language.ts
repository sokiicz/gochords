/**
 * Lightweight language detection for song lyrics.
 *
 * We don't ship a 30 kB detector for this. Instead we score the input against
 * compact stoplists + diacritic signatures for the languages this catalog
 * actually sees. Returns the BCP-47-style language code (e.g. 'cs') or null
 * if no language clearly wins.
 */

export type LangCode = 'cs' | 'sk' | 'en' | 'es' | 'de' | 'pl' | 'it';

export const LANG_CODES: LangCode[] = ['cs', 'sk', 'en', 'es', 'de', 'pl', 'it'];
export const LANG_LABELS: Record<LangCode, string> = {
  cs: 'Čeština',
  sk: 'Slovenčina',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  pl: 'Polski',
  it: 'Italiano',
};

const LANG_TAG_SET = new Set<string>(LANG_CODES);

/** Returns the existing language tag in the list, if any, regardless of case. */
export function pickLanguageTag(tags: string[]): LangCode | null {
  for (const t of tags) {
    const tl = t.trim().toLowerCase();
    if (LANG_TAG_SET.has(tl)) return tl as LangCode;
  }
  return null;
}

/** Merge a detected language into a tag list iff no language tag is present. Returns a new array. */
export function mergeLanguageTag(tags: string[], detected: LangCode | null): string[] {
  if (!detected) return tags;
  if (pickLanguageTag(tags)) return tags;
  return [...tags, detected];
}

const STOPWORDS: Record<LangCode, string[]> = {
  cs: ['a', 'je', 'se', 'na', 'v', 've', 'do', 'ne', 'to', 'co', 'jak', 'kdy', 'už', 'jen', 'tak', 'ale', 'ten', 'ta', 'to', 'my', 'vy', 'oni', 'jsem', 'jsi', 'jsme', 'jste', 'jsou', 'byl', 'byla', 'bylo', 'být', 'mít', 'pro', 'mě', 'tě', 'mi', 'ti', 'mu', 'jí', 'něco', 'nic', 'kde', 'kdo', 'protože'],
  sk: ['a', 'je', 'sa', 'na', 'v', 'vo', 'do', 'nie', 'to', 'čo', 'ako', 'len', 'tak', 'ale', 'ten', 'tá', 'sme', 'ste', 'sú', 'bol', 'bola', 'bolo', 'byť', 'mať', 'pre', 'aj', 'iba', 'mne', 'teba', 'kde', 'keď'],
  en: ['the', 'a', 'and', 'is', 'i', 'you', 'to', 'of', 'in', 'it', 'that', 'on', 'for', 'with', 'as', 'was', 'be', 'this', 'have', 'are', 'we', 'they', 'my', 'your', 'me', 'so', 'all', 'just', 'one', 'never', 'know', 'love', 'don', 'cause'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'a', 'en', 'es', 'un', 'una', 'por', 'con', 'no', 'se', 'yo', 'tú', 'mi', 'me', 'te', 'lo', 'le', 'su', 'al', 'del', 'más', 'pero', 'como', 'cuando', 'todo', 'eres', 'ser', 'estoy', 'corazón'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ich', 'du', 'nicht', 'ein', 'eine', 'zu', 'sie', 'er', 'wir', 'mir', 'dich', 'mich', 'auf', 'mit', 'so', 'wenn', 'noch', 'aber', 'auch', 'für', 'von', 'sein', 'haben'],
  pl: ['i', 'a', 'w', 'na', 'nie', 'to', 'jest', 'się', 'że', 'ja', 'ty', 'on', 'my', 'wy', 'co', 'jak', 'tak', 'ale', 'już', 'tylko', 'mnie', 'cię', 'być', 'mieć', 'kiedy', 'gdzie'],
  it: ['il', 'la', 'lo', 'gli', 'le', 'di', 'che', 'e', 'è', 'un', 'una', 'in', 'per', 'con', 'non', 'io', 'tu', 'sono', 'sei', 'mio', 'mia', 'ti', 'amo', 'più', 'come', 'quando', 'così', 'già', 'però', 'cuore'],
};

// Distinctive accent letters per language. Hits move the needle further than stopwords
// because a single "ř" is essentially a smoking gun for Czech.
const DIACRITIC_BONUS: Record<LangCode, RegExp[]> = {
  cs: [/ř/i, /ů/i, /ě/i, /č/i, /š/i, /ž/i, /ý/i],
  sk: [/ô/i, /ä/i, /ĺ/i, /ŕ/i, /ľ/i, /ť/i, /ď/i, /ň/i],
  en: [],
  es: [/ñ/i, /¿/, /¡/, /áa|óo|íi|ée|úu/i],
  de: [/ß/, /ä/i, /ö/i, /ü/i],
  pl: [/ł/i, /ą/i, /ę/i, /ś/i, /ż/i, /ź/i, /ć/i, /ń/i],
  it: [/è|é/i, /ì/i, /ò/i, /ù/i],
};

/** Strip chord tokens / sections / strum rows from text to focus scoring on actual lyrics. */
function lyricsOnly(source: string): string {
  return source
    .replace(/\[[^\]]+\]/g, '')                          // [Em] [Verse 1] [ch]Em[/ch]
    .replace(/\{[^}]+\}/g, '')
    .replace(/^\s*(?:strum|pattern|rytmus).*$/gim, '')   // strumming rows
    .replace(/^[^\sa-zA-Záčďéěíňóřšťúůýžäöüßñłąęśżźć]+$/gm, '') // tab/whitespace-only lines
    .toLowerCase();
}

export function detectLanguage(source: string): LangCode | null {
  const text = lyricsOnly(source);
  if (text.replace(/\s/g, '').length < 24) return null;

  const tokens = text.split(/[^a-záčďéěíňóřšťúůýžäöüßñłąęśżźć]+/i).filter(Boolean);
  if (tokens.length < 6) return null;

  const tokenSet = new Set(tokens);

  const scores: Record<LangCode, number> = { cs: 0, sk: 0, en: 0, es: 0, de: 0, pl: 0, it: 0 };
  for (const lang of Object.keys(STOPWORDS) as LangCode[]) {
    for (const w of STOPWORDS[lang]) if (tokenSet.has(w)) scores[lang] += 1;
    for (const re of DIACRITIC_BONUS[lang]) if (re.test(text)) scores[lang] += 3;
  }

  let best: LangCode | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const lang of Object.keys(scores) as LangCode[]) {
    if (scores[lang] > bestScore) {
      runnerUp = bestScore;
      bestScore = scores[lang];
      best = lang;
    } else if (scores[lang] > runnerUp) {
      runnerUp = scores[lang];
    }
  }
  // Require a clear winner; otherwise return null (caller leaves tags untouched).
  if (bestScore < 4 || bestScore - runnerUp < 2) return null;
  return best;
}
