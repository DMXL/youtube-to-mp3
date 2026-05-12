import { getYtDlp } from './ytdlp.js';

// Returns { kind: 'playlist' | 'video', title, items: [{ id, url, title, durationSec }] }
export async function resolveTarget(input) {
  const url = input.trim();
  if (!url) throw new Error('URL is required');

  const wrap = await getYtDlp();

  let json;
  try {
    const stdout = await wrap.execPromise([
      url,
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
    ]);
    json = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Could not resolve URL with yt-dlp: ${err.message}`);
  }

  if (json._type === 'playlist') {
    return {
      kind: 'playlist',
      title: json.title ?? 'playlist',
      items: (json.entries ?? [])
        .filter((e) => e && e.id)
        .map((e) => ({
          id: e.id,
          url: e.url ?? `https://www.youtube.com/watch?v=${e.id}`,
          title: e.title ?? e.id,
          durationSec: Number(e.duration) || 0,
        })),
    };
  }

  return {
    kind: 'video',
    title: json.title ?? json.id,
    items: [
      {
        id: json.id,
        url: json.webpage_url ?? `https://www.youtube.com/watch?v=${json.id}`,
        title: json.title ?? json.id,
        durationSec: Number(json.duration) || 0,
      },
    ],
  };
}
