import { expect, test, type Page } from '@playwright/test';

type IdleGate = { pending(): number; release(): void };

async function arrivalState(page: Page) {
  return page.evaluate(() => {
    const current = document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide');
    const slide = current ? document.querySelector(`.sl-stage .sl-slide[data-bc-sid="${CSS.escape(current)}"]`) : null;
    const rect = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      current, slide: rect(slide), overlay: rect(document.querySelector('.sl-overlay')),
      pane: rect(document.querySelector('.sl-stage')),
      frame: rect(document.querySelector('.sl-stage-frame')),
      editable: slide?.closest('[contenteditable]')?.getAttribute('contenteditable'),
      saved: document.querySelector('[data-slide-save-status]')?.textContent,
      held: (window as unknown as { lateSlideRender: IdleGate }).lateSlideRender.pending(),
    };
  });
}

test('[SLIDES-OVERLAY-LATE-ARRIVAL-001] mounts the current slide overlay after delayed rendering without a user gesture', async ({ page }, info) => {
  const observations: unknown[] = [];
  const session = await page.context().newCDPSession(page);
  // Synthetic scheduling setup: exercise the real renderer's five-ms idle yield.
  await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.addInitScript(() => {
    const request = window.requestIdleCallback.bind(window);
    const cancel = window.cancelIdleCallback.bind(window);
    const callbacks = new Map<number, { callback: IdleRequestCallback; options?: IdleRequestOptions }>();
    let held = true, id = 100_000;
    (window as unknown as { lateSlideRender: IdleGate }).lateSlideRender = {
      pending: () => callbacks.size,
      release() {
        held = false;
        for (const [ticket, entry] of callbacks) {
          callbacks.delete(ticket);
          request(entry.callback, entry.options);
        }
      },
    };
    window.requestIdleCallback = (callback, options) => {
      if (!held) return request(callback, options);
      const ticket = ++id;
      callbacks.set(ticket, { callback, options });
      return ticket;
    };
    window.cancelIdleCallback = ticket => {
      if (!callbacks.delete(ticket)) cancel(ticket);
    };
  });
  try {
    await page.goto('/');
    await expect.poll(async () => {
      const state = await arrivalState(page);
      return !!state.current && !!state.pane && state.pane.width > 100 && state.held > 0 && state.saved === '저장됨';
    }).toBe(true);
    const before = await arrivalState(page);
    observations.push({ phase: 'before-native-renderer-release', state: before });
    expect(before.slide).toBeNull();
    expect(before.overlay).toBeNull();
    await page.evaluate(() => (window as unknown as { lateSlideRender: IdleGate }).lateSlideRender.release());
    await expect.poll(async () => (await arrivalState(page)).slide?.width ?? 0).toBeGreaterThan(100);
    // Only normal product notifications may create the overlay after DOM arrival.
    await expect(page.locator('.sl-overlay')).toBeVisible();
    const after = await arrivalState(page);
    observations.push({ phase: 'normal-product-overlay', state: after });
    expect(after.current).toBe(before.current);
    expect(after.pane).toEqual(before.pane);
    expect(after.editable).toBe('true');
    expect(after.saved).toBe('저장됨');
    expect(after.slide).not.toBeNull();
    expect(after.overlay).not.toBeNull();
    for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(after.slide![coordinate] - after.overlay![coordinate])).toBeLessThan(1);
    }
  } finally {
    observations.push({ phase: 'final', state: await arrivalState(page).catch(() => null) });
    await info.attach('late-render-arrival', { body: JSON.stringify({ setup: 'native idle-callback gate and CPU6, no model writes', observations }), contentType: 'application/json' });
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});
