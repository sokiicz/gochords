/**
 * Generates the default Open Graph card at public/og-default.png (1200×630).
 *
 * Brand-consistent with the parchment theme: cream background, accent-green
 * mark, JetBrains Mono wordmark + tagline. Run after editing the SVG below:
 *   npm run build:og
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbf6e9"/>
      <stop offset="100%" stop-color="#f4eccc"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Accent corner accent -->
  <rect x="0" y="0" width="1200" height="12" fill="#5e7c4d"/>
  <rect x="0" y="618" width="1200" height="12" fill="#5e7c4d"/>

  <!-- Mark -->
  <g transform="translate(120 195)">
    <rect width="240" height="240" rx="48" fill="#5e7c4d"/>
    <text x="120" y="170" text-anchor="middle"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="180" font-weight="700" fill="#f7f0dc">♪</text>
  </g>

  <!-- Wordmark -->
  <text x="420" y="280"
        font-family="'Fraunces', Georgia, serif"
        font-size="120" font-weight="700" fill="#1f2a1a">GoChords</text>
  <text x="420" y="350"
        font-family="'Inter', -apple-system, system-ui, sans-serif"
        font-size="36" font-weight="500" fill="#5e7c4d">Chord sheets in your browser</text>

  <!-- Subtitle -->
  <text x="420" y="450"
        font-family="'Inter', -apple-system, system-ui, sans-serif"
        font-size="28" fill="#5b5240">Import · Transpose · Capo · Play</text>

  <!-- URL pill -->
  <g transform="translate(420 490)">
    <rect width="260" height="56" rx="28" fill="#5e7c4d"/>
    <text x="130" y="38" text-anchor="middle"
          font-family="'JetBrains Mono', monospace"
          font-size="24" font-weight="500" fill="#f7f0dc">gochords.online</text>
  </g>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(SVG), { density: 144 })
    .resize(1200, 630)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile('public/og-default.png', png);
  process.stdout.write(`public/og-default.png  (${png.length.toLocaleString()} bytes)\n`);
}

main().catch((e) => {
  process.stderr.write(`build-og-image failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
