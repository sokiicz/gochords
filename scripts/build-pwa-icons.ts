/**
 * One-shot helper. Rasterises the SVG app icons to PNG at the two sizes
 * Chrome's installability check looks for (192, 512), in both the "any"
 * and "maskable" variants. Output goes alongside the source SVGs in
 * `public/` so the build picks them up automatically.
 *
 * Run after editing public/icon*.svg:
 *   npm run build:pwa-icons
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

interface Job {
  svg: string;
  out: string;
  size: number;
}

const JOBS: Job[] = [
  { svg: 'public/icon.svg',          out: 'public/icon-192.png',          size: 192 },
  { svg: 'public/icon.svg',          out: 'public/icon-512.png',          size: 512 },
  { svg: 'public/icon-maskable.svg', out: 'public/icon-maskable-192.png', size: 192 },
  { svg: 'public/icon-maskable.svg', out: 'public/icon-maskable-512.png', size: 512 },
];

async function main() {
  for (const job of JOBS) {
    const buf = await readFile(job.svg);
    const png = await sharp(buf, { density: 384 })
      .resize(job.size, job.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(job.out, png);
    process.stdout.write(`${job.out}  (${png.length.toLocaleString()} bytes)\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`build-pwa-icons failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
