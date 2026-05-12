import { createWriteStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, join, extname } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { getYtDlp } from './ytdlp.js';

// Downloads the highest-quality video+audio merged file for `url` into `destDir/baseName.<ext>`.
// Calls onProgress({ percent, totalSize, currentSpeed, eta, line }) during download.
// Writes a full log of yt-dlp output to `<destDir>/<baseName>.yt-dlp.log` for postmortem debugging.
// Returns the absolute path to the resulting file.
export async function downloadVideo(url, destDir, baseName, onProgress) {
  await mkdir(destDir, { recursive: true });
  const wrap = await getYtDlp();

  const outTemplate = join(destDir, `${baseName}.%(ext)s`);
  const args = [
    url,
    '-f',
    'bestvideo+bestaudio/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
    '--no-playlist',
    '--no-part',
    '--no-mtime',
    // Resilience: keep retrying on stalled sockets / fragment hiccups.
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    '--socket-timeout',
    '30',
    // Force throttled connections to reconnect once their rate drops below 100KB/s.
    '--throttled-rate',
    '100K',
    // Newline-delimited progress so wrap can parse each update cleanly.
    '--newline',
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);

  const logPath = join(destDir, `${baseName}.yt-dlp.log`);
  const logStream = createWriteStream(logPath, { flags: 'w' });
  const debug = process.env.YT2MP3_DEBUG === '1';

  let lastLine = '';

  await new Promise((resolveP, rejectP) => {
    const ev = wrap.exec(args);

    ev.on('progress', (p) => {
      if (onProgress) onProgress({ ...p, line: lastLine });
    });

    // yt-dlp-wrap emits one event per parsed yt-dlp line. We capture the raw text for the log.
    ev.on('ytDlpEvent', (eventType, eventData) => {
      const line = `[${eventType}] ${String(eventData).trim()}`;
      lastLine = line;
      logStream.write(line + '\n');
      if (debug) process.stderr.write(line + '\n');
    });

    ev.on('error', (err) => {
      logStream.write(`[error] ${err.stack ?? err.message}\n`);
      logStream.end();
      rejectP(err);
    });

    ev.on('close', (code) => {
      logStream.write(`[close] code=${code}\n`);
      logStream.end();
      if (code === 0 || code === null) resolveP();
      else rejectP(new Error(`yt-dlp exited with code ${code} (see ${logPath})`));
    });
  });

  const entries = await readdir(destDir);
  const match = entries.find((f) => {
    const ext = extname(f).toLowerCase();
    return (
      basename(f, ext) === baseName &&
      ['.mp4', '.mkv', '.webm', '.m4a', '.mov'].includes(ext)
    );
  });
  if (!match) {
    throw new Error(`Could not find downloaded file for "${baseName}" in ${destDir} (see ${logPath})`);
  }
  return join(destDir, match);
}
