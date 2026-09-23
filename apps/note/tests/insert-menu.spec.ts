import { expect, test, type Page } from '@playwright/test';

for (const position of ['only', 'last', 'hover-other'] as const) {
  test(`insert menu survives pointer leaving its ${position} block`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('노트 제목')).toBeVisible();
    await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
      name: 'insert.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        format: 'barocss-note', version: 1,
        document: { stype: 'note', attributes: { title: 'Insert menu' }, content:
          (position === 'only' ? ['Target'] : ['Before', 'Target']).map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] })) }
      }))
    });
    // Embedded hosts may shrink the body to its content instead of the app's 430px minimum.
    await page.addStyleTag({ content: '.nw-document .on-doc, .on-body { min-height: 0 !important; }' });
    const target = page.locator('.on-doc > p').filter({ hasText: 'Target' });
    await target.hover();
    const trigger = page.getByRole('button', { name: '블록 추가', exact: true });
    await trigger.click();
    const menu = page.locator('[data-note-insert]');
    const quote = menu.locator('[data-note-control="insertQuote"]');
    await expect(quote).toBeVisible();
    if (position === 'hover-other') await page.locator('.on-doc > p').first().hover();
    await expect(quote).toBeVisible();
    const bounds = await quote.boundingBox();
    const body = await page.locator('.on-body-hold').boundingBox();
    if (!bounds || !body) throw new Error('Missing menu geometry');
    expect(bounds.y + bounds.height / 2).toBeGreaterThan(body.y + body.height);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 20 });
    await expect(quote).toBeVisible();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.locator('.on-doc > blockquote')).toHaveCount(1);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.on-doc > blockquote').locator('xpath=preceding-sibling::*[1]')).toHaveText('Target');
  });
}


async function openShortDocument(page: Page, title: string, paragraphs = ['Target']) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
    name: 'insert-dismiss.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'barocss-note', version: 1,
      document: { stype: 'note', attributes: { title }, content:
        paragraphs.map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] })) },
    })),
  });
  await expect(page.getByLabel('노트 제목')).toHaveValue(title);
  await page.addStyleTag({ content: '.nw-document .on-doc, .on-body { min-height: 0 !important; }' });
  return page.locator('.on-doc > p').filter({ hasText: 'Target' });
}

test('short-document insert menu closes on outside click and Escape and can reopen after each dismissal', async ({ page }) => {
  const target = await openShortDocument(page, 'Dismiss insertion menu');
  const trigger = page.getByRole('button', { name: '블록 추가', exact: true });
  const menu = page.locator('[data-note-insert]');
  await target.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByLabel('노트 제목').click();
  await expect(menu).toHaveCount(0);
  await expect(target).toHaveText('Target');

  await target.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(target).toHaveText('Target');

  await target.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  await menu.locator('[data-note-control="insertQuote"]').click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.on-doc > blockquote')).toHaveCount(1);
  await expect(page.locator('.on-doc > blockquote').locator('xpath=preceding-sibling::*[1]')).toHaveText('Target');
});

test('switching documents removes the open insertion menu and does not restore it when returning', async ({ page }) => {
  const title = 'Insertion menu source document';
  const target = await openShortDocument(page, title);
  const menu = page.locator('[data-note-insert]');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await target.hover();
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await expect(page.getByLabel('노트 제목')).toHaveValue('새 노트');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.on-doc > blockquote')).toHaveCount(0);

  await page.getByRole('navigation', { name: '노트 목록' }).getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByLabel('노트 제목')).toHaveValue(title);
  await expect(target).toHaveText('Target');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.on-doc > blockquote')).toHaveCount(0);
  await target.hover();
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await expect(menu).toBeVisible();
});

