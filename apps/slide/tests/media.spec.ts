import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, boxCounts, attr } from './helpers';

/**
 * A film and a sound on a slide.
 *
 * `mediaVideo` and `mediaAudio` were taken out of the office schema the day it
 * stopped declaring what nothing drew — fifteen node types with no renderer
 * between them — and they come back the same way: with a renderer, a command and
 * a control. The conformance check enforced exactly that on the way in, twice:
 * it refused the schema until there were renderers, and refused a single
 * `insertMedia({ kind })` because a command that puts a node in the document has
 * to say *which* node.
 *
 * What only a browser shows is that the element is a real player placed like any
 * other box — draggable, resizable, and with the playback attributes the
 * document asked for and not the ones it did not.
 */
const VIDEO = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
const AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

const place = async (page: Page, command: 'insertVideo' | 'insertAudio', src: string) => {
  const sid = await page.evaluate(
    async ([name, source]) => {
      const editor = (window as any).editor;
      await editor.executeCommand(name, { src: source, width: 6000, height: 3375 });
      return editor.selection?.nodeIds?.[0] as string;
    },
    [command, src] as const
  );
  await page.waitForTimeout(400);
  return sid;
};

const drawn = (page: Page, sid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`.sl-stage [data-bc-sid="${CSS.escape(id)}"]`);
    if (!el) return null;
    return {
      tag: el.tagName,
      src: el.getAttribute('src'),
      controls: el.hasAttribute('controls'),
      autoplay: el.hasAttribute('autoplay'),
      dataAutoplay: el.getAttribute('data-autoplay'),
      loop: el.hasAttribute('loop'),
      muted: el.hasAttribute('muted'),
      width: Math.round(el.getBoundingClientRect().width)
    };
  }, sid);

