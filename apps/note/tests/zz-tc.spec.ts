import { test } from '@playwright/test';
test('글자 그릇 표시', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelectorAll('[data-note-body] .on-doc').length === 3);
  await page.waitForTimeout(400);
  console.log(await page.evaluate(() => {
    const body = document.querySelector('[data-case="long"] [data-note-body]')!;
    const p = body.querySelector('p')!;
    return JSON.stringify({
      hasTC: body.querySelectorAll('[data-text-container]').length,
      pAttrs: [...p.attributes].map((a) => a.name),
      runAttrs: p.firstElementChild ? [...p.firstElementChild.attributes].map((a) => a.name) : null,
      runTag: p.firstElementChild?.tagName
    }, null, 1);
  }));
});
