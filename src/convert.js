import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// Converts an audio/video file to MP3 at the given CBR bitrate (kbps).
// Calls onProgress({ percent }) with rough ffmpeg progress.
export async function convertToMp3(inputPath, outputPath, bitrateKbps, onProgress) {
  await mkdir(dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(bitrateKbps)
      .format('mp3')
      .on('progress', (p) => {
        if (onProgress && Number.isFinite(p.percent)) {
          onProgress({ percent: Math.max(0, Math.min(1, p.percent / 100)) });
        }
      })
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}
