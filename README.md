# gochords

A free, local-first chord-sheet app. Paste any chord sheet, transpose, see chord diagrams, auto-scroll while you play.

> Status: wip — created 2026-05-06

## Features
- **Smart parser** — accepts `[Am]inline`, `{Am}`, `(Am)`, and chord-above-lyric formats; auto-detects `[Verse]` / `[Chorus]` section labels.
- **Transpose** — ±12 semitones, capo 0–7, enharmonic-aware (prefers flats for flat keys).
- **Canvas chord diagrams** — 30+ shapes with X/O markers, barre rendering, fingerings; theme-aware.
- **Auto-scroll** — speed 1–10; tap anywhere to stop.
- **Local-first** — songs and prefs persist in `localStorage`; no backend, no account needed.
- **Dark/light theme**, font size, mobile sidebar.

## Setup
```bash
npm install
npm run dev
```
Then open http://localhost:5173/gochords/ (Vite uses port 5173 by default).

## Build
```bash
npm run build         # outputs dist/
npm run preview       # serve dist/
```

## Deploy (GitHub Pages)
`vite.config.ts` already has `base: '/gochords/'`. After pushing, enable GitHub Pages on the `gh-pages` branch (or use the Pages action of your choice).

## Env vars
None required for the local-only app. Project secrets stub: `D:/ai/Apps/Secrets/gochords.txt` (not committed).

## Project layout
```
src/
  App.tsx                  # top-level state, layout
  components/              # Sidebar, ControlsBar, ChordSheet, ChordDiagramPopup, ImportDialog, Toasts
  lib/
    parser.ts              # raw text → { sections → lines → units }
    transpose.ts           # semitone math + enharmonic preference
    chords.ts              # chord shape DB + canvas renderer
    seedSongs.ts           # 3 demo songs (Wonderwall, Knockin', Nothing Else Matters)
    storage.ts             # localStorage wrapper + first-run seeding
```