test.describe('a film on a slide', () => {
  test('is placed as a real player, at the size it was given', async ({ page }) => {
    await openDeck(page);
    const before = (await boxCounts(page))[0];

    const sid = await place(page, 'insertVideo', VIDEO);

    expect((await boxCounts(page))[0]).toBe(before + 1);
    const element = await drawn(page, sid);
    expect(element?.tag).toBe('VIDEO');
    expect(element?.src).toBe(VIDEO);
    expect(element?.controls).toBe(true);
    expect(await attr(page, sid, 'width')).toBe(6000);
  });

  /**
   * `autoplay="false"` is `autoplay` as far as HTML is concerned — the attribute
   * being present is what turns it on — so a document that says no would have
   * played the film in front of an audience.
   */
  test('does not start itself unless the document says to', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);
    expect((await drawn(page, sid))?.autoplay).toBe(false);
    expect((await drawn(page, sid))?.loop).toBe(false);

    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxStyle', { nodeId: id, autoplay: true }),
      sid
    );
    await page.waitForTimeout(400);

    const after = await drawn(page, sid);
    /**
     * `data-autoplay`, and never the real attribute.
     *
     * A real `autoplay` starts the film the moment it is *drawn*, and it is
     * drawn in the editor — so a deck with three films would begin playing all
     * three the moment it opened, and again after every keystroke that redrew
     * one. Starting is the show's business; the stage does it.
     */
    expect(after?.autoplay).toBe(false);
    expect(after?.dataAutoplay).toBe('true');
    // And muted with it: a browser refuses to start a film with sound without a
    // gesture, so an autoplaying slide that was not muted would silently not
    // start.
    expect(after?.muted).toBe(true);
  });

  /**
   * Playing, which is what makes a film on a slide worth having — and stopping,
   * which is what keeps a film off a slide nobody is looking at.
   *
   * Asked of `play()` and `pause()` rather than of `paused`, and deliberately: a
   * data URI with no frames in it never leaves the paused state however hard it
   * is asked, so `paused` would measure the fixture's codec instead of the
   * product's decision. What is being tested is that the show starts the film
   * and the way out stops it, which is exactly these two calls.
   */
  test('starts in the show and stops on the way out', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);
    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setBoxStyle', { nodeId: id, autoplay: true }),
      sid
    );
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const calls: string[] = [];
      (window as any).__media = calls;
      const media = HTMLMediaElement.prototype;
      const play = media.play;
      media.play = function patched(this: HTMLMediaElement) {
        calls.push(`play:${this.getAttribute('data-bc-sid')}`);
        return play.call(this).catch(() => undefined) as Promise<void>;
      };
      const pause = media.pause;
      media.pause = function patched(this: HTMLMediaElement) {
        calls.push(`pause:${this.getAttribute('data-bc-sid')}`);
        return pause.call(this);
      };
    });

    // Nothing in the editor, whatever the document says.
    expect(await page.evaluate(() => (window as any).__media.length)).toBe(0);

    await page.locator('[data-present]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__media as string[]))
      .toContain(`play:${sid}`);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => (window as any).__media as string[]))
      .toContain(`pause:${sid}`);

    // And rewound: a film left half-way through is a slide that starts in the
    // middle the next time it is shown.
    expect(
      await page.evaluate(
        (id) =>
          document.querySelector<HTMLMediaElement>(
            `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
          )?.currentTime,
        sid
      )
    ).toBe(0);
  });

  test('is a box like any other, and can be dragged', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);

    const start = Number(await attr(page, sid, 'x'));
    await page.evaluate((id) => (window as any).editor.executeCommand('setNode', { nodeIds: [id] }), sid);
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    expect(Number(await attr(page, sid, 'x'))).toBe(start + 15);
  });
});

test.describe('a sound on a slide', () => {
  test('is placed as the browser’s own player', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertAudio', AUDIO);

    const element = await drawn(page, sid);
    expect(element?.tag).toBe('AUDIO');
    expect(element?.src).toBe(AUDIO);
    expect(element?.controls).toBe(true);
  });

  /** Both buttons are on the ribbon, which is what "with a control" meant. */
  test('has a button on the ribbon, beside the picture’s', async ({ page }) => {
    await openDeck(page);
    await expect(page.locator('[data-control="insert-video"]')).toBeVisible();
    await expect(page.locator('[data-control="insert-audio"]')).toBeVisible();
  });
});

/**
 * Which part of the film plays.
 *
 * The timeline said *when* a film starts, which is what an animation list says.
 * A video editor's timeline says which part of it plays, and until now a deck
 * could only ever play a file from its first frame to its last — when every real
 * use of video in a deck is a piece of one.
 *
 * Three things have to be true, and only a browser shows the third: the document
 * holds the two points, the *bar* is as long as the piece rather than as long as
 * the step's placeholder, and the film is seeked to the in-point when it plays.
 */
test.describe('trimming a film', () => {
  test('takes two points, draws the piece, and starts the film there', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);

    // A film joins the sequence through the panel's 재생 row — see `setBoxPlayback`.
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxPlayback', {
          nodeId: id,
          startsWith: 'onClick'
        }),
      sid
    );
    await page.waitForTimeout(500);

    const bar = page.locator('[data-timeline] .sl-timeline-bar').first();
    await expect(bar).toHaveAttribute('data-kind', 'play');
    await bar.click();
    await page.waitForTimeout(200);

    // The placeholder length a play step has always had, because a file's own
    // length is not in the document.
    const placeholder = Number(await bar.getAttribute('data-duration'));
    expect(placeholder).toBeGreaterThan(0);

    const inspector = page.locator('[data-step-editor]');
    await inspector.getByLabel('시작점').fill('2');
    await inspector.getByLabel('시작점').blur();
    await page.waitForTimeout(400);
    await inspector.getByLabel('끝점').fill('9.5');
    await inspector.getByLabel('끝점').blur();
    await page.waitForTimeout(400);

    // On the film, not on the step: a trim is a fact about the film.
    expect(Number(await attr(page, sid, 'trimStart'))).toBe(2000);
    expect(Number(await attr(page, sid, 'trimEnd'))).toBe(9500);

    // And the bar is the piece that plays rather than the placeholder.
    expect(Number(await bar.getAttribute('data-duration'))).toBe(7500);
    // Which the panel says out loud, because a length it decides is not a length
    // a reader may type into.
    await expect(inspector.locator('[data-step-length]')).toHaveText('7.5');

    /*
     * And the film starts where the trim says.
     *
     * `currentTime` rather than `paused`: a data URI with no frames never leaves
     * the paused state, so what can be measured is the seek — which is the half
     * of a trim that has to be right, and the half a timer could not do.
     */
    await page.locator('[data-timeline-preview]').click();
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            document.querySelector<HTMLMediaElement>(
              `.sl-stage [data-bc-sid="${CSS.escape(id)}"]`
            )?.currentTime,
          sid
        )
      )
      .toBe(2);
  });

  /**
   * An out-point that is not after the in-point is the reader saying "to the
   * end", which is the only reading that is not a film of negative length.
   */
  test('drops an out-point that is not after the in-point', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setMediaTrim', {
          nodeId: id,
          trimStart: 1000,
          trimEnd: 4000
        }),
      sid
    );
    await page.waitForTimeout(300);
    expect(Number(await attr(page, sid, 'trimEnd'))).toBe(4000);

    await page.evaluate(
      (id) => (window as any).editor.executeCommand('setMediaTrim', { nodeId: id, trimStart: 6000 }),
      sid
    );
    await page.waitForTimeout(300);
    expect(Number(await attr(page, sid, 'trimStart'))).toBe(6000);
    expect(Number(await attr(page, sid, 'trimEnd'))).toBe(0);
  });

  /**
   * The gesture a video editor has, which this timeline did not: the trim was two
   * typed fields beside a bar that drew it.
   *
   * A film's bar is the one on this axis whose ends do not mean "when" and "how
   * long" — they are the part of the *file* that plays — so it has two grips
   * rather than one, and the head takes the step's delay with it. The arithmetic
   * and its three clamps are unit-tested in
   * `office-slides/test/timeline.test.ts`; what only a browser shows is that the
   * tail does not move when the head is dragged, and that the two attributes land
   * in one undo.
   */
  test('trims by dragging the bar’s ends, and the head keeps the tail still', async ({ page }) => {
    await openDeck(page);
    const sid = await place(page, 'insertVideo', VIDEO);
    await page.evaluate(
      (id) =>
        (window as any).editor.executeCommand('setBoxPlayback', {
          nodeId: id,
          startsWith: 'onClick'
        }),
      sid
    );
    await page.waitForTimeout(500);

    const bar = page.locator('[data-timeline] .sl-timeline-bar[data-kind="play"]');
    await expect(bar).toHaveCount(1);
    // Two grips, which a build's bar does not have: there is nothing at the front
    // of an entrance to skip.
    await expect(bar.locator('.sl-timeline-grip')).toHaveCount(2);

    const lane = (await page.locator('[data-timeline] .sl-timeline-lane').first().boundingBox())!;
    const pull = async (edge: 'head' | 'tail', by: number) => {
      const grip = (await bar.locator(`.sl-timeline-grip[data-edge="${edge}"]`).boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + by, grip.y + grip.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    };

    // The tail is where a film *gets* an out-point — until then the attribute is
    // not even written, because "to the end" is the absence of an answer rather
    // than a number.
    expect(await attr(page, sid, 'trimEnd')).toBeUndefined();
    await pull('tail', lane.width * 0.2);
    const end = Number(await attr(page, sid, 'trimEnd'));
    expect(end).toBeGreaterThan(0);

    const right = async () => {
      const box = (await bar.boundingBox())!;
      return box.x + box.width;
    };
    const before = await right();

    await pull('head', lane.width * 0.1);
    // Both attributes moved, and by the same amount: the film begins further in
    // and starts later, which is what keeps the frame under the pointer still.
    const start = Number(await attr(page, sid, 'trimStart'));
    expect(start).toBeGreaterThan(0);
    expect(Number(await attr(page, sid, 'trimEnd'))).toBe(end);
    expect(
      await page.evaluate(() => {
        const step = document
          .querySelector('[data-timeline] .sl-timeline-bar[data-kind="play"]')!
          .getAttribute('data-step')!;
        return (window as any).editor.dataStore.getNode(step)?.attributes?.delay;
      })
    ).toBe(start);
    // And the tail stayed where it was, give or take the rounding of a percentage.
    expect(Math.abs((await right()) - before)).toBeLessThan(4);

    // One gesture, one undo: the trim and the delay are one transaction.
    await page.evaluate(() => (window as any).editor.undo());
    await page.waitForTimeout(400);
    expect(Number(await attr(page, sid, 'trimStart'))).toBe(0);
    expect(Number(await attr(page, sid, 'trimEnd'))).toBe(end);
  });
});
