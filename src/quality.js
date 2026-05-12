// MP3 bitrate tiers.
// High = 320 kbps CBR -> ~2.4 MB / minute (~10 MB for a 4-min song).
// Medium = 192 kbps CBR.
// Low = 128 kbps CBR.
export const QUALITY_TIERS = {
  high: { bitrate: 320, label: 'High (320 kbps, ~10 MB / 4-min song)' },
  medium: { bitrate: 192, label: 'Medium (192 kbps, ~6 MB / 4-min song)' },
  low: { bitrate: 128, label: 'Low (128 kbps, ~4 MB / 4-min song)' },
};

export const DEFAULT_QUALITY = 'high';
