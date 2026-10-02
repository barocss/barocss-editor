import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';
import { bindPropertyVariable } from './property-variable-helpers';

const prepare = async (page: import('@playwright/test').Page) => {
  await openDeck(page);
  await page.getByRole('button', { name: '속성', exact: true }).click();
  await page.locator('.sl-properties').getByLabel('단위', { exact: true }).selectOption('px');
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  return page.evaluate(async () => {
    const editor = (window as any).editor;
    const sid = editor.selection.nodeIds[0];
    const slideId = editor.dataStore.getNode(sid).parentId;
    await editor.executeCommand('setDocumentVar', { name: '카드 너비', kind: 'number', value: '3000' });
    await editor.executeCommand('setSlideVar', { slideId, name: '카드 너비', kind: 'number', value: '4500' });
    await editor.executeCommand('setDocumentVar', { name: '짧은 너비', kind: 'number', value: '2000' });
    await editor.executeCommand('setNode', { nodeIds: [sid] });
    return sid as string;
  });
};
const attrs = (page: import('@playwright/test').Page, sid: string) => page.evaluate(id => (window as any).editor.dataStore.getNode(id).attributes, sid);

for (const theme of ['light', 'dark']) test(`field-attached variable search resolves local scope, detaches, and follows native undo/redo in ${theme}`, async ({ page }, info) => {
  const sid = await prepare(page);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  const panel = page.locator('.sl-properties');
  await expect(panel).not.toContainText('문서 변수 연결');
  const attach = panel.getByRole('button', { name: '너비 변수 연결', exact: true });
  const target = await attach.boundingBox(); expect(target!.height).toBeGreaterThanOrEqual(32); expect(target!.width).toBeGreaterThanOrEqual(32);
  await page.screenshot({ path: info.outputPath(`property-unbound-${theme}.png`), animations: 'disabled' });
  await attach.click();
  const firstColumnPicker = panel.getByRole('dialog', { name: '너비 변수 선택', exact: true });
  const pickerBounds = await firstColumnPicker.boundingBox();
  const ownerBounds = await panel.locator('xpath=ancestor::*[@data-workspace-panel="inspector"]').boundingBox();
  expect(pickerBounds!.x).toBeGreaterThanOrEqual(ownerBounds!.x);
  expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(ownerBounds!.x + ownerBounds!.width);
  await page.screenshot({ path: info.outputPath('inline-variable-picker.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  const before = await attrs(page, sid);
  await bindPropertyVariable(page, '너비', '카드 너비');
  await expect(panel.getByRole('button', { name: '너비 변수 카드 너비', exact: true })).toContainText('300 px');
  expect((await attrs(page, sid)).width).toBe(4500);
  await expect(panel.getByRole('spinbutton', { name: '너비', exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.locator('[data-handle="se"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('inline-property-variable.png'), animations: 'disabled' });
  await bindPropertyVariable(page, '너비', '짧은 너비');
  expect((await attrs(page, sid)).width).toBe(2000);
  await bindPropertyVariable(page, '너비', '');
  await expect(panel.getByRole('spinbutton', { name: '너비', exact: true })).toBeEnabled();
  expect((await attrs(page, sid)).varBinds).toBeUndefined();
  expect((await attrs(page, sid)).width).toBe(2000); // Native detach retains last derived geometry.
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(() => attrs(page, sid).then(value => value.varBinds)).toEqual([{ attr: 'width', var: '짧은 너비' }]);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect.poll(() => attrs(page, sid).then(value => value.varBinds)).toBeUndefined();
  expect(before.varBinds).toBeUndefined();
});

test('mixed binding stays truthful and one choice applies to the complete selection', async ({ page }, info) => {
  const first = await prepare(page);
  await bindPropertyVariable(page, '너비', '카드 너비');
  await page.getByRole('button', { name: '사각형', exact: true }).click();
  const second = await page.evaluate(() => (window as any).editor.selection.nodeIds[0] as string);
  await page.evaluate(async ids => (window as any).editor.executeCommand('setNode', { nodeIds: ids }), [first, second]);
  const mixed = page.getByRole('button', { name: '너비 변수 서로 다름', exact: true });
  await expect(mixed).toBeVisible();
  await page.screenshot({ path: info.outputPath('mixed-property-variable.png'), animations: 'disabled' });
  await bindPropertyVariable(page, '너비', '짧은 너비');
  for (const sid of [first, second]) expect((await attrs(page, sid)).varBinds).toEqual([{ attr: 'width', var: '짧은 너비' }]);
});

test('escape retires field picker and selection replacement cannot apply stale choice', async ({ page }) => {
  const sid = await prepare(page);
  const native = () => page.evaluate(() => { const editor = (window as any).editor; return { document: editor.exportDocument(), selection: editor.selection, history: editor.getHistoryStats() }; });
  const before = await native();
  const attach = page.getByRole('button', { name: '너비 변수 연결', exact: true });
  await attach.click(); await page.getByRole('textbox', { name: '너비 변수 검색', exact: true }).fill('카드');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '너비 변수 선택', exact: true })).toHaveCount(0);
  await expect(attach).toBeFocused(); expect(await native()).toEqual(before);
  await attach.click();
  await page.evaluate(async () => { const editor = (window as any).editor; await editor.executeCommand('insertRectangle'); });
  await expect(page.getByRole('dialog', { name: '너비 변수 선택', exact: true })).toHaveCount(0);
  expect((await attrs(page, sid)).varBinds).toBeUndefined();
});


test('component part text attaches through its definition and preserves native part content', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: '레이어', exact: true }).click();
  await page.getByRole('tab', { name: '컴포넌트', exact: true }).click();
  await page.locator('.sl-components [data-component-id="metric-card"]').click();
  await page.getByRole('button', { name: '속성', exact: true }).click();
  const part = await page.evaluate(async () => {
    const editor = (window as any).editor, store = editor.dataStore;
    const library = store.getNode(editor.getRootId()).content.map((sid: string) => store.getNode(sid)).find((node: any) => node.stype === 'components');
    const definition = library.content.map((sid: string) => store.getNode(sid)).find((node: any) => node.attributes.id === 'metric-card');
    const title = definition.content.map((sid: string) => store.getNode(sid)).find((node: any) => node.attributes.partId === 'title');
    await editor.executeCommand('setNode', { nodeIds: [title.sid] });
    return { sid: title.sid as string, definition: definition.sid as string, node: JSON.stringify(title) };
  });
  await expect(page.getByRole('button', { name: '텍스트 내용 변수 title', exact: true })).toBeVisible();
  await bindPropertyVariable(page, '텍스트 내용', '');
  await bindPropertyVariable(page, '텍스트 내용', '값');
  const held = await page.evaluate(({ sid, definition }) => {
    const store = (window as any).editor.dataStore;
    return { node: JSON.stringify(store.getNode(sid)), binds: store.getNode(definition).content.map((id: string) => store.getNode(id)).filter((node: any) => node.stype === 'componentBind').map((node: any) => node.attributes) };
  }, part);
  expect(held.node).toBe(part.node);
  expect(held.binds).toContainEqual({ part: 'title', attr: 'text', var: 'value' });
});


test('flat fill binding sits beside the real swatch and paint-list references stay separate', async ({ page }) => {
  const sid = await prepare(page);
  await page.evaluate(async () => { await (window as any).editor.executeCommand('setDocumentVar', { name: '필드 색', kind: 'color', value: '#123456' }); });
  await page.evaluate(async id => { await (window as any).editor.executeCommand('setNode', { nodeIds: [id] }); }, sid);
  const panel = page.locator('.sl-properties');
  const attach = panel.getByRole('button', { name: '채우기 값 변수 연결', exact: true });
  await attach.scrollIntoViewIfNeeded();
  await expect(attach.locator('..').getByRole('button', { name: '1번 채우기', exact: true })).toBeVisible();
  const before = await attrs(page, sid);
  await bindPropertyVariable(page, '채우기 값', '필드 색');
  await expect.poll(() => attrs(page, sid).then(value => value.varBinds)).toEqual([{ attr: 'fill', var: '필드 색' }]);
  expect((await attrs(page, sid)).fill).toBe(before.fill);
  const painted = () => page.locator(`.sl-stage [data-bc-sid="${sid}"]`).evaluate(element => getComputedStyle(element).backgroundColor);
  await expect.poll(painted).toBe('rgb(18, 52, 86)');
  await bindPropertyVariable(page, '채우기 값', '');
  await page.evaluate(async id => { await (window as any).editor.executeCommand('setBoxStyle', { nodeIds: [id], fills: [{ kind: 'solid', color: 'var:필드 색', opacity: 1, visible: true }] }); }, sid);
  await expect(attach).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '1번 채우기', exact: true })).toBeVisible();
  expect((await attrs(page, sid)).fills[0].color).toBe('var:필드 색');
  await expect.poll(painted).toBe('rgb(18, 52, 86)');
});
