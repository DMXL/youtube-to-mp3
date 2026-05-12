// Non-interactive smoke test for the download+convert pipeline.
// Usage: node test/smoke.js
import { rm, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTarget } from '../src/youtube.js';
import { downloadVideo } from '../src/download.js';
import { convertToMp3 } from '../src/convert.js';
import { QUALITY_TIERS } from '../src/quality.js';
import { safeName, formatBytes } from '../src/util.js';

const SINGLE = 'https://www.youtube.com/watch?v=AOnXQ3STB1A';
const PLAYLIST = 'https://www.youtube.com/watch?v=exMohdiKsk0&list=PLED18C68935FF110B';

const ROOT = process.cwd();
const DL = join(ROOT, 'downloads');
const OUT = join(ROOT, 'output');

async function runOne(label, url, { limit = 1, bitrate = QUALITY_TIERS.high.bitrate } = {}) {
  console.log(`\n=== ${label} ===`);
  const t0 = Date.now();
  const target = await resolveTarget(url);
  console.log(`kind=${target.kind} title=${target.title} items=${target.items.length}`);

  const collection = safeName(target.title);
  const dlDir = join(DL, collection);
  const outDir = join(OUT, collection);
  await mkdir(dlDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const subset = target.items.slice(0, limit);
  for (const [i, item] of subset.entries()) {
    const base = safeName(item.title, item.id);
    const mPath = join(outDir, `${base}.mp3`);
    console.log(`  [${i + 1}/${subset.length}] ${item.title}`);

    const vPath = await downloadVideo(item.url, dlDir, base);
    const vStat = await stat(vPath);
    console.log(`    downloaded: ${formatBytes(vStat.size)} -> ${vPath}`);

    await convertToMp3(vPath, mPath, bitrate);
    const s = await stat(mPath);
    console.log(`    mp3 ${bitrate} kbps: ${formatBytes(s.size)} -> ${mPath}`);

    await rm(vPath, { force: true });
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const args = process.argv.slice(2);
const mode = args[0] ?? 'single';

if (mode === 'single') {
  await runOne('single video', SINGLE);
} else if (mode === 'playlist') {
  await runOne('playlist (first item only)', PLAYLIST, { limit: 1 });
} else if (mode === 'playlist-meta') {
  // Just resolve metadata, do not download.
  const t = await resolveTarget(PLAYLIST);
  console.log(`title=${t.title} items=${t.items.length}`);
  for (const it of t.items.slice(0, 5)) console.log(`  - ${it.title}`);
  if (t.items.length > 5) console.log(`  ... and ${t.items.length - 5} more`);
} else {
  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}
