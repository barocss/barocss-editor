import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ retries: 0 });
test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });

interface ReadGate {
  calls: string[];
  blocked: number;
  release(): void;
}

async function ready(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
}

async function delayLibraryReads(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    const pending: Array<() => void> = [];
    const gate: ReadGate = {
      calls: [], blocked: 0,
      release() {
        IDBObjectStore.prototype.getAll = original;
        for (const complete of pending.splice(0)) complete();
      },
    };
    (window as unknown as { libraryReadGate: ReadGate }).libraryReadGate = gate;
    IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      const transaction = this.transaction;
      if (['barocss-site-workspace', 'barocss-site-recovery'].includes(transaction.db.name)) {
        gate.calls.push(`${transaction.db.name}/${this.name}`);
        // Read real IndexedDB records, but hold the completion notification that rows() awaits.
        transaction.addEventListener('complete', event => {
          event.stopImmediatePropagation();
          gate.blocked += 1;
          pending.push(() => transaction.oncomplete?.call(transaction, event));
        }, { once: true });
      }
      return original.apply(this, args);
    };
  });
}

const readGate = (page: Page) => page.evaluate(() => {
  const gate = (window as unknown as { libraryReadGate: ReadGate }).libraryReadGate;
  return { calls: gate.calls, blocked: gate.blocked };
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  try {
    const state = await page.evaluate(() => {
      const gate = (window as unknown as { libraryReadGate?: ReadGate }).libraryReadGate;
      return {
        focused: document.activeElement?.outerHTML,
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => element.outerHTML),
        saveStatus: document.querySelector('[data-site-save-status]')?.textContent,
        reads: gate ? { calls: gate.calls, blocked: gate.blocked } : null,
      };
    });
    await info.attach('library-focus-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  } catch (error) {
    await info.attach('library-focus-diagnostic-error', { body: String(error), contentType: 'text/plain' });
  }
});

for (const closeWith of ['Escape', 'Enter'] as const) {
  test(`recent documents restores the same opener after closing with ${closeWith}`, async ({ page }) => {
    await ready(page);
    const trigger = page.getByRole('button', { name: '최근 자료', exact: true });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    const originalButton = await trigger.elementHandle();
    if (!originalButton) throw new Error('Recent documents button is missing');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '최근 사이트', exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: '닫기', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press(closeWith);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await originalButton.evaluate(element => element.isConnected && element === document.activeElement)).toBe(true);
    await expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
    await originalButton.dispose();
  });
}

test('recent documents stays disabled during library reads and repeated input opens only one dialog', async ({ page }) => {
  await ready(page);
  await delayLibraryReads(page);
  const trigger = page.getByRole('button', { name: '최근 자료', exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const originalButton = await trigger.elementHandle();
  if (!originalButton) throw new Error('Recent documents button is missing');
  await page.keyboard.press('Enter');
  const loading = page.getByRole('button', { name: '처리 중…', exact: true });
  await expect(loading).toBeDisabled();
  expect(await loading.evaluate((element, original) => element === original, originalButton)).toBe(true);
  await expect.poll(async () => (await readGate(page)).blocked).toBe(2);
  const dialog = page.getByRole('dialog', { name: '최근 사이트', exact: true });
  await expect(dialog).toHaveCount(0);
  for (let attempt = 0; attempt < 3; attempt++) await page.keyboard.press('Enter');
  const bounds = await loading.boundingBox();
  if (!bounds) throw new Error('Loading button has no bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(loading).toBeDisabled();
  await expect(dialog).toHaveCount(0);
  expect((await readGate(page)).calls).toEqual(expect.arrayContaining([
    'barocss-site-workspace/documents', 'barocss-site-recovery/drafts',
  ]));
  expect((await readGate(page)).calls).toHaveLength(2);

  await page.evaluate(() => (window as unknown as { libraryReadGate: ReadGate }).libraryReadGate.release());
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  // The open modal hides its background from role queries; inspect the same opener directly.
  await expect.poll(() => originalButton.evaluate(element =>
    element instanceof HTMLButtonElement && !element.disabled
  )).toBe(true);
  expect((await readGate(page)).calls).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await originalButton.evaluate(element => element.isConnected && element === document.activeElement)).toBe(true);
  await originalButton.dispose();
});
