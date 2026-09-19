import { test, expect, type Page } from '@playwright/test';
async function load(page: Page, markdown = 'Before $x$ after') {
  await page.goto('/'); await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'inplace-math.md', mimeType: 'text/plain', buffer: Buffer.from(markdown) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('inplace-math');
}
const input = (page: Page) => page.locator('.oe-math-inplace .me-input:focus');
const atom = (page: Page) => page.getByRole('button', { name: '인라인 수식 편집', exact: true });
const tools = (page: Page) => page.getByLabel('본문 수식 도구', { exact: true });

test('inline math edits in the sentence, commits with Enter and undoes once', async ({ page }) => {
  await load(page); await atom(page).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(input(page)).toBeFocused();
  await input(page).fill('42'); await input(page).press('Escape'); await input(page).press('Enter');
  await expect(page.locator('.oe-math-inplace')).toHaveCount(0);
  await expect(atom(page).locator('annotation')).toHaveText('42');
  await expect(page.getByRole('toolbar', { name: '수식 도구', exact: true })).toHaveCount(0);
  await expect(tools(page)).toHaveCount(0);
  await expect(page.locator('.on-doc > p').first()).toContainText('Before');
  await page.keyboard.type('HERE');
  await expect(page.locator('.on-doc > p').first()).toContainText('HERE after');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(atom(page).locator('annotation')).toHaveText('x');
});

test('Escape cancels; outside click saves and restores after reload', async ({ page }) => {
  await load(page); await atom(page).click();
  await input(page).fill('42'); await input(page).press('Escape'); await input(page).press('Escape');
  await expect(atom(page).locator('annotation')).toHaveText('x');
  await atom(page).click(); await input(page).fill('37');
  await page.getByLabel('노트 제목').click();
  await expect(atom(page).locator('annotation')).toHaveText('37');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await expect(atom(page).locator('annotation')).toHaveText('37');
});

