import { expect, test, type Page } from '@playwright/test';

async function create(page: Page, product: 'Word' | 'Slides' | 'Site', title: string) {
  await page.getByRole('button', { name: `${product[0]} ${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill(title);
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  // Slides loads a separate entry before its mounted editor starts persistence.
  if (product === 'Slides') await expect(page.getByRole('toolbar', { name: '슬라이드 서식', exact: true })).toBeVisible();
  await expect(page.locator(`[data-${product === 'Slides' ? 'slide' : product.toLowerCase()}-save-status]`)).toHaveText('저장됨');
}

async function home(page: Page) {
  await page.locator('.office-product-menu [data-menu]').click();
  await page.getByRole('menuitem', { name: '자료함', exact: true }).click();
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
      await page.locator('.sl-toolbar').getByRole('menuitem', { name: '슬라이드', exact: true }).click();
      await page.getByRole('menuitem', { name: '새 슬라이드', exact: true }).click();
    } else {
      await page.locator('[data-admin-open="home"]').click();
      const paragraph = page.locator('[data-frame="desktop"] .w-paragraph').first();
      await paragraph.click({ force: true, modifiers: ['Meta'] });
      await paragraph.dblclick({ force: true });
      await expect(page.locator('[data-frame="desktop"] .st-overlay')).toHaveAttribute('data-mode', 'text');
    }
    // The final native input immediately precedes the real navigation flush; no autosave wait.
    await page.keyboard.type(marker);
    await home(page);
    await create(page, 'Word', `${product} 이동 대상`);
    await home(page);
    await page.getByRole('button', { name: `${product[0]} ${title}`, exact: true }).click();
    await expect(page).toHaveURL(originalUrl);
    if (product === 'Slides') {
      await expect(page.locator('.sl-filmstrip button[data-slide]')).toHaveCount(2);
      await page.locator('.sl-filmstrip button[data-slide]').last().click();
      await expect(page.locator('.sl-stage')).toContainText(marker);
    } else {
      await page.locator('[data-admin-open="home"]').click();
      await expect(page.locator('[data-frame="desktop"] .w-paragraph').first()).toHaveText(marker);
    }
    await info.attach('product-navigation-identity', { body: JSON.stringify({ product, originalUrl, reopenedUrl: page.url(), marker }), contentType: 'application/json' });
  });
}
