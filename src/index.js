#!/usr/bin/env node
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';

import { QUALITY_TIERS, DEFAULT_QUALITY } from './quality.js';
import { resolveTarget } from './youtube.js';
import { downloadVideo } from './download.js';
import { convertToMp3 } from './convert.js';
import { safeName, formatBytes, formatDuration } from './util.js';
import { getYtDlp } from './ytdlp.js';

const ROOT = process.cwd();
const DOWNLOADS_DIR = join(ROOT, 'downloads');
const OUTPUT_DIR = join(ROOT, 'output');

// Parse flags from argv. Anything left is treated as the URL.
const argv = process.argv.slice(2);
const verbose = argv.some((a) => a === '--verbose' || a === '-v');
if (verbose) process.env.YT2MP3_DEBUG = '1';
const keepVideoFlag = argv.some((a) => a === '--keep-video' || a === '-k');
const FLAG_TOKENS = new Set(['--verbose', '-v', '--keep-video', '-k']);
const positional = argv.filter((a) => !FLAG_TOKENS.has(a) && !a.startsWith('-'));
const cliUrl = positional[0];

// Warn the user if a download stalls for too long.
const STALL_MS = 45_000;

async function main() {
  console.log(chalk.bold.cyan('\n🎵 YouTube → MP3\n'));

  // Ensure yt-dlp is available up front so the first prompt isn't blocked by a binary download.
  const binSpinner = ora('Checking yt-dlp binary…').start();
  try {
    await getYtDlp();
    binSpinner.succeed('yt-dlp ready');
  } catch (err) {
    binSpinner.fail(`Could not obtain yt-dlp: ${err.message}`);
    process.exit(1);
  }

  const url =
    cliUrl ??
    (await input({
      message: 'Paste a YouTube video or playlist URL:',
      validate: (v) => (v.trim().length > 0 ? true : 'URL is required'),
    }));

  const resolveSpinner = ora('Fetching metadata…').start();
  let target;
  try {
    target = await resolveTarget(url);
  } catch (err) {
    resolveSpinner.fail(chalk.red(err.message));
    process.exit(1);
  }
  resolveSpinner.succeed(
    target.kind === 'playlist'
      ? `Playlist: ${chalk.bold(target.title)} (${target.items.length} videos)`
      : `Video: ${chalk.bold(target.title)}`,
  );
  if (target.unavailableCount > 0) {
    console.log(
      chalk.gray(
        `  ↳ ${target.unavailableCount} unavailable video(s) in this playlist will be skipped (deleted / private / region-locked)`,
      ),
    );
  }

  const quality = await select({
    message: 'Choose MP3 quality:',
    default: DEFAULT_QUALITY,
    choices: Object.entries(QUALITY_TIERS).map(([key, q]) => ({ name: q.label, value: key })),
  });
  const { bitrate } = QUALITY_TIERS[quality];

  const keepVideo = keepVideoFlag
    ? true
    : await confirm({ message: 'Save downloaded video files?', default: false });

  const collectionName = safeName(target.title, target.kind === 'playlist' ? 'playlist' : 'video');
  const outDir = join(OUTPUT_DIR, collectionName);
  const dlDir = join(DOWNLOADS_DIR, collectionName);

  console.log(
    chalk.gray(
      `\nMP3s will be written to ${chalk.white(outDir)}\n` +
        (keepVideo
          ? `Video files will be kept at ${chalk.white(dlDir)}\n`
          : `Video files will be downloaded to ${chalk.white(dlDir)} and removed after conversion\n`),
    ),
  );

  const proceed = await confirm({ message: 'Start?', default: true });
  if (!proceed) {
    console.log(chalk.yellow('Aborted.'));
    return;
  }

  const failures = [];
  for (const [i, item] of target.items.entries()) {
    const idx = `[${i + 1}/${target.items.length}]`;
    const baseName = safeName(item.title, item.id);
    const mp3Path = join(outDir, `${baseName}.mp3`);

    console.log(
      chalk.bold(`\n${idx} ${item.title}`) +
        chalk.gray(item.durationSec ? `  (${formatDuration(item.durationSec)})` : ''),
    );

    // Skip if MP3 already exists.
    try {
      const s = await stat(mp3Path);
      if (s.isFile() && s.size > 0) {
        console.log(chalk.gray(`  ↳ already exists (${formatBytes(s.size)}), skipping`));
        continue;
      }
    } catch {
      // not present — continue
    }

    let videoPath;
    const dlSpinner = ora('  Downloading video…').start();
    let lastProgressAt = Date.now();
    let stallWarned = false;
    const stallTimer = setInterval(() => {
      if (!stallWarned && Date.now() - lastProgressAt > STALL_MS) {
        stallWarned = true;
        dlSpinner.text += chalk.yellow(
          `  (no progress in ${Math.round(STALL_MS / 1000)}s — see ${join(dlDir, `${baseName}.yt-dlp.log`)})`,
        );
      }
    }, 5000);
    try {
      videoPath = await downloadVideo(item.url, dlDir, baseName, (p) => {
        lastProgressAt = Date.now();
        stallWarned = false;
        const pct = Number.isFinite(p.percent) ? `${p.percent.toFixed(1)}%` : '';
        const size = p.totalSize ? ` of ${p.totalSize}` : '';
        const speed = p.currentSpeed ? ` @ ${p.currentSpeed}` : '';
        dlSpinner.text = `  Downloading video… ${pct}${size}${speed}`.trim();
      });
      dlSpinner.succeed('  Downloaded');
    } catch (err) {
      dlSpinner.fail(`  Download failed: ${err.message}`);
      failures.push({ item, stage: 'download', error: err });
      continue;
    } finally {
      clearInterval(stallTimer);
    }

    const cvSpinner = ora(`  Converting to MP3 @ ${bitrate} kbps…`).start();
    try {
      await convertToMp3(videoPath, mp3Path, bitrate, ({ percent }) => {
        cvSpinner.text = `  Converting to MP3 @ ${bitrate} kbps… ${(percent * 100).toFixed(0)}%`;
      });
      const s = await stat(mp3Path);
      cvSpinner.succeed(`  Saved ${chalk.cyan(mp3Path)} (${formatBytes(s.size)})`);
      if (!keepVideo) await rm(videoPath, { force: true });
    } catch (err) {
      cvSpinner.fail(`  Conversion failed: ${err.message}`);
      failures.push({ item, stage: 'convert', error: err });
    }
  }

  // If we deleted every video file, try to remove the (now-empty) downloads subdir.
  if (!keepVideo) {
    await rm(dlDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log();
  if (failures.length === 0) {
    console.log(chalk.green.bold(`✓ Done. ${target.items.length} file(s) in ${outDir}`));
  } else {
    console.log(
      chalk.yellow.bold(
        `Finished with ${failures.length} failure(s) out of ${target.items.length}:`,
      ),
    );
    for (const f of failures) {
      console.log(chalk.yellow(`  - [${f.stage}] ${f.item.title}: ${f.error.message}`));
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(chalk.red(`\nFatal: ${err.stack ?? err.message}`));
  process.exit(1);
});
