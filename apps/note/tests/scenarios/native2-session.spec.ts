import { expect, test } from '@playwright/test';
import type { NativeScenarioSnapshot } from '../../src/scenario-main';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from '../../src/native2-scenario-fixtures';

test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('native-current.png'), fullPage: true });
});

test('full supported A is painted and exports whole native2 after real heading input, Undo/Redo and reopen', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-A');
  const host = page.getByTestId('native2-host');
  await expect(host.locator('.on-doc')).toBeVisible();
  await expect(host).toContainText('목표 A');
  const read = async (): Promise<NativeScenarioSnapshot> => page.evaluate(() => {
    if (!window.readNativeNoteScenario) throw new Error('Read-only native2 diagnostic not ready'); return window.readNativeNoteScenario();
  });
  const before = await read(); expect(before.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.document);
  expect(before.snapshotText).toBe(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A, null, 2) + '\n');
  const heading = host.locator('h1,h2,h3,h4,h5,h6').filter({ hasText: '목표 A' }).first();
  await heading.click(); await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-host"]'))).toBe(true);
  await expect.poll(async () => (await read()).selection).toMatchObject({ type: 'range', collapsed: true, startOffset: 4, endOffset: 4 });
  const selection = (await read()).selection; if (!selection || selection.type !== 'range') throw new Error('Real heading range required');
  expect(selection.startNodeId).toBe(selection.endNodeId);
  await page.keyboard.insertText(' • 독립 편집');
  await expect(heading).toContainText('목표 A • 독립 편집');
  await expect.poll(() => heading.locator('span').evaluateAll(elements => elements.some(element => element.textContent === '목표' && Number(getComputedStyle(element).fontWeight) >= 700))).toBe(true);
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  await expect.poll(async () => (await read()).nativeDocument).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document);
  const exported = await page.getByTestId('native2-export').textContent(); if (!exported) throw new Error('Real UI snapshot export required');
  expect(JSON.parse(exported).schemaBundle).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle); expect(JSON.parse(exported).version).toBe(2);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click();
  await expect.poll(async () => (await read()).nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.document);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click();
  await expect.poll(async () => (await read()).nativeDocument).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document);
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(async () => (await read()).nativeDocument).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document);
  const reopened = await read(); if (typeof reopened.snapshotText !== 'string') throw new Error('Reopened aware raw must exist');
  expect(JSON.parse(reopened.snapshotText).schemaBundle).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle);
});

test('last real resource text input is delivered before immediate full snapshot export and reopen', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-A');
  await expect(page.getByTestId('native2-host').locator('.on-doc')).toBeVisible();
  await page.getByRole('button', { name: 'Show nested resource', exact: true }).click();
  const host = page.getByTestId('native2-host'); await expect(host).toContainText('항목 본문 A');
  const paragraph = host.locator('p').filter({ hasText: '항목 본문 A' }).first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 중첩 입력');
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  await expect.poll(async () => {
    const text = await page.getByTestId('native2-export').textContent(); return text ? JSON.parse(text).document : undefined;
  }).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.nested.document);
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(NATIVE_NOTE_EXPECTED_VARIANTS.nested.document);
});

test('explicit A2 context paints preserved content and complete pins without retargeting B', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-A2'); await expect(page.getByTestId('native2-host').locator('.on-doc')).toBeVisible();
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  const text = await page.getByTestId('native2-export').textContent(); if (!text) throw new Error('A2 full snapshot required');
  expect(JSON.parse(text)).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2);
  expect(NATIVE_NOTE_FIXTURES.SOURCE_B.schemaBundle.selected[0].version).toBe(1);
});

test('whole B literal strike is retained as source while engine admission refuses before painting or save', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B');
  await expect(page.getByTestId('native2-error')).toContainText('unsupported_native_editor');
  await expect(page.getByTestId('native2-host').locator('.on-doc')).toHaveCount(0);
  expect(await page.getByTestId('native2-retained-source').textContent()).toBe(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B, null, 2) + '\n');
  expect(await page.getByTestId('native2-export').textContent()).toBe('');
});

test('whole C has only the three declared self IDs changed and structural move restores by real UI history', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-C'); await expect(page.getByTestId('native2-host').locator('.on-doc')).toBeVisible();
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  const text = await page.getByTestId('native2-export').textContent(); if (!text) throw new Error('Whole C snapshot required');
  const actual = JSON.parse(text), expected = structuredClone(NATIVE_NOTE_FIXTURES.COPY_A_ORACLE);
  expect(actual).toEqual(expected);
  await page.getByRole('button', { name: 'Move first pair down', exact: true }).click();
  const content = expected.document.content;
  const changed = { ...expected.document, content: [content[2], content[0], content[1], ...content.slice(3)] };
  await expect.poll(() => page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(changed);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(expected.document);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(changed);
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  const exported = await page.getByTestId('native2-export').textContent(); if (!exported) throw new Error('C export required after redo');
  expect(JSON.parse(exported)).toEqual({ ...expected, document: changed });
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(changed);
  await expect(page.getByTestId('native2-host')).toContainText('목표 A');
});