for (const nested of ['list', 'quote'] as const) {
  test(`iframe insertion menu remains usable outside a nested ${nested} paragraph`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(url => url.pathname === '/insert-menu-host', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Embedded insertion menu</title></head>
        <body style="margin:40px"><iframe name="insert-note" title="Embedded Note" src="/"
          width="1100" height="700" style="border:0"></iframe></body></html>`,
    }));
    await page.goto('/insert-menu-host');
    const surface = page.frameLocator('iframe[name="insert-note"]');
    await expect(surface.getByLabel('노트 제목')).toBeVisible();
    const paragraph = { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Nested target' }] };
    const container = nested === 'list'
      ? { stype: 'list', attributes: { type: 'bullet' }, content: [{ stype: 'listItem', content: [paragraph] }] }
      : { stype: 'blockQuote', content: [paragraph] };
    await surface.getByLabel('노트 파일', { exact: true }).setInputFiles({
      name: 'nested-insert.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        format: 'barocss-note', version: 1,
        document: { stype: 'note', attributes: { title: 'Nested insertion menu' }, content: [container] },
      })),
    });
    const frame = page.frame({ name: 'insert-note' });
    if (!frame) throw new Error('Embedded Note frame is missing');
    await frame.addStyleTag({ content: '.nw-document .on-doc, .on-body { min-height: 0 !important; }' });
    const target = surface.locator(nested === 'list' ? '.on-doc > .w-list .w-list-item p' : '.on-doc > blockquote p');
    await expect(target).toHaveText('Nested target');
    await target.hover();
    await surface.getByRole('button', { name: '블록 추가', exact: true }).click();
    const menu = surface.locator('[data-note-insert]');
    const quote = menu.locator('[data-note-control="insertQuote"]');
    await expect(quote).toBeVisible();
    const bounds = await quote.boundingBox();
    const body = await surface.locator('.on-body-hold').boundingBox();
    if (!bounds || !body) throw new Error('Embedded insertion menu geometry is missing');
    expect(bounds.y + bounds.height / 2).toBeGreaterThan(body.y + body.height);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 20 });
    await expect(quote).toBeVisible();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(menu).toHaveCount(0);
    const quotes = surface.locator('.on-doc > blockquote');
    await expect(quotes).toHaveCount(nested === 'quote' ? 2 : 1);
    await expect(quotes.last()).toHaveText('인용할 문장을 여기에 씁니다.');
    await expect(quotes.last().locator('xpath=preceding-sibling::*[1]')).toHaveText('Nested target');
  });
}


test('merging away the insertion target closes its menu and lets the remaining paragraph reopen it', async ({ page }) => {
  const target = await openShortDocument(page, 'Deleted insertion target', ['Before', 'Target']);
  await target.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await expect.poll(() => target.evaluate(element => {
    const selection = document.getSelection();
    return element.contains(selection?.anchorNode ?? null) && selection?.anchorOffset === 0 && selection.isCollapsed;
  })).toBe(true);
  const targetId = await target.getAttribute('data-bc-sid');
  expect(targetId).toBeTruthy();
  const focused = await page.evaluateHandle(() => document.activeElement);
  const trigger = page.getByRole('button', { name: '블록 추가', exact: true });
  const menu = page.locator('[data-note-insert]');
  await target.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  expect(await focused.evaluate(element => element === document.activeElement)).toBe(true);

  await page.keyboard.press('Backspace');
  const remaining = page.locator('.on-doc > p');
  await expect(remaining).toHaveCount(1);
  await expect(remaining).toHaveText('BeforeTarget');
  await expect(page.locator(`[data-bc-sid="${targetId}"]`)).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  await remaining.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  await menu.locator('[data-note-control="insertQuote"]').click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.on-doc > blockquote')).toHaveCount(1);
  await expect(page.locator('.on-doc > blockquote').locator('xpath=preceding-sibling::*[1]')).toHaveText('BeforeTarget');
  await focused.dispose();
});

test('moving the caret to another paragraph closes insertion and a reopened menu uses that paragraph', async ({ page }) => {
  const target = await openShortDocument(page, 'Moved insertion caret', ['Before', 'Target']);
  await target.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await expect.poll(() => target.evaluate(element => {
    const selection = document.getSelection();
    return element.contains(selection?.anchorNode ?? null) && selection?.anchorOffset === 0 && selection.isCollapsed;
  })).toBe(true);
  const focused = await page.evaluateHandle(() => document.activeElement);
  const trigger = page.getByRole('button', { name: '블록 추가', exact: true });
  const menu = page.locator('[data-note-insert]');
  await target.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  expect(await focused.evaluate(element => element === document.activeElement)).toBe(true);

  await page.keyboard.press('ArrowUp');
  const first = page.locator('.on-doc > p').filter({ hasText: 'Before' });
  await expect.poll(() => first.evaluate(element => element.contains(document.getSelection()?.anchorNode ?? null))).toBe(true);
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.on-doc > p')).toHaveText(['Before', 'Target']);
  await first.hover();
  await trigger.click();
  await expect(menu).toBeVisible();
  await menu.locator('[data-note-control="insertQuote"]').click();
  await expect(menu).toHaveCount(0);
  const inserted = page.locator('.on-doc > blockquote');
  await expect(inserted).toHaveCount(1);
  await expect(inserted.locator('xpath=preceding-sibling::*[1]')).toHaveText('Before');
  await expect(inserted.locator('xpath=following-sibling::*[1]')).toHaveText('Target');
  await focused.dispose();
});
