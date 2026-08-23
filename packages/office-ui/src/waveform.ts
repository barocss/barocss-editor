/**
 * The shape of a sound, as something a strip of pixels can draw.
 *
 * ## Why this is arithmetic and not a component
 *
 * Trimming a film in this suite is two number fields — 시작점 and 끝점, in seconds —
 * and a reader types them **blind**. Nobody knows where the eight seconds of dead air
 * end without playing the clip and watching a clock; every editor that trims audio
 * draws the sound instead, and the reader cuts at the gap they can see.
 *
 * What makes that a picture is a reduction: a minute of audio is 2.6 million samples
 * and the strip is two hundred pixels wide, so the drawing is *one peak per pixel* and
 * everything else is a decision about which sample wins. That reduction is the whole
 * of it, it is pure, and it is wrong in ways only a test catches — a bucket that
 * averages instead of peaking draws a quiet, smooth line for a spiky recording, which
 * is exactly the shape a reader is looking for.
 *
 * The decode is the browser's (`AudioContext.decodeAudioData`) and the drawing is a
 * component; this file is the part that can be checked in milliseconds.
 *
 * ## Where it lives
 *
 * Here, and not in `office-slides`: a sound's shape is not a fact about decks. A
 * document editor placing an audio note, a board with a voice memo and a deck all want
 * the same strip, and the trim window it shades is a *time* window — which is the same
 * arithmetic wherever the two numbers come from.
 */

/**
 * One peak per bucket, each 0..1, loudest normalised to 1.
 *
 * ## Peak, not average
 *
 * A bucket holds thousands of samples and the eye wants the **loudest** of them: a
 * mean over a bucket of a spiky recording is a low flat line, because half a wave is
 * negative and speech is mostly quiet between the consonants. Measured on a test
 * signal below — a mean draws a sine as 0.6 and a click as nothing at all.
 *
 * ## Normalised, and why that is not cheating
 *
 * A quiet recording is a flat line at its true scale, and a reader looking for a gap
 * in speech is looking at *relative* loudness. Every editor normalises. The floor
 * matters: a silent clip has no loudest sample, and dividing by it would make noise
 * out of nothing — so silence stays silence.
 */
export function peaksOf(samples: ArrayLike<number>, buckets: number): number[] {
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Array<number>(count).fill(0);
  if (samples.length === 0) return peaks;

  const per = samples.length / count;
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = Math.floor(bucket * per);
    // At least one sample per bucket, always: more buckets than samples is a strip
    // wider than the sound is long, which is an ordinary thing to ask for.
    const to = Math.max(from + 1, Math.floor((bucket + 1) * per));
    let loudest = 0;
    for (let at = from; at < to && at < samples.length; at += 1) {
      const level = Math.abs(samples[at]);
      if (level > loudest) loudest = level;
    }
    peaks[bucket] = loudest;
  }

  const top = peaks.reduce((most, peak) => (peak > most ? peak : most), 0);
  // Silence, or something close enough to it that scaling would be inventing a shape.
  if (top < 1e-4) return peaks.map(() => 0);
  return peaks.map((peak) => Math.min(1, peak / top));
}

/** As much of an `AudioBuffer` as the reduction needs. */
export interface SampledAudio {
  length: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => ArrayLike<number>;
}

/**
 * The peaks of a decoded sound, taking the loudest channel at each point.
 *
 * Not a mix-down: summing two channels and halving cancels anything panned hard in
 * opposite directions, and a stereo recording where the voice is on one side would
 * draw as the room. The louder of the two is what a reader means by "is there sound
 * here".
 */
export function peaksOfAudio(audio: SampledAudio, buckets: number): number[] {
  const channels = Math.max(1, audio.numberOfChannels);
  const perChannel: number[][] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    perChannel.push(peaksOf(audio.getChannelData(channel), buckets));
  }
  if (perChannel.length === 1) return perChannel[0];

  const merged = perChannel[0].map((_, at) =>
    perChannel.reduce((most, peaks) => (peaks[at] > most ? peaks[at] : most), 0)
  );
  // Normalised again: the loudest of the merged is not the loudest of either channel.
  const top = merged.reduce((most, peak) => (peak > most ? peak : most), 0);
  return top < 1e-4 ? merged.map(() => 0) : merged.map((peak) => Math.min(1, peak / top));
}

/** One bar of the drawing, in the strip's own pixels. */
export interface WaveBar {
  x: number;
  /** The top of the bar; the strip is drawn symmetrically about its middle. */
  y: number;
  width: number;
  height: number;
}

/**
 * Where each bar goes in a strip of a given size.
 *
 * Symmetric about the middle, which is what a compact strip is: the two-sided shape a
 * full editor draws needs the minimum as well as the maximum per bucket, and at
 * twenty-eight pixels tall the difference is invisible.
 *
 * A floor of one pixel, because a bar of zero height is a gap in the strip and reads
 * as *no data* rather than as silence — and silence is exactly what the reader is
 * hunting for.
 */
export function waveBars(
  peaks: number[],
  size: { width: number; height: number; gap?: number }
): WaveBar[] {
  if (peaks.length === 0 || size.width <= 0 || size.height <= 0) return [];

  const gap = Math.max(0, size.gap ?? 1);
  const per = size.width / peaks.length;
  const width = Math.max(1, per - gap);
  const middle = size.height / 2;

  return peaks.map((peak, at) => {
    const height = Math.max(1, Math.round(peak * size.height));
    return {
      x: Math.round(at * per * 100) / 100,
      y: Math.round((middle - height / 2) * 100) / 100,
      width: Math.round(width * 100) / 100,
      height
    };
  });
}

/**
 * Which part of the strip the trim keeps, as a fraction of its width.
 *
 * The one piece of arithmetic that would otherwise be written inline in a component,
 * three times, with three answers — which is what this repository keeps finding. The
 * rules it holds:
 *
 * - **`end: 0` means to the end**, which is the document's word for a length it does
 *   not have (see `media-trim.ts`). So the window runs to 1.
 * - **A duration of nothing** is a film whose length the browser has not said yet:
 *   the whole strip is kept, because shading it as trimmed would show a reader their
 *   sound is gone when it is not.
 * - Clamped to the strip, and never inverted: a trim past the end of the file is a
 *   number a reader can type, and the window it describes is the last instant rather
 *   than a negative one.
 */
export function trimWindow(
  trim: { start: number; end: number },
  duration: number
): { from: number; to: number } {
  if (!Number.isFinite(duration) || duration <= 0) return { from: 0, to: 1 };

  const from = Math.min(1, Math.max(0, trim.start / duration));
  const asked = trim.end > trim.start ? trim.end / duration : 1;
  return { from, to: Math.min(1, Math.max(from, asked)) };
}

/**
 * The moment a point on the strip stands for, in milliseconds.
 *
 * The inverse of the above, and the reason the strip is worth drawing at all: a reader
 * who can see the gap points at it. `at` is a fraction of the width, so a caller
 * converts a pointer's pixels once and this stays free of the DOM.
 */
export function momentAt(at: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, at)) * duration);
}
