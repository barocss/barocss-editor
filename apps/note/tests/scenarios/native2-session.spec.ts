import { expect, test } from '@playwright/test';
import type { NativeScenarioSnapshot } from '../../src/scenario-main';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS, NATIVE_B_VARIANTS } from '../../src/native2-scenario-fixtures';

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


test('desired full original B opens in native2 and paints literal strike', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B');
  const host = page.getByTestId('native2-host');
  await expect(host.locator('.on-doc')).toBeVisible();
  await expect(host).toContainText('검토 B');
  await expect(host.locator('.mark-strike')).toHaveCount(1);
});

test('bare readonly original B model and painter are investigated separately from admission', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B-bare');
  const host = page.getByTestId('native2-bare-host');
  await expect(host.locator('.on-doc')).toBeVisible();
  expect(await page.evaluate(() => window.readNativeNoteScenario?.().nativeDocument)).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_B.document);
  await expect(host).toContainText('검토 B');
  const paint = await host.locator('p').filter({ hasText: '검토 B' }).first().evaluate(p => [...p.querySelectorAll('*')].map(el => ({ text: el.textContent, line: getComputedStyle(el).textDecorationLine, className: el.className })));
  await test.info().attach('original-B-effective-paint.json', { body: JSON.stringify(paint, null, 2), contentType: 'application/json' });
  expect(paint.some(run => run.text?.includes('검토') && run.line.includes('line-through'))).toBe(true);
});

async function readNative(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    if (!window.readNativeNoteScenario) throw new Error('Actual native diagnostic required'); return window.readNativeNoteScenario();
  });
}
async function exportB(page: import('@playwright/test').Page, expected: unknown) {
  await expect.poll(async () => (await readNative(page)).nativeDocument).toEqual(expected);
  // Escape dismisses the selected-text surface before using the outside diagnostic control.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-editor-context-toolbar]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  const text = await page.getByTestId('native2-export').textContent(); if (!text) throw new Error('Complete native2 snapshot required');
  expect(JSON.parse(text)).toEqual({ ...NATIVE_NOTE_FIXTURES.SOURCE_B, document: expected });
  expect(Object.hasOwn(JSON.parse(text), 'savedAt')).toBe(false);
}
async function placeB(page: import('@playwright/test').Page, offset: number, selected = 0) {
  const host = page.getByTestId('native2-host'); await host.locator('.mark-strike').first().click();
  await page.keyboard.press('Home');
  for (let n = 0; n < offset; n++) await page.keyboard.press('ArrowRight');
  if (selected) { await page.keyboard.down('Shift'); for (let n = 0; n < selected; n++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift'); }
  const identity = await host.locator('[data-bc-sid]').filter({ hasText: '검토 B' }).evaluateAll(elements => {
    const run = elements.find(element => element.getAttribute('data-bc-stype') === 'inline-text' || element.classList.contains('inline-text'));
    return run?.getAttribute('data-bc-sid');
  });
  const current = await readNative(page);
  const doc = current.document;
  if (!doc || typeof doc !== 'object' || !('content' in doc) || !Array.isArray(doc.content)) throw new Error('Whole actual B tree required');
  const paragraph = doc.content[0];
  const run = paragraph?.content?.[0];
  if (!run || run.text !== '검토 B' || typeof run.sid !== 'string') throw new Error('Original B run identity required');
  if (identity) expect(identity).toBe(run.sid);
  await expect.poll(async () => (await readNative(page)).selection).toMatchObject({ type: 'range', startNodeId: run.sid, endNodeId: run.sid, startOffset: offset, endOffset: offset + selected, collapsed: selected === 0 });
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-host"]'))).toBe(true);
}

test('B real keyboard input outside and inside strike preserves full native file, caret and Undo/Redo', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B');
  await placeB(page, 4); await page.keyboard.insertText(' • 편집 B');
  await exportB(page, NATIVE_B_VARIANTS['append-outside-strike'].document);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click();
  await exportB(page, NATIVE_NOTE_FIXTURES.SOURCE_B.document);
  await placeB(page, 1); await page.keyboard.insertText('사');
  await exportB(page, NATIVE_B_VARIANTS['insert-inside-strike'].document);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click(); await exportB(page, NATIVE_NOTE_FIXTURES.SOURCE_B.document);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click(); await exportB(page, NATIVE_B_VARIANTS['insert-inside-strike'].document);
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(async () => (await readNative(page)).nativeDocument).toEqual(NATIVE_B_VARIANTS['insert-inside-strike'].document);
});

test('B actual S overflow reads literal mark on/off and underline overlap keeps both painted decorations', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B'); await placeB(page, 0, 2);
  const more = page.getByRole('button', { name: '추가 서식', exact: true }); await more.click();
  const strike = page.getByRole('menuitemcheckbox', { name: '취소선', exact: true });
  await expect(strike).toHaveAttribute('aria-checked', 'true'); await strike.click();
  await more.click(); await expect(strike).toHaveAttribute('aria-checked', 'false');
  // Hover tooltip and secondary popup consume Escape one layer at a time.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(strike).toHaveCount(0);
  await exportB(page, NATIVE_B_VARIANTS['remove-exact-strike'].document);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click();
  await placeB(page, 1, 3); await more.click();
  await page.getByRole('menuitemcheckbox', { name: '밑줄', exact: true }).click();
  await exportB(page, NATIVE_B_VARIANTS['underline-overlap'].document);
  const host = page.getByTestId('native2-host');
  await expect(host.locator('.mark-strike').first()).toBeVisible(); await expect(host.locator('.mark-underline').first()).toBeVisible();
  const paint = await host.locator('.mark-underline').first().evaluate(el => {
    const lines: string[] = []; for (let node: Element | null = el; node; node = node.parentElement) lines.push(getComputedStyle(node).textDecorationLine);
    return lines.join(' ');
  });
  expect(paint).toContain('underline'); expect(paint).toContain('line-through');
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(async () => (await readNative(page)).nativeDocument).toEqual(NATIVE_B_VARIANTS['underline-overlap'].document);
});

