import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, attr } from './helpers';

/**
 * The sound, drawn.
 *
 * Trimming a film was two number fields in seconds, and a reader typed them **blind**:
 * nobody knows where the dead air ends without playing the clip and watching a clock.
 *
 * What the arithmetic can be asked in milliseconds is in `office-ui`'s
 * `waveform.test.ts` — eighteen tests about which sample wins, because a mean instead
 * of a peak draws a plausible, quiet, wrong picture. Three things only a browser can
 * say, and they are the three here: the file **decodes**, the strip is drawn from it,
 * and a handle dragged across it writes the moment it was dropped on.
 */

/**
 * A sound with a shape: silence, a tone, silence.
 *
 * Built rather than committed, so the test owns what the picture should look like —
 * the loud half-second is in the middle, so the bars either side of it must be short
 * and the ones in it tall.
 */
const wav = (page: Page) =>
  page.evaluate(() => {
    const rate = 8000;
    const seconds = 2;
    const samples = rate * seconds;
    const bytes = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(bytes);
    const ascii = (at: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
    };

    ascii(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, samples * 2, true);

    // A tone from 0.75s to 1.25s and silence around it.
    for (let at = 0; at < samples; at += 1) {
      const second = at / rate;
      const loud = second > 0.75 && second < 1.25;
      const value = loud ? Math.sin(second * 440 * 2 * Math.PI) * 0.9 : 0;
      view.setInt16(44 + at * 2, Math.round(value * 32767), true);
    }

    let binary = '';
    const octets = new Uint8Array(bytes);
    for (let at = 0; at < octets.length; at += 1) binary += String.fromCharCode(octets[at]);
    return `data:audio/wav;base64,${btoa(binary)}`;
  });

/** A sound on a slide, in the sequence, with its step's inspector open. */
const soundInTheTimeline = async (page: Page, src: string) => {
  const sid = await page.evaluate(async (source) => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertAudio', { src: source, width: 6000, height: 1200 });
    const placed = editor.selection?.nodeIds?.[0] as string;
    await editor.executeCommand('setBoxPlayback', { nodeId: placed, startsWith: 'onClick' });
    return placed;
  }, src);
  await page.waitForTimeout(600);

  const bar = page.locator('[data-timeline] .sl-timeline-bar').first();
  await expect(bar).toHaveAttribute('data-kind', 'play');
  await bar.click();
  await page.waitForTimeout(200);
  return sid;
};

test.describe('the sound of a film', () => {
  test('is drawn from the file, loud where the file is loud', async ({ page }) => {
    await openDeck(page);
    await soundInTheTimeline(page, await wav(page));

    const strip = page.locator('[data-step-wave]');
    // Decoding is asynchronous and the strip is not drawn until there is something to
    // draw — a strip with no sound in it is furniture that says nothing.
    await expect(strip).toBeVisible({ timeout: 5000 });

    const bars = await strip.locator('rect').evaluateAll((rects) =>
      rects.map((rect) => Number(rect.getAttribute('height')))
    );
    expect(bars.length).toBeGreaterThan(20);

    /*
     * The shape, which is the whole point of drawing it.
     *
     * The tone is the middle quarter of the file, so the tallest bars have to be
     * there and the ends have to be flat. A test that only counted the bars would
     * pass on a strip drawn from the wrong file.
     */
    const middle = bars.slice(Math.floor(bars.length * 0.4), Math.ceil(bars.length * 0.6));
    const ends = [...bars.slice(0, Math.floor(bars.length * 0.3)), ...bars.slice(Math.ceil(bars.length * 0.7))];
    expect(Math.max(...middle)).toBeGreaterThan(Math.max(...ends) * 4);
    // And silence is a line rather than a hole: a gap in the strip reads as no data,
    // which is exactly what a reader is hunting for.
    expect(Math.min(...ends)).toBeGreaterThanOrEqual(1);
  });

  test('sets the in-point where the reader drops the handle', async ({ page }) => {
    await openDeck(page);
    const sid = await soundInTheTimeline(page, await wav(page));

    const strip = page.locator('[data-step-wave]');
    await expect(strip).toBeVisible({ timeout: 5000 });
    const box = (await strip.boundingBox())!;

    // A quarter of the way in, dragged from the left edge. The file is two seconds,
    // so this is half a second — and the trim is written on the *film*, not the step.
    const handle = strip.locator('[data-wave-handle="from"]');
    await handle.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const start = Number(await attr(page, sid, 'trimStart'));
    expect(start).toBeGreaterThan(300);
    expect(start).toBeLessThan(700);

    // And the field says the same thing, because there is one trim and two ways in.
    // By role: the handle is a button called 시작점 옮기기 and the field is a
    // spinbutton called 시작점 — two controls with one name is what a screen reader
    // reads out twice, and what this test could not tell apart the first time.
    await expect(
      page.locator('[data-step-editor]').getByRole('spinbutton', { name: '시작점' })
    ).toHaveValue('0.5');
  });

  /**
   * The out-point, and the rule that makes it different from the in-point.
   *
   * `0` is the document's word for "to the end" — a film's own length is in the file
   * and not in the document, so writing the length would be writing a measurement that
   * is wrong the moment the file changes. So a handle dragged back off the right edge
   * writes a number, and one dropped on the edge writes nothing at all.
   */
  test('writes nothing for an out-point at the very end', async ({ page }) => {
    await openDeck(page);
    const sid = await soundInTheTimeline(page, await wav(page));

    const strip = page.locator('[data-step-wave]');
    await expect(strip).toBeVisible({ timeout: 5000 });
    const box = (await strip.boundingBox())!;
    const handle = strip.locator('[data-wave-handle="to"]');

    // Back to three quarters: two seconds of file, so 1.5.
    await handle.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const cut = Number(await attr(page, sid, 'trimEnd'));
    expect(cut).toBeGreaterThan(1300);
    expect(cut).toBeLessThan(1700);

    // And back out to the edge, which is "to the end" and not "two seconds".
    await handle.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(Number(await attr(page, sid, 'trimEnd') ?? 0)).toBe(0);
  });

  test('leaves the fields alone when the file will not decode', async ({ page }) => {
    await openDeck(page);
    // An mp4 header with no audio track in it: `decodeAudioData` refuses, and the
    // strip is simply not there. The reader came to cut eight seconds off a clip and
    // they can still type — which is why the failure is silent rather than loud.
    await soundInTheTimeline(page, 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');

    await page.waitForTimeout(1500);
    await expect(page.locator('[data-step-wave]')).toHaveCount(0);

    const inspector = page.locator('[data-step-editor]');
    await inspector.getByLabel('시작점').fill('1.5');
    await inspector.getByLabel('시작점').blur();
    await page.waitForTimeout(400);
    await expect(inspector.getByLabel('시작점')).toHaveValue('1.5');
  });
});
