import { mkdir, readdir } from 'node:fs/promises';
import { dirname, basename, join, extname } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { getYtDlp } from './ytdlp.js';

// Downloads the highest-quality video+audio merged file for `url`.
// Writes to `<destDir>/<baseName>.<ext>` where ext is decided by yt-dlp (mp4 if merge succeeds).
// Calls onProgress({ percent, totalSize, currentSpeed, eta }) during download.
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
    '--no-warnings',
    '--no-part',
    '--no-mtime',
  ];
  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  await new Promise((resolveP, rejectP) => {
    const ev = wrap.exec(args);
    ev.on('progress', (p) => {
      if (onProgress) onProgress(p);
    });
    ev.on('error', rejectP);
    ev.on('close', (code) => {
      if (code === 0 || code === null) resolveP();
      else rejectP(new Error(`yt-dlp exited with code ${code}`));
    });
  });

  // yt-dlp picks the final extension; locate the file we just produced.
  const entries = await readdir(destDir);
  const match = entries.find((f) => {
    const ext = extname(f).toLowerCase();
    return (
      basename(f, ext) === baseName &&
      ['.mp4', '.mkv', '.webm', '.m4a', '.mov'].includes(ext)
    );
  });
  if (!match) {
    throw new Error(`Could not find downloaded file for "${baseName}" in ${destDir}`);
  }
  return join(destDir, match);
}
