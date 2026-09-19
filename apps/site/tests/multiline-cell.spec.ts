import { test, expect } from '@playwright/test';

test('long text cells preserve drafts, multiline paste and undo; failed commits can retry', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-admin-open]').first().click();
  await page.locator('[data-panel="data"]').click();
  await page.getByLabel('상품 목록 데이터 고치기').click();
  await page.evaluate(async () => {
    const ed = (window as any).editor;
    const find = (id: string): any => {
      const n = ed.dataStore.getNode(id);
      if (n?.stype === 'dataset' && n.attributes?.name === '상품') return n;
      for (const child of n?.content ?? []) if (typeof child === 'string') { const found = find(child); if (found) return found; }
    };
    const dataset = find(ed.getRootId()); (window as any).longDataset = dataset.sid;
    await ed.executeCommand('setDatasetField', { nodeId: dataset.sid, field: '설명', kind: 'longText' });
  });
  const input = page.getByRole('textbox', { name: '1행 설명', exact: true });
  const value = () => page.evaluate(() => (window as any).editor.dataStore.getNode((window as any).longDataset).attributes.records[0].설명);
  const original = await value();
  await input.fill('  첫 줄  \n둘째 줄'); await input.press('Enter'); await input.press('x');
  expect(await value()).toBe(original);
  const draft = await input.inputValue();
  await input.press('ControlOrMeta+Enter'); await expect.poll(value).toBe(draft);
  await input.fill('취소할 초안'); await input.press('Escape');
  await expect(input).toHaveValue(draft); expect(await value()).toBe(draft);
  const before = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const prevented = await input.evaluate(el => {
    const data = new DataTransfer(); data.setData('text/plain', '붙여넣기\n둘째 줄');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    el.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(before);
  await page.evaluate(() => {
    const ed = (window as any).editor, run = ed.executeCommand.bind(ed);
    ed.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'setDatasetCell') { ed.executeCommand = run; return false; }
      return run(name, payload);
    };
  });
  await input.fill('재시도할 값'); await input.press('ControlOrMeta+Enter');
  await expect(page.getByRole('alert')).toContainText('입력은 유지됩니다'); expect(await value()).toBe(draft);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect.poll(value).toBe('재시도할 값');
  await page.getByRole('menuitem', { name: '편집', exact: true }).click();
  await page.getByRole('menuitem', { name: /^실행 취소/ }).click();
  await expect(input).toHaveValue(draft);
  await input.fill('이동해서 확정\n마지막'); await page.getByRole('heading').first().click();
  await expect.poll(value).toBe('이동해서 확정\n마지막');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/site-multiline-cell.png' });
  await page.locator('[data-row-open="0"]').click();
  const drawer = page.getByRole('dialog', { name: '1행', exact: true });
  const detail = drawer.getByRole('textbox', { name: '설명', exact: true });
  await detail.fill('Drawer 초안'); await detail.press('Escape');
  await expect(drawer).toBeVisible();
  await expect(detail).toHaveValue('이동해서 확정\n마지막');
  await detail.fill('Drawer 확정\n둘째 줄'); await detail.press('ControlOrMeta+Enter');
  await expect.poll(value).toBe('Drawer 확정\n둘째 줄');
});
