import { expect, test, type Page } from '@playwright/test';

const products = ['Note', 'Word', 'Slides', 'Site'] as const;
const native = (page: Page) => page.frameLocator('iframe[data-local-native-frame="active"]');
async function create(page: Page, product: typeof products[number]) {
  await page.goto('/');
  await page.locator('.ow-create').getByRole('button', { name: `${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름', exact: true }).fill(`QA original ${product}`);
  await page.getByRole('dialog').getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('iframe[data-local-native-frame="active"]')).toBeVisible();
  await expect(native(page).locator('.w-paragraph').first()).toBeVisible();
  return new URL(page.url()).pathname;
}

test('the original home and all four native products create, edit, undo/redo and reopen from IndexedDB', async ({ page }) => {
  test.setTimeout(120000);
  const backendRequests: string[] = [], externalAssets: string[] = [], errors: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || /\/realms\//.test(url.pathname) ||
      /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && url.origin !== 'http://127.0.0.1:5394') backendRequests.push(url.origin + url.pathname);
    if (url.origin !== 'http://127.0.0.1:5394') externalAssets.push(url.origin + url.pathname);
  });
  page.on('pageerror', error => errors.push(error.message));
  const paths: Record<string, string> = {};
  for (const product of products) {
    const path = await create(page, product), marker = `QA persisted ${product}`;
    paths[product] = path;
    await expect(page).toHaveTitle('Wonffice · 내 작업 공간');
    const paragraph = native(page).locator('.w-paragraph').first();
    if (product === 'Slides' || product === 'Site') {
      // These original canvas editors enter text through their selection overlay on double click.
      const target = product === 'Slides' ? native(page).locator('.sl-text-frame').first() : paragraph;
      const box = await target.boundingBox();
      if (!box) throw new Error(`No visible ${product} text target`);
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    }
    await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(marker);
    await expect(paragraph).toContainText(marker);
    await page.keyboard.press('Control+z'); await expect(paragraph).not.toContainText(marker);
    await page.keyboard.press('Control+Shift+z'); await expect(paragraph).toContainText(marker);
    await page.keyboard.press('Control+s');
    await expect(native(page).getByText('저장됨', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new URL(path, page.url()).href);
    await expect(native(page).locator('.w-paragraph').first()).toContainText(marker);
    await expect(page.locator('.ow-file-navigation [data-original][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('iframe[data-local-native-frame="active"]')).not.toHaveAttribute('sandbox');
    await page.screenshot({ path: test.info().outputPath(`original-${product.toLowerCase()}.png`), animations: 'disabled' });
  }
  // Exercise Office's existing same-origin frame handshake and SPA history, rather than a redirect.
  const open = async (product: string) => {
    const id = paths[product].split('/').at(-1)!;
    await page.locator(`.ow-file-navigation [data-original="${product.toLowerCase()}:${id}"]`).click();
    await expect(page).toHaveURL(new URL(paths[product], page.url()).href);
    await expect(native(page).locator('.w-paragraph').first()).toContainText(`QA persisted ${product}`);
  };
  await open('Note'); await open('Word');
  await page.goBack(); await expect(page).toHaveURL(new URL(paths.Note, page.url()).href);
  await expect(native(page).locator('.w-paragraph').first()).toContainText('QA persisted Note');
  await page.goForward(); await expect(page).toHaveURL(new URL(paths.Word, page.url()).href);
  await expect(native(page).locator('.w-paragraph').first()).toContainText('QA persisted Word');
  // The original project home and library remain available in the same browser workspace.
  await page.goto('/');
  await page.locator('.ow-library-embedded').getByRole('button', { name: '프로젝트', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '프로젝트 이름', exact: true }).fill('QA original project');
  await page.getByRole('textbox', { name: '프로젝트 목표', exact: true }).fill('Verify existing Wonffice project persistence');
  await page.getByRole('dialog').getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QA original project', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'QA original project', exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.locator('.ow-library-embedded [data-document]')).toHaveCount(4);
  // The unchanged Site sample preview requests its example video; record it without replacing it.
  test.info().annotations.push({ type: 'original-external-assets', description: JSON.stringify(externalAssets) });
  expect(backendRequests).toEqual([]); expect(errors).toEqual([]);
});

test('the production Worker preserves every original HTML entry and refuses missing assets and APIs', async ({ request }) => {
  for (const path of ['/', '/design-system/index.html', ...products.map(product => `/products/${product.toLowerCase()}/index.html`)]) {
    const response = await request.get(path); expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  for (const path of ['/assets/missing.js', '/api/v1/me', '/products/missing/index.html']) {
    const response = await request.get(path); expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<html');
  }
});