test('B last nested resource keyboard input is delivered and reopened with exact full pins', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B'); await page.getByRole('button', { name: 'Show nested resource', exact: true }).click();
  const paragraph = page.getByTestId('native2-host').locator('p').filter({ hasText: 'B 자료 본문' }).first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 B 입력');
  await page.getByRole('button', { name: 'Export native snapshot', exact: true }).click();
  await expect.poll(async () => {
    const text = await page.getByTestId('native2-export').textContent(); return text ? JSON.parse(text) : undefined;
  }).toEqual(NATIVE_B_VARIANTS['last-nested-input']);
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(async () => (await readNative(page)).nativeDocument).toEqual(NATIVE_B_VARIANTS['last-nested-input'].document);
});

test('B real block controls keep terminal resources and complete source through structure/history', async ({ page }) => {
  await page.goto('/scenarios.html?case=native2-B');
  await page.getByRole('button', { name: 'Insert B block', exact: true }).click(); await exportB(page, NATIVE_B_VARIANTS['new-block'].document);
  await page.getByRole('button', { name: 'Move original B block down', exact: true }).click(); await exportB(page, NATIVE_B_VARIANTS['move-original-below-new'].document);
  await page.getByRole('button', { name: 'Delete B block', exact: true }).click(); await exportB(page, NATIVE_NOTE_FIXTURES.SOURCE_B.document);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click(); await exportB(page, NATIVE_B_VARIANTS['move-original-below-new'].document);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click(); await exportB(page, NATIVE_NOTE_FIXTURES.SOURCE_B.document);
});


for (const [label, mark] of [['굵게', 'bold'], ['기울임', 'italic']] as const) test(`B actual ${mark} overlap preserves literal S, whole file and local history`, async ({ page }) => {
  // Independent expected full file: only one declared native mark is appended.
  const expected = structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_B);
  const run = expected.document.content[0].content[0];
  if (!('marks' in run) || !run.marks) throw new Error('Full original B authored strike required');
  run.marks.push({ stype: mark, range: [1, 4] });
  await page.goto('/scenarios.html?case=native2-B'); await placeB(page, 1, 3);
  await page.getByRole('button', { name: label, exact: true }).click();
  await exportB(page, expected.document);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click(); await exportB(page, NATIVE_NOTE_FIXTURES.SOURCE_B.document);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click(); await exportB(page, expected.document);
  const marked = page.getByTestId('native2-host').locator(`.mark-${mark}`).first();
  await expect(marked).toBeVisible();
  if (mark === 'bold') await expect(marked).toHaveCSS('font-weight', '700');
  else await expect(marked).toHaveCSS('font-style', 'italic');
  await expect.poll(() => marked.evaluate(el => {
    const lines: string[] = []; for (let node: Element | null = el; node; node = node.parentElement) lines.push(getComputedStyle(node).textDecorationLine);
    return lines.join(' ');
  })).toContain('line-through');
  await page.getByRole('button', { name: 'Reopen native snapshot', exact: true }).click();
  await expect.poll(async () => (await readNative(page)).nativeDocument).toEqual(expected.document);
});
