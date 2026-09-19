import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'format.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { pageId: 'format-test', title: '서식 검증' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: '선택한 글자' }] }
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('서식 검증');
}
async function selectText(page: Page) {
  await page.locator('.on-doc > p').evaluate(element => {
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
    const range = document.createRange(); range.selectNodeContents(element);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  await expect(page.locator('[data-note-formatting]')).toBeVisible();
}
async function marks(page: Page) {
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open('barocss-note'); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('documents'), row = tx.objectStore('documents').get('format-test');
      tx.oncomplete = () => { db.close(); resolve(JSON.parse(row.result.text).document.content[0].content.flatMap((node: any) => node.marks ?? [])); }; };
  }));
}

test('긴 슬래시 설명은 항목명 아래에 배치되고 작은 화면에서도 이름이 잘리지 않는다', async ({ page }, info) => {
  await ready(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.on-doc > p').click(); await page.keyboard.press('End'); await page.keyboard.type(' /'); await expect(page.locator('[data-slash-item]').first()).toBeVisible(); await page.keyboard.insertText('데이터');
  const row = page.locator('[data-slash-item]').filter({ hasText: '데이터베이스' });
  await expect(row).toBeVisible();
  await row.evaluate(async element => { await Promise.all(element.closest('[data-floating-surface]')!.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))); });
  const label = row.locator('[data-menu-label]');
  await expect(label).toHaveText('데이터베이스');
  const { first, second } = await row.evaluate(element => ({ first: element.querySelector('[data-menu-label]')!.getBoundingClientRect().toJSON(), second: element.querySelector('[data-menu-description]')!.getBoundingClientRect().toJSON() }));
  expect(first.width).toBeGreaterThan(100); expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(first.x + first.width).toBeLessThanOrEqual(390);
  expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('slash-menu-mobile.png') });
});

test('선택 도구의 코드·색상·배경·첨자는 저장되고 실행 취소 및 서식 지우기가 동작한다', async ({ page }, info) => {
  await ready(page); await selectText(page);
  const toolbar = page.locator('[data-note-formatting]');
  await toolbar.getByRole('button', { name: '인라인 코드', exact: true }).click();
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'code')).toBe(true);
  await toolbar.getByRole('button', { name: '글자색 및 배경색' }).click();
  await toolbar.getByRole('menuitemradio', { name: '글자색 빨강', exact: true }).click();
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'fontColor' && mark.attrs?.color === '#d44c47')).toBe(true);
  await expect.poll(() => page.locator('.on-doc > p').evaluate(element => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    return getComputedStyle(text.parentElement!).color;
  })).toBe('rgb(212, 76, 71)');
  await selectText(page); await toolbar.getByRole('button', { name: '글자색 및 배경색' }).click();
  await toolbar.getByRole('button', { name: '배경색', exact: true }).click();
  await toolbar.getByRole('menuitemradio', { name: '배경색 노랑', exact: true }).click();
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'bgColor' && mark.attrs?.bgColor === '#fbf3db')).toBe(true);
  await selectText(page); await toolbar.getByRole('button', { name: '추가 서식', exact: true }).click(); await toolbar.getByRole('menuitem', { name: '위 첨자', exact: true }).click();
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'superscript')).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'superscript')).toBe(false);
  await page.reload(); await selectText(page); await page.setViewportSize({ width: 390, height: 844 });
  await toolbar.getByRole('button', { name: '글자색 및 배경색' }).click();
  const menu = page.getByRole('menu', { name: '글자 색상 선택', exact: true });
  await expect(menu.getByRole('menuitemradio', { name: '글자색 빨강', exact: true })).toHaveAttribute('aria-checked', 'true');
  const bounds = (await menu.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await menu.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))); });
  await page.screenshot({ path: info.outputPath('formatting-mobile.png') });
  await menu.getByRole('menuitemradio', { name: '기본 글자색', exact: true }).click();
  await expect.poll(async () => (await marks(page)).some(mark => mark.stype === 'fontColor')).toBe(false);
  expect((await marks(page)).some(mark => mark.stype === 'bgColor')).toBe(true);
  await selectText(page); await toolbar.getByRole('button', { name: '글자색 및 배경색' }).click();
  await menu.getByRole('button', { name: '배경색', exact: true }).click();
  await expect(menu.getByRole('menuitemradio', { name: '배경색 노랑', exact: true })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemradio', { name: '배경색 없음', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: '배경색 회색', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  await expect(toolbar).toBeVisible();
  await selectText(page);
  await toolbar.getByRole('button', { name: '추가 서식', exact: true }).click(); await toolbar.getByRole('menuitem', { name: '서식 지우기', exact: true }).click();
  await expect.poll(() => marks(page)).toEqual([]);
  await expect(page.locator('.on-doc > p')).toHaveText('선택한 글자');
});
