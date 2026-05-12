# youtube-to-mp3

A small terminal app that downloads a YouTube video or playlist at the highest
available resolution and converts the result to MP3.

- Built on Node.js + [yt-dlp](https://github.com/yt-dlp/yt-dlp) (binary auto-downloaded on first run)
- Audio encoding via [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static) — no system ffmpeg needed
- Interactive quality picker; defaults to 320 kbps (~10 MB for a 4-minute track)

## Install

```bash
git clone <this repo>
cd youtube-to-mp3
npm install
```

On first run the app will download the `yt-dlp` binary into `./bin/yt-dlp`
(~3 MB). Subsequent runs reuse it.

## Usage

Interactive (will prompt for URL, quality, confirmation):

```bash
npm start
```

Pass the URL directly to skip the URL prompt:

```bash
npm start -- "https://www.youtube.com/watch?v=AOnXQ3STB1A"
npm start -- "https://www.youtube.com/watch?v=exMohdiKsk0&list=PLED18C68935FF110B"
```

Pass `--verbose` (or `-v`) to also stream the raw yt-dlp output to stderr while
downloading:

```bash
npm start -- --verbose "https://www.youtube.com/watch?v=AOnXQ3STB1A"
```

The interactive run asks "Save downloaded video files?" (default no). Answer
yes to keep the intermediate `.mp4` files in `downloads/<collection>/` after
conversion; otherwise they're deleted once their MP3 has been written.

Regardless of verbose mode, every download writes a full yt-dlp log next to the
intermediate video file at `downloads/<collection>/<title>.yt-dlp.log`. If a
download stalls for more than 45 s, the spinner points you at that log.

## Output layout

```
output/
└── <Video or playlist title>/
    ├── <Video title 1>.mp3
    ├── <Video title 2>.mp3
    └── …
```

Intermediate video files are downloaded into `downloads/<Video or playlist title>/`
and removed automatically after a successful MP3 conversion.

## MP3 quality tiers

| Tier   | Bitrate (CBR) | Approx size / 4-min song |
| ------ | ------------- | ------------------------ |
| High   | 320 kbps      | ~10 MB                   |
| Medium | 192 kbps      | ~6 MB                    |
| Low    | 128 kbps      | ~4 MB                    |

The video itself is always pulled at the highest resolution YouTube offers
(yt-dlp picks `bestvideo+bestaudio`, merged into an mp4 via ffmpeg).

## Project structure

```
src/
  index.js     CLI entry point (prompts, orchestration)
  youtube.js   URL → metadata via yt-dlp
  download.js  Pulls highest-quality video to disk
  convert.js   ffmpeg → MP3 at chosen bitrate
  ytdlp.js     Lazy-loaded yt-dlp binary wrapper
  quality.js   Bitrate tier definitions
  util.js      Filename sanitisation + formatting helpers
test/
  smoke.js     Non-interactive end-to-end test (`node test/smoke.js single|playlist|playlist-meta`)
```

## Re-running on the same URL

The CLI skips any video whose target MP3 already exists in the output folder,
so re-running on a playlist resumes where it left off.

## Troubleshooting

- **"yt-dlp exited with code N"** — the binary is the YouTube extractor; if
  YouTube changes things, update it with `node -e "import('yt-dlp-wrap').then(m => m.default.default.downloadFromGithub('./bin/yt-dlp'))"`.
- **Slow downloads** — yt-dlp picks the highest available video stream; pass a
  more selective `-f` in `src/download.js` if you'd rather trade quality for speed.
