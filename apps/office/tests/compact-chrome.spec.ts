import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = `${process.cwd()}/../../.dev/artifacts/design-system`;

test('Slides compact header, ruler and timeline keep controls readable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'S Slides 새 자료 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('작은 화면 UI 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.locator('.sl-stage')).toBeVisible();
  await mkdir(output, { recursive: true });
  for (const width of [560, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const header = page.locator('.office-editor-header');
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(124);
    expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await header.locator('[data-present]').evaluate(el => {
      const r = el.getBoundingClientRect(), parent = el.closest('.office-editor-actions')!.getBoundingClientRect();
      return r.right <= parent.right + 1 && r.left >= parent.left;
    })).toBe(true);
    const view = header.locator('.office-editor-view');
    const tops = await view.locator(':scope > *').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(12);
    const zoom = page.getByRole('textbox', { name: '확대/축소', exact: true });
    await zoom.fill('25%'); await zoom.press('Enter');
    const labels = page.locator('[data-ruler=x] .sl-ruler-tick i');
    await expect.poll(() => labels.count()).toBeGreaterThan(1);
    const positions = await labels.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left));
    for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThan(40);
    const head = page.locator('.sl-timeline-head');
    expect((await head.boundingBox())!.height).toBeLessThanOrEqual(32);
    await expect(page.getByRole('button', { name: '시간축 확대', exact: true })).toBeHidden();
    await page.screenshot({ animations: 'disabled', path: `${output}/compact-chrome-${width}.png` });
  }
  await page.getByRole('button', { name: '타임라인 펼치기', exact: true }).click();
  const magnify = page.getByRole('button', { name: '시간축 확대', exact: true });
  await expect(magnify).toBeVisible(); await magnify.focus(); await magnify.press('Enter');
  await expect(page.locator('[data-timeline-magnified]')).toHaveText('2×');
  await page.getByRole('button', { name: '타임라인 접기', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  expect((await page.locator('.office-editor-header').boundingBox())!.height).toBeLessThanOrEqual(56);
});
