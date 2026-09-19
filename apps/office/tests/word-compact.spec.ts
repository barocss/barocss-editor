import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('Word fits a narrow pane without changing document layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'W Word 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('작은 화면 문서');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('.w-surface').first()).toBeVisible();
  const paragraph = page.locator('.w-paragraph').last();
  const content = 'A document must keep its line breaks when its viewport changes. '.repeat(14);
  await paragraph.click();
  await page.keyboard.type(content);
  const layout = () => page.evaluate(() => Array.from((window as any).wordLayout?.values() ?? []).map((surface: any) => surface.pages.map((slice: any) => slice.fragments.map((f: any) => `${f.sid}:${f.fromLine}-${f.toLine}`).join(',')).join('|')).join(';'));
  await expect.poll(layout).not.toBe('');
  const before = await layout();
  const selection = await page.evaluate(() => JSON.stringify((window as any).editor.selection));
  await mkdir('../../.dev/artifacts/design-system', { recursive: true });
  for (const width of [560, 390, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const header = page.locator('.office-editor-header');
    await expect(header.locator('[data-zoom-fit]')).toBeVisible();
    await header.locator('[data-zoom-fit]').click();
    await expect.poll(() => page.locator('.w-shell-document').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    const edges = await page.locator('.w-shell-document').evaluate(el => {
      const pane = el.getBoundingClientRect(), paper = el.querySelector('.w-surface')!.getBoundingClientRect();
      return { left: paper.left - pane.left, right: pane.right - paper.right };
    });
    expect(edges.left).toBeGreaterThanOrEqual(14);
    expect(edges.right).toBeGreaterThanOrEqual(14);
    expect(await header.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(width > 1100 ? 56 : 124);
    await expect.poll(layout).toBe(before);
    expect(await page.evaluate(() => JSON.stringify((window as any).editor.selection))).toBe(selection);
    await expect(paragraph).toHaveText(content.trim());
    await page.locator('.w-shell-document').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `../../.dev/artifacts/design-system/word-compact-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  const zoom = page.locator('[data-zoom-value]');
  await zoom.fill('150%'); await zoom.press('Enter');
  const pane = page.locator('.w-shell-document');
  await pane.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect.poll(() => pane.evaluate(el => {
    const box = el.getBoundingClientRect(), surface = el.querySelector('.w-surface')!.getBoundingClientRect();
    return Math.abs(box.right - surface.right - parseFloat(getComputedStyle(el).paddingRight));
  })).toBeLessThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.w-surface')!, box = surface.getBoundingClientRect();
    const ruler = document.querySelector('.w-ruler-text')!.getBoundingClientRect();
    return Math.abs(ruler.left - box.left - parseFloat(getComputedStyle(surface).paddingLeft) * box.width / surface.offsetWidth);
  })).toBeLessThanOrEqual(2);
  await expect.poll(layout).toBe(before);
  // The same control remains mounted when the detail tools open.
  await page.getByRole('button', { name: '상세 도구', exact: true }).click();
  await page.getByRole('tab', { name: '보기', exact: true }).click();
  await expect(page.locator('[data-zoom-value]')).toHaveCount(1);
});
