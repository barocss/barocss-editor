import { useEffect, useState } from 'react';
import { peaksOfAudio, type SampledAudio } from './waveform';

/**
 * The peaks of a sound at a URL, decoded once for the life of the page.
 *
 * ## Why a cache and not a hook that just decodes
 *
 * Decoding a minute of audio is tens of milliseconds and allocates a few megabytes,
 * and a panel draws the same film's strip on every render — every keystroke in a
 * number field beside it, every selection change. Measured the naive way first on a
 * different feature: the thumbnail pane re-rendered a slide per keystroke and the
 * cost was the whole of the jank.
 *
 * Keyed by the source, because that is what the sound *is*. A data URI is its own key
 * and a URL is a URL; a file that changes behind the same URL is a case this gets
 * wrong, and `clearPeakCache` is there for the caller that knows it happened.
 *
 * ## Why the failures are silent
 *
 * A sound that will not decode — a codec the browser refuses, a URL that 404s, a
 * cross-origin file with no CORS headers — leaves the strip empty and the number
 * fields exactly as they were. A trim panel that threw, or that shouted at a reader
 * about `decodeAudioData`, would be worse than one with no picture in it: the reader
 * came to cut eight seconds off a clip, and they can still type.
 */

type Peaks = number[] | null;

const cache = new Map<string, number[]>();
const pending = new Map<string, Promise<number[] | null>>();

/** Forget what was decoded, for a caller whose file changed behind its URL. */
export function clearPeakCache(src?: string): void {
  if (src === undefined) {
    cache.clear();
    pending.clear();
    return;
  }
  cache.delete(src);
  pending.delete(src);
}

/** The browser's decoder, or nothing — jsdom has neither and must not throw. */
function audioContext(): AudioContext | null {
  const Ctor =
    typeof globalThis !== 'undefined'
      ? ((globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

async function decode(src: string, buckets: number): Promise<number[] | null> {
  const context = audioContext();
  if (!context) return null;
  try {
    const response = await fetch(src);
    const bytes = await response.arrayBuffer();
    const audio = await context.decodeAudioData(bytes);
    return peaksOfAudio(audio as unknown as SampledAudio, buckets);
  } catch {
    // Silent on purpose — see the note above.
    return null;
  } finally {
    // A context per decode is a context per sound, and browsers cap how many a page
    // may have (six in Safari). Closed as soon as the samples are out of it.
    void context.close?.();
  }
}

/**
 * The peaks for a source, or `null` until there are some — and `null` forever for a
 * sound this browser will not decode.
 *
 * `buckets` is how many bars the strip wants. It is part of the cache key in spirit
 * but not in fact: a second caller asking for a different count gets the first
 * count's peaks, which is a strip drawn from slightly the wrong number of bars and
 * not worth a second decode of the same file.
 */
export function useAudioPeaks(src: string | undefined, buckets = 100): Peaks {
  const [peaks, setPeaks] = useState<Peaks>(() => (src ? cache.get(src) ?? null : null));

  useEffect(() => {
    if (!src) {
      setPeaks(null);
      return;
    }

    const known = cache.get(src);
    if (known) {
      setPeaks(known);
      return;
    }

    let alive = true;
    const job =
      pending.get(src) ??
      decode(src, buckets).then((result) => {
        if (result) cache.set(src, result);
        pending.delete(src);
        return result;
      });
    pending.set(src, job);

    void job.then((result) => {
      // The panel may have moved on to another film, or closed.
      if (alive) setPeaks(result);
    });

    return () => {
      alive = false;
    };
  }, [src, buckets]);

  return peaks;
}
