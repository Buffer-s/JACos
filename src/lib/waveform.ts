/**
 * Deterministic pseudo-waveform generator.
 * SoundCloud renders a real waveform from the audio; we don't have access to
 * decode the stream cheaply, so we generate a stable, natural-looking envelope
 * seeded from the track id. Same track → same waveform, every time.
 */

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Heights in [0, 1], `count` bars, roughly symmetric energy envelope with
 * per-bar variation. Smoothed with a short moving average for an organic look.
 */
export function waveformBars(trackId: number | string, count = 96): number[] {
  const rand = mulberry32(hashString(`jacos-wave:${trackId}`));
  const raw: number[] = [];
  let drift = 0.5;
  for (let i = 0; i < count; i++) {
    // random walk + occasional peaks, constrained like real loudness envelopes
    drift += (rand() - 0.5) * 0.34;
    drift = Math.min(0.92, Math.max(0.12, drift));
    const spike = rand() < 0.09 ? 0.35 * rand() : 0;
    raw.push(Math.min(1, Math.max(0.07, drift + spike)));
  }
  // light smoothing
  const smooth = raw.map((v, i) => {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(count - 1, i + 1)];
    return (a + v * 2 + b) / 4;
  });
  return smooth;
}