test('suggestions stay interactive and a draft opens in the large editor without premature saving', async ({ page }) => {
  await load(page); await atom(page).click();
  await input(page).fill('x/'); await input(page).press('ArrowDown'); await input(page).press('Enter');
  await expect(page.locator('.oe-math-inplace .me-fraction')).toBeVisible();
  await input(page).fill('2');
  await page.getByLabel('노트 제목').focus();
  await tools(page).getByRole('button', { name: '크게 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(atom(page).locator('annotation')).toHaveText('x');
  await atom(page).click();
  await input(page).fill('x/'); await input(page).press('ArrowDown'); await input(page).press('Enter');
  await expect(page.locator('.oe-math-inplace .me-fraction')).toBeVisible();
  await input(page).fill('3'); await page.getByLabel('노트 제목').focus();
  await tools(page).getByRole('button', { name: '완료', exact: true }).click();
  await expect(atom(page).locator('annotation')).toContainText('frac');
});

test('block math uses in-place controls for size and alignment', async ({ page }) => {
  await load(page, '$$\nx+1\n$$\n\nAfter');
  const block = page.getByRole('button', { name: '블록 수식 편집', exact: true });
  await block.click(); await expect(input(page)).toBeFocused(); await page.getByLabel('노트 제목').focus();
  await tools(page).getByLabel('수식 크기 바로 변경').selectOption('32');
  await tools(page).getByLabel('수식 정렬', { exact: true }).selectOption('left');
  await tools(page).getByRole('button', { name: '완료', exact: true }).click();
  await expect(block).toHaveCSS('font-size', '32px');
  await expect(page.locator('[data-latex-display="block"]')).toHaveCSS('text-align', 'left');
});

test('typing, deletion, selection and undo belong only to the focused math editor', async ({ page }) => {
  await load(page); await atom(page).click();
  const surrounding = () => page.locator('.on-doc > p > [data-bc-sid]:not([data-latex-node])').allTextContents();
  const before = await surrounding();
  await expect(tools(page)).toHaveCount(0);
  await input(page).fill(''); await input(page).pressSequentially('12345');
  await input(page).press('ArrowLeft'); await input(page).press('ArrowLeft');
  await input(page).press('Delete'); await input(page).press('Backspace');
  await expect(input(page)).toHaveValue('125');
  // Structured selection moves focus from the token input to the math surface.
  await input(page).press('Shift+ArrowLeft'); await page.keyboard.type('9');
  await expect(input(page)).toHaveValue('195');
  await input(page).press('ControlOrMeta+z'); await expect(input(page)).toHaveValue('125');
  await input(page).press('ControlOrMeta+Shift+z'); await expect(input(page)).toHaveValue('195');
  await input(page).press('Space'); await input(page).press('Space');
  await expect(input(page)).toHaveValue('  ');
  expect(await page.locator('.oe-math-inplace .me-run').evaluateAll(runs => runs.map(run => run.getAttribute('data-value')).join(''))).toBe('19  5');
  await input(page).press('ControlOrMeta+a');
  await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
  await expect(tools(page)).toHaveCount(0);
  expect(await surrounding()).toEqual(before);
  await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+z');
  await input(page).fill('37'); await input(page).press('Escape'); await input(page).press('Enter');
  await expect(atom(page).locator('annotation')).toHaveText('37');
  expect(await surrounding()).toEqual(before);
});

test('token previews and focused inputs retain the same size, including superscripts', async ({ page }) => {
  await load(page, 'Before $x^2+y$ after'); await atom(page).click();
  for (const value of ['x', '2', 'y']) {
    const run = page.locator(`.oe-math-inplace .me-run[data-value="${value}"]`);
    // The other token is visible as a preview; selecting it must not change its type size.
    await page.getByLabel('노트 제목').focus();
    const previewSize = await run.locator('.me-preview-token').evaluate(el => getComputedStyle(el).fontSize);
    await run.click();
    await expect(input(page)).toHaveCSS('font-size', previewSize);
    await expect(tools(page)).toHaveCount(0);
  }
  await page.screenshot({ path: '/tmp/note-math-inplace-focus.png', animations: 'disabled' });
});

test('composition does not submit the formula or leave Note in a composing state', async ({ page }) => {
  await load(page); await atom(page).click();
  await input(page).dispatchEvent('compositionstart', { data: '' });
  await input(page).dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
  await expect(input(page)).toBeFocused();
  await input(page).dispatchEvent('compositionend', { data: '' });
  await input(page).fill('37'); await input(page).press('Escape'); await input(page).press('Enter');
  await expect(atom(page).locator('annotation')).toHaveText('37');
  await page.keyboard.type('text  '); await page.keyboard.press('Backspace');
  await expect(page.locator('.on-doc > p').first()).toContainText('text  after');
});

test('reading and in-place editing use the same full-size fractions without breaking the text line', async ({ page }) => {
  await load(page, String.raw`Before $\frac{x}{2}+\frac{y}{2}=(30+20x)$ after`);
  const formula = atom(page);
  const reading = await formula.locator('.katex-html .mord').evaluateAll(elements => elements
    .filter(el => el.children.length === 0 && /^(x|y|2|30|20)$/.test(el.textContent ?? ''))
    .map(el => ({ text: el.textContent, size: getComputedStyle(el).fontSize })));
  expect(reading.length).toBeGreaterThanOrEqual(6);
  expect(reading.every(glyph => glyph.size === '18px')).toBe(true);
  const line = await page.locator('.on-doc > p').evaluate(el => {
    const atom = el.querySelector('.oe-latex')!;
    const runs = Array.from(el.children).filter(child => child !== atom.closest('[data-latex-node]'));
    return { before: runs[0].getBoundingClientRect().top, after: runs[runs.length - 1].getBoundingClientRect().top };
  });
  expect(Math.abs(line.before - line.after)).toBeLessThan(1);
  await page.screenshot({ path: '/tmp/note-math-consistent-reading.png', animations: 'disabled' });
  await formula.click();
  await page.locator('.oe-math-inplace .me-run[data-value="x"]').first().click();
  await expect(input(page)).toHaveCSS('font-size', '18px');
  await expect(page.locator('.oe-math-inplace')).toHaveCSS('box-shadow', 'none');
  await page.screenshot({ path: '/tmp/note-math-consistent-editing.png', animations: 'disabled' });
});
