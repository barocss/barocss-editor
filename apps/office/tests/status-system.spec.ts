import { test, expect, type Page, type Frame } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = `${process.cwd()}/../../.dev/artifacts/design-system`;
async function localNative(page: Page): Promise<Frame> {
  const element = page.locator('.ow-native-slot iframe[data-local-native-frame="active"]');
  await expect(element).toHaveCount(1);
  const frame = (await (await element.elementHandle())!.contentFrame())!;
  expect(frame).not.toBeNull();
  await expect(frame.locator('.office-editor-header')).toHaveCount(1);
  return frame;
}
async function create(page: Page, product: string) {
  await page.goto('/');
  await page.getByRole('button', { name: `${product} 새 자료 만들기`, exact: true }).click();
  await page.getByRole('textbox', { name: '새 자료 이름' }).fill('저장 상태 검증');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  return localNative(page);
}

test('feedback keeps the input through failed retries and only runs one pending action', async ({ page }) => {
  await page.goto('/design-system/index.html#feedback');
  const sample = page.locator('#feedback');
  const field = sample.getByRole('textbox', { name: '복구 예시 문서 이름' });
  await field.fill('보존할 문서 제목');
  await sample.getByRole('button', { name: '재시도 실패 확인', exact: true }).click();
  await sample.getByRole('button', { name: '저장 다시 시도', exact: true }).dblclick();
  await expect(sample.getByRole('button', { name: '저장 다시 시도', exact: true })).toBeDisabled();
  await expect(sample.getByRole('alert')).toContainText('저장하지 못했습니다');
  await expect(field).toHaveValue('보존할 문서 제목');
  await expect(sample).toContainText('재시도 횟수: 1');
  await sample.getByRole('button', { name: '저장 실패 확인', exact: true }).click();
  await sample.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(sample).toContainText('이 예시에서 적용한 이름: 보존할 문서 제목');
  await expect(sample.getByRole('alert')).toHaveCount(0);
  await sample.getByRole('button', { name: '충돌 복구 확인', exact: true }).click();
  await sample.getByRole('button', { name: '새 자료로 복구', exact: true }).press('Enter');
  await expect(sample).toContainText('초안을 새 자료로 복구했습니다');
});

test('feedback wraps on mobile, uses both themes and respects reduced motion', async ({ page }) => {
  await page.goto('/design-system/index.html#feedback');
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#feedback .office-status-spinner').first()).toHaveCSS('animation-name', 'none');
  const notice = page.locator('#feedback .office-status-notice');
  expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await notice.scrollIntoViewIfNeeded();
  await expect(notice.getByRole('button')).toBeInViewport();
  await mkdir(output, { recursive: true });
  await notice.screenshot({ path: `${output}/status-light.png` });
  await page.getByRole('combobox', { name: '시스템 테마' }).click();
  await page.getByRole('option', { name: '어두운 테마', exact: true }).click();
  await notice.screenshot({ path: `${output}/status-dark.png` });
});

test('Word retries a storage failure and preserves the latest text after reload', async ({ page }) => {
  let frame = await create(page, 'Word');
  let status = frame.locator('[data-word-save-status]');
  await expect(status).toHaveText('저장됨');
  await frame.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).restoreStatusPut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function(...args) {
      if (this.transaction.db.name === 'barocss-word') throw new DOMException('Test full storage', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await frame.locator('.w-paragraph').last().click();
  await page.keyboard.type('KEPT AFTER FAILURE');
  await expect(status).toHaveText('저장 실패');
  await expect(status).toHaveAttribute('data-tone', 'danger');
  await frame.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(status).toHaveText('저장 실패');
  await expect(frame.locator('.w-paragraph').last()).toContainText('KEPT AFTER FAILURE');
  const retry = frame.getByRole('button', { name: '저장 다시 시도', exact: true });
  await expect(retry).toBeEnabled();
  // Keep background visibility saves failing until the user starts the retry.
  await retry.evaluate(el => el.addEventListener('pointerdown', () => (window as any).restoreStatusPut(), { once: true }));
  await retry.click();
  await expect(status).toHaveText('저장됨');
  await expect(status).toHaveAttribute('data-tone', 'success');
  await page.reload(); frame = await localNative(page); status = frame.locator('[data-word-save-status]');
  await expect(status).toHaveText('저장됨');
  await expect(frame.locator('.w-paragraph').last()).toContainText('KEPT AFTER FAILURE');
});

test('Slides exposes conflict recovery directly and keeps the newer original', async ({ page, context }) => {
  let frame = await create(page, 'Slides');
  const saved = async (p: Page) => expect((await localNative(p)).locator('[data-slide-save-status]')).toHaveText('저장됨');
  await saved(page);
  const url = page.url();
  const other = await context.newPage(); await other.goto(url); await saved(other);
  const add = async (p: Page) => {
    const native = await localNative(p);
    await native.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
    await native.locator('[data-menu-item="edit.slides.0"]').click();
  };
  let otherFrame = await localNative(other);
  const slides = (native: Frame) => native.locator('.sl-filmstrip button[data-slide]');
  const originalCount = await slides(frame).count();
  await add(page); await saved(page);
  await add(other); await add(other);
  await expect(otherFrame.locator('[data-slide-save-status]')).toHaveText('충돌한 초안 보관됨');
  await otherFrame.getByRole('button', { name: '복구 초안 보기', exact: true }).click();
  const dialog = otherFrame.getByRole('dialog', { name: '최근 발표 자료', exact: true });
  await expect(dialog).toContainText('다른 창의 최신본은 유지됩니다');
  await dialog.getByRole('button', { name: '새 자료로 복구', exact: true }).click();
  await saved(other); otherFrame = await localNative(other); await expect.poll(() => other.url()).not.toBe(url);
  await expect(slides(otherFrame)).toHaveCount(originalCount + 2);
  await page.reload(); frame = await localNative(page); await saved(page);
  await expect(slides(frame)).toHaveCount(originalCount + 1);
});
