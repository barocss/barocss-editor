import { test, expect, type Page } from '@playwright/test';
import { placeCaret } from './helpers';

async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await placeCaret(page, '.w-paragraph');
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '삽입', exact: true }).click();
  await page.getByRole('button', { name: '본문 수식', exact: true }).click();
  await page.locator('.w-math-draft .me-input').fill('x+2');
  await page.locator('.w-math-draft .me-input').press('Enter');
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await page.keyboard.type(' after');
  await page.getByRole('tab', { name: '홈', exact: true }).click();
}

test('caret toolbar opens inline editing and stays hidden while editing and after commit', async ({ page }) => {
  await prepare(page);
  const toolbar = page.getByRole('toolbar', { name: 'Word 수식 도구', exact: true });
  await expect(toolbar).toHaveCount(0);
  await page.locator('#editor .w-math').click();
  await expect(toolbar).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  await toolbar.getByRole('button', { name: '수식 바로 편집', exact: true }).click();
  const input = page.locator('.w-math-draft .me-input');
  await expect(input).toBeFocused(); await expect(toolbar).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
  await input.fill('42'); await input.press('Enter');
  await expect(page.locator('.w-math-draft')).toHaveCount(0);
  await expect(page.locator('#editor .w-math > .w-math-run')).toHaveText('42+2');
  await expect(toolbar).toHaveCount(0);
  await page.keyboard.type(' end');
  await expect(page.locator('#editor .w-math > .w-math-run')).toHaveText('42+2');
});

test('Escape stays dismissed until another click; leaving math or focusing a field hides the toolbar', async ({ page }) => {
  await prepare(page);
  const toolbar = page.getByRole('toolbar', { name: 'Word 수식 도구', exact: true });
  await page.locator('#editor .w-math').click();
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape'); await expect(toolbar).toHaveCount(0);
  await page.keyboard.press('ArrowLeft'); await expect(toolbar).toHaveCount(0);
  await page.locator('#editor .w-math').click(); await expect(toolbar).toBeVisible();
  await page.getByRole('textbox', { name: '문서 제목', exact: true }).focus();
  await expect(toolbar).toHaveCount(0);
  await page.locator('#editor .w-math').click(); await expect(toolbar).toBeVisible();
  await page.keyboard.press('End'); await page.keyboard.press('ArrowRight');
  await expect(toolbar).toHaveCount(0);
});

test('dismissal survives focus return and scroll; nested input ownership suppresses tools', async ({ page }) => {
  await prepare(page);
  const toolbar = page.getByRole('toolbar', { name: 'Word 수식 도구', exact: true });
  const math = page.locator('#editor .w-math');
  await math.click(); await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '문서 제목', exact: true }).focus();
  await math.focus();
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('scroll')); });
  await expect(toolbar).toHaveCount(0);
  await math.click(); await expect(toolbar).toBeVisible();
  await page.evaluate(() => {
    const scope = document.querySelector('#editor [contenteditable="true"]')!;
    const owner = document.createElement('div'); owner.setAttribute('data-editor-input-owner', 'test-math');
    owner.setAttribute('data-test-nested-owner', '');
    const input = document.createElement('input'); owner.append(input); scope.append(owner); input.focus();
  });
  await expect(toolbar).toHaveCount(0);
  await page.evaluate(() => document.querySelector('[data-test-nested-owner]')?.remove());
  await math.click(); await expect(toolbar).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(toolbar).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(toolbar).toBeVisible();
});

test('math tools follow ancestor transforms and hide behind a clipped document region', async ({ page }) => {
  await prepare(page);
  const math = page.locator('#editor .w-math');
  const toolbar = page.getByRole('toolbar', { name: 'Word 수식 도구', exact: true });
  await math.click(); await expect(toolbar).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const initial = (await toolbar.boundingBox())!;
  await page.locator('.w-zoom-page').evaluate(element => {
    (element as HTMLElement).style.transform = 'translate(60px, 40px) scale(.8)';
  });
  await expect.poll(async () => (await toolbar.boundingBox())?.x).not.toBe(initial.x);
  const anchor = (await math.boundingBox())!, tools = (await toolbar.boundingBox())!;
  expect(Math.abs(tools.x - anchor.x)).toBeLessThan(5);
  expect(tools.y + tools.height).toBeLessThanOrEqual(anchor.y);
  await page.locator('.w-zoom-frame').evaluate(element => {
    const frame = element as HTMLElement;
    frame.dataset.testStyle = frame.getAttribute('style') ?? '';
    frame.style.overflow = 'hidden'; frame.style.height = '1px';
  });
  await expect(toolbar).toHaveCount(0);
  // The equation itself still has a viewport rect; only its scroll/clip ancestor hid it.
  expect((await math.boundingBox())!.y).toBeGreaterThan(0);
  await page.locator('.w-zoom-frame').evaluate(element => element.setAttribute('style', (element as HTMLElement).dataset.testStyle!));
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.w-zoom-page').evaluate(element => { (element as HTMLElement).style.transform = 'scale(1)'; });
  await expect(toolbar).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
});
