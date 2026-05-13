# Deferred items

Three asks from the original bug list weren't shipped in batch 3. Each is a feature, not a fix, and each genuinely needs more design work or external infrastructure than a polish pass justifies.

## Strumming patterns

What the user wants: render strumming notation (down/up arrows, percussive X, accent dots) next to chord rows.

What's needed:
- A source-format decision. ChordPro doesn't standardize this. We could invent (e.g. `[D D U U D]` on its own line) or import from one of the popular tab-site conventions (UG uses ASCII glyphs like `D D U D U D D`).
- A renderer — probably an SVG row of arrow glyphs aligned to beat positions.
- A way to associate a pattern with a section: per-section `[Strum: D D U U D]` line, or a global default.

Out of scope here because the format choice locks in the data model and once shipped is hard to migrate.

## Auto-language tags

What the user wants: automatic `cz` / `en` / `es` tags inferred from lyrics.

What's needed:
- A language detector that works on short, fragmented text (lyrics break Markov / n-gram detectors). Options: `franc` (~30 kB minified, supports 200+ languages), `cld3-asm` (Google's, WASM ~1 MB), or a hand-rolled "diacritic + common-word" heuristic for the 4–5 languages this catalog will likely have.
- A point in the write pipeline (`insertSong` / `updateSong`) where the detection runs and merges into `tags`.
- A way to override (the detector is probabilistic — if the user typed it, respect it).

Out of scope here because adding a ~30 kB always-on dependency for tags is a deal we'd want to make deliberately, not as part of a UI-fix batch.

## Ultimate Guitar / arbitrary chord-URL import

What the user wants: paste a UG link, get the song imported.

What's needed:
- UG doesn't expose a public chord API and serves chord sheets via a React app with anti-scraping protections. Browser-side fetch is blocked by CORS; even a server-side scrape risks ToS breach and brittle selectors.
- Realistic path: a serverless function (Supabase Edge Function or similar) that scrapes the rendered HTML, extracts the chord block, and returns a structured `SongDraft`. Need per-site adapters (UG, Songsterr, chordie.com, e-chords).
- Plus rate limiting + caching so UG doesn't blacklist the IP.

Out of scope here because shipping a scraper has legal/operational cost that wants its own conversation, not a parser-fix branch.

A pragmatic in-between: a "paste raw text" import which is already there. Encourage users to copy the chord block from any site and paste — the parser handles ChordPro brackets, aligned chords-over-lyrics, and tab blocks.
