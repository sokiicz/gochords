# Deferred items

Of the three originally deferred items, two shipped in batch 5 with the explicit scope tradeoffs documented below. UG-URL scraping remains the one genuine deferral.

## Strumming patterns — shipped in batch 5

The parser now recognizes:
- Lines starting with `Strum:` / `Pattern:` / `Rytmus:` (case-insensitive)
- Or any line that is *only* strum glyphs and has ≥3 strokes (so a lone `D` is still treated as a chord)

Glyph alphabet: `D`/`↓` = downstroke, `U`/`↑` = upstroke, `X`/`x` = muted, `.`/`·`/`-` = rest, `|`/`/` = beat separator.

Rendered as a styled inline row (`.sheet-strum`) — accent-colored arrows for strokes, dim for rests, monospace.

## Auto-language tag — shipped in batch 5

Heuristic detector (`src/lib/language.ts`) covering `cs`, `sk`, `en`, `es`, `de`, `pl`. Scores against compact stopword lists plus diacritic signatures (e.g. one `ř` makes Czech nearly certain). Requires a clear winner — won't suggest if signal is ambiguous.

Surfaced as a one-tap "Add language tag {cs}" pill under the Tags input in the song form. Never auto-applies; the user opts in.

No new dependency — runs in ~1 ms on a typical lyric.

## Ultimate Guitar — partially shipped, full URL import still deferred

**What works now:** if you paste UG's actual chord-block markup (`[ch]Em[/ch] [ch]D[/ch] ...`), the parser's `preprocessSource()` rewrites it to `[Em] [D] ...` and the rest of the pipeline handles it as native inline-chord text. Also handles ChordPro `{c:Em}` for free. This covers the typical "copy from UG, paste into our form" flow.

**What is still deferred:** "paste a URL and pull the song." This needs:
- A serverless function that fetches the rendered UG page (browser fetch is CORS-blocked, public CORS proxies are unreliable for production).
- Per-site adapters (UG's React app serializes the chord block into a JSON blob in a `<script>`; Songsterr / e-chords / chordie each have their own DOM).
- Rate limiting + caching so the source site doesn't ban the IP.

Realistic future path: a Supabase Edge Function that takes `{ url }`, fetches it server-side, returns a structured `SongDraft`. ~1–2 days of work, plus monitoring for selector drift. Not happening in a UI-fix batch.
