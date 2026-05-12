import { existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YTDlpWrapModule from 'yt-dlp-wrap';

const YTDlpWrap = YTDlpWrapModule.default;

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
export const BIN_PATH = resolve(PROJECT_ROOT, 'bin', 'yt-dlp');

let cached;

// Lazily resolves a YTDlpWrap instance, downloading the binary on first use if needed.
export async function getYtDlp() {
  if (cached) return cached;
  if (!existsSync(BIN_PATH)) {
    await YTDlpWrap.downloadFromGithub(BIN_PATH);
    try {
      chmodSync(BIN_PATH, 0o755);
    } catch {
      // ignore — Windows or already-executable
    }
  }
  cached = new YTDlpWrap(BIN_PATH);
  return cached;
}
