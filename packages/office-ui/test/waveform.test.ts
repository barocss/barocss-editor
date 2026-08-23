import { describe, it, expect } from 'vitest';
import { momentAt, peaksOf, peaksOfAudio, trimWindow, waveBars } from '../src/waveform';

/**
 * The shape of a sound.
 *
 * All of it is a reduction — 2.6 million samples into two hundred pixels — and every
 * way of getting it wrong draws a *plausible* picture: a mean instead of a peak draws
 * a quiet smooth line for a spiky recording, and the reader trims at the wrong place
 * with no way to know. So the tests are about which sample wins, and they cost
 * milliseconds where the alternative is listening to a clip in a browser.
 */
describe('the peaks of a sound', () => {
  /** A sine at full scale: every bucket should read 1 after normalising. */
  const sine = (length: number, cycles = 8) =>
    Array.from({ length }, (_, at) => Math.sin((at / length) * cycles * 2 * Math.PI));

  it('takes the loudest sample of a bucket, not the average', () => {
    // Silence with one click in it. A mean would draw nothing at all; the click is
    // the one thing a reader needs to see.
    const samples = new Array(1000).fill(0);
    samples[500] = 0.9;
    const peaks = peaksOf(samples, 10);

    expect(peaks[5]).toBe(1); // normalised: the click is the loudest thing there is
    expect(peaks.filter((peak) => peak > 0)).toHaveLength(1);
  });

  it('reads a full-scale sine as full height across the strip', () => {
    const peaks = peaksOf(sine(4000), 20);
    for (const peak of peaks) expect(peak).toBeGreaterThan(0.9);
  });

  it('normalises to the loudest, so a quiet recording is still a shape', () => {
    const quiet = sine(2000).map((sample) => sample * 0.02);
    const peaks = peaksOf(quiet, 10);
    // Not 0.02 — a reader hunting for a gap is looking at relative loudness, which is
    // what every editor draws.
    expect(Math.max(...peaks)).toBe(1);
  });

  it('leaves silence silent rather than making noise out of nothing', () => {
    // The floor: dividing by a loudest of zero would be inventing a shape.
    expect(peaksOf(new Array(500).fill(0), 8)).toEqual(new Array(8).fill(0));
    expect(peaksOf(new Array(500).fill(1e-9), 8)).toEqual(new Array(8).fill(0));
  });

  it('answers for an empty sound and for more buckets than samples', () => {
    expect(peaksOf([], 4)).toEqual([0, 0, 0, 0]);
    // A strip wider than the sound is long: every bucket still gets a sample.
    const peaks = peaksOf([0, 1, 0], 9);
    expect(peaks).toHaveLength(9);
    expect(Math.max(...peaks)).toBe(1);
  });

  it('is at least one bucket, whatever it is asked for', () => {
    expect(peaksOf([1, 1], 0)).toHaveLength(1);
    expect(peaksOf([1, 1], -3)).toHaveLength(1);
  });
});

describe('the peaks of a decoded sound', () => {
  const audio = (channels: number[][]) => ({
    length: channels[0].length,
    numberOfChannels: channels.length,
    getChannelData: (channel: number) => channels[channel]
  });

  it('takes the louder channel rather than mixing them down', () => {
    // Hard-panned: a voice on the left and a room on the right. Summing and halving
    // would draw the room; worse, opposite phases cancel to nothing.
    const left = [0, 1, 0, 0];
    const right = [0, -1, 0, 0];
    expect(peaksOfAudio(audio([left, right]), 4)).toEqual([0, 1, 0, 0]);
  });

  it('is the same answer for one channel as the reduction itself', () => {
    const one = [0, 0.5, 0, 1];
    expect(peaksOfAudio(audio([one]), 4)).toEqual(peaksOf(one, 4));
  });

  it('keeps silence silent across channels', () => {
    expect(peaksOfAudio(audio([[0, 0], [0, 0]]), 2)).toEqual([0, 0]);
  });
});

describe('the bars of a strip', () => {
  it('spreads the peaks across the width and centres them', () => {
    const bars = waveBars([1, 0.5], { width: 100, height: 40, gap: 0 });
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ x: 0, y: 0, width: 50, height: 40 });
    // Half as loud: half as tall, and still centred about the middle.
    expect(bars[1]).toEqual({ x: 50, y: 10, width: 50, height: 20 });
  });

  it('never draws a bar of nothing, because a gap reads as no data', () => {
    // Silence is what the reader is hunting for, so it has to look like a line rather
    // than like a hole in the strip.
    const [bar] = waveBars([0], { width: 10, height: 30 });
    expect(bar.height).toBe(1);
  });

  it('keeps a bar at least a pixel wide when there are more peaks than pixels', () => {
    const bars = waveBars(new Array(200).fill(1), { width: 100, height: 20 });
    for (const bar of bars) expect(bar.width).toBeGreaterThanOrEqual(1);
  });

  it('has nothing to draw for an empty strip or an empty sound', () => {
    expect(waveBars([], { width: 100, height: 20 })).toEqual([]);
    expect(waveBars([1], { width: 0, height: 20 })).toEqual([]);
    expect(waveBars([1], { width: 100, height: 0 })).toEqual([]);
  });
});

describe('the part of the strip a trim keeps', () => {
  it('runs to the end when there is no out-point', () => {
    // `0` is the document's word for a length it does not have — see `media-trim.ts`.
    expect(trimWindow({ start: 2000, end: 0 }, 10000)).toEqual({ from: 0.2, to: 1 });
  });

  it('is the two points as fractions of the whole', () => {
    expect(trimWindow({ start: 2500, end: 7500 }, 10000)).toEqual({ from: 0.25, to: 0.75 });
  });

  it('keeps the whole strip while the film has not said how long it is', () => {
    // Shading a strip as trimmed on a length nobody knows would tell a reader their
    // sound is gone when it is not.
    expect(trimWindow({ start: 2000, end: 4000 }, 0)).toEqual({ from: 0, to: 1 });
    expect(trimWindow({ start: 0, end: 0 }, Number.NaN)).toEqual({ from: 0, to: 1 });
  });

  it('never inverts, however the numbers were typed', () => {
    // A trim past the end of the file is two numbers a reader can type.
    expect(trimWindow({ start: 20000, end: 30000 }, 10000)).toEqual({ from: 1, to: 1 });
    expect(trimWindow({ start: 8000, end: 3000 }, 10000)).toEqual({ from: 0.8, to: 1 });
  });

  it('answers the moment a point on it stands for', () => {
    expect(momentAt(0.25, 10000)).toBe(2500);
    expect(momentAt(0, 10000)).toBe(0);
    expect(momentAt(1, 10000)).toBe(10000);
    // Clamped, because a pointer leaves the strip mid-drag.
    expect(momentAt(-0.5, 10000)).toBe(0);
    expect(momentAt(1.5, 10000)).toBe(10000);
    // And nothing to say without a length.
    expect(momentAt(0.5, 0)).toBe(0);
  });
});
