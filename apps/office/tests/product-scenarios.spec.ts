import { expect, test, type Page } from '@playwright/test';
import { openLocalLibrary } from './helpers/local-library';
import { nativeEditor } from './helpers/native-editor';

async function create(page: Page, product: 'Word' | 'Slides' | 'Site', title: string) {
  await openLocalLibrary(page);
  await page.getByRole('button', { name: `${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  // Slides loads a separate entry before its mounted editor starts persistence.
  if (product === 'Slides') await expect(nativeEditor(page).getByRole('toolbar', { name: '문서 편집', exact: true })).toBeVisible();
  await expect(nativeEditor(page).locator(`[data-${product === 'Slides' ? 'slide' : product.toLowerCase()}-save-status]`)).toHaveText('저장됨');
}

async function home(page: Page) {
  await nativeEditor(page).locator('.office-product-menu [data-menu]').click();
  await nativeEditor(page).getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
}

for (const product of ['Slides', 'Site'] as const) {
  test(`[OFFICE-${product.toUpperCase()}-NAV-LAST-001] preserves the last native input across another product and reopens the same identity`, async ({ page }, info) => {
    await page.goto('/');
    const title = `${product} 마지막 입력`;
    await create(page, product, title);
    const originalUrl = page.url();
    const marker = `${product.toUpperCase()} OFFICE FINAL!`;
    if (product === 'Slides') {
      await nativeEditor(page).getByRole('button', { name: '삽입', exact: true }).click();
      await nativeEditor(page).getByRole('menuitem', { name: /^새 슬라이드(?: |$)/ }).click();
    } else {
      const chooser = nativeEditor(page).locator('[data-admin-open="home"]');
      if (await chooser.isVisible()) await chooser.click();
      const paragraph = nativeEditor(page).locator('[data-frame="desktop"] .w-paragraph').first();
      await paragraph.scrollIntoViewIfNeeded();
      const box = await paragraph.boundingBox();
      if (!box) throw new Error('The native Site paragraph is not visible.');
      // Site owns hit testing through its overlay. Use the actual screen point.
      const x = box.x + Math.min(20, box.width / 2), y = box.y + box.height / 2;
      await page.keyboard.down('Meta');
      try { await page.mouse.click(x, y); } finally { await page.keyboard.up('Meta'); }
      await page.mouse.dblclick(x, y);
      await expect(nativeEditor(page).locator('[data-frame="desktop"] .st-overlay')).toHaveAttribute('data-mode', 'text');
    }
    // The final native input immediately precedes the real navigation flush; no autosave wait.
    await page.keyboard.type(marker);
    await home(page);
    await create(page, 'Word', `${product} 이동 대상`);
    await home(page);
    await page.getByRole('button', { name: `${product} ${title}`, exact: true }).click();
    await expect(page).toHaveURL(originalUrl);
    if (product === 'Slides') {
      // A matching URL precedes async native restore. Confirm the restored graph before disclosure.
      await expect(nativeEditor(page).locator('[data-slide-save-status]')).toHaveText('저장됨');
      await expect(nativeEditor(page).locator('.sl-filmstrip button[data-slide]').last()).toHaveAttribute('title', marker);
      await nativeEditor(page).getByRole('button', { name: '슬라이드 탐색 펼치기', exact: true }).click();
      await expect(nativeEditor(page).locator('[data-filmstrip-panel]')).toBeVisible();
      await expect(nativeEditor(page).locator('.sl-filmstrip button[data-slide]')).toHaveCount(2);
      await nativeEditor(page).locator('.sl-filmstrip button[data-slide]').last().click();
      await expect(nativeEditor(page).locator('.sl-stage')).toContainText(marker);
    } else {
      const chooser = nativeEditor(page).locator('[data-admin-open="home"]');
      if (await chooser.isVisible()) await chooser.click();
      await expect(nativeEditor(page).locator('[data-frame="desktop"] .w-paragraph').first()).toHaveText(marker);
    }
    await info.attach('product-navigation-identity', { body: JSON.stringify({ product, originalUrl, reopenedUrl: page.url(), marker }), contentType: 'application/json' });
  });
}
