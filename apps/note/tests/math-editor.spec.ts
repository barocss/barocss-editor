import { test, expect, type Page } from '@playwright/test';

async function expandMath(page: Page) {
  await page.getByLabel('노트 제목').focus();
  await page.getByLabel('본문 수식 도구', { exact: true }).getByRole('button', { name: '크게 편집', exact: true }).click();
}

test('Note formula drafts edit visually, cancel safely and reopen after persistence', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const body = page.locator('[data-note-editor]').first();
  await body.locator('.on-doc p').first().click();
  await page.keyboard.type('/');
  await page.locator('[data-slash-item="insertMathBlock"]').click();
  const atom = body.getByRole('button', { name: '블록 수식 편집', exact: true });
  await atom.click(); await expandMath(page);
  await page.getByRole('dialog', { name: '수학 수식' }).getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(String.raw`\frac{a}{b}+x^2`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  // Click a real editable token, replace its content, then discard the popup draft.
  await dialog.locator('.me-run[data-value="a"]').click();
  const input = dialog.locator('.me-input');
  await input.fill('z');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(atom).toHaveText('수식 입력');
  await atom.click(); await expandMath(page);
  await page.getByRole('dialog', { name: '수학 수식' }).getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(String.raw`\frac{a}{b}+x^2`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await dialog.locator('.me-run[data-value="a"]').click();
  await input.fill('c');
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await expect(body.locator('.katex')).toHaveCount(1);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await atom.click(); await expandMath(page);
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  await expect(dialog.locator('.me-run[data-value="c"]')).toBeVisible();
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(String.raw`\color{red}{x}`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('아직 시각 편집');
  await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue(String.raw`\color{red}{x}`);
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await atom.click(); await expandMath(page);
  await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue(String.raw`\color{red}{x}`);
});

test('block formulas import matrices and cases while inline formulas stay on one top-level line', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const body = page.locator('[data-note-editor]').first();
  await body.locator('.on-doc p').first().click();
  await page.keyboard.type('/');
  await page.locator('[data-slash-item="insertMathBlock"]').click();
  await body.getByRole('button', { name: '블록 수식 편집', exact: true }).click(); await expandMath(page);
  await page.getByRole('dialog', { name: '수학 수식' }).getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  const lines = String.raw`\begin{gathered}\begin{bmatrix}1&0\\0&1\end{bmatrix}\\\begin{cases}x&x>0\\0&x=0\end{cases}\end{gathered}`;
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(lines);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('[data-structure="matrix"]')).toBeVisible();
  await expect(dialog.locator('[data-structure="cases"]')).toBeVisible();
  await dialog.locator('.me-matrix-cell .me-run[data-value="1"]').first().click();
  await dialog.locator('.me-input').fill('7');
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await body.getByRole('button', { name: '블록 수식 편집', exact: true }).click(); await expandMath(page);
  await expect(dialog.locator('.me-matrix-cell .me-run[data-value="7"]')).toBeVisible();
  await page.screenshot({ path: '/tmp/note-math-structures.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await body.locator('.on-doc > p').last().click();
  await page.keyboard.type('/');
  await page.locator('[data-slash-item="insertMathInline"]').click();
  await body.getByRole('button', { name: '인라인 수식 편집', exact: true }).click(); await expandMath(page);
  await page.getByRole('dialog', { name: '수학 수식' }).getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(lines);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('여러 줄');
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill('37');
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await dialog.locator('.me-run[data-value="37"]').click();
  await dialog.locator('.me-input').press('Enter');
  await expect(dialog.locator('.me-document-line')).toHaveCount(1);
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await expect(body.locator('[data-latex-display="inline"] .katex')).toHaveCount(1);
});

test('legacy LaTeX opens directly, preserves source until editing and keeps draft history across modes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  const source = String.raw`\frac{a}{b} + \sin x`;
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({
    name: 'math-session-test.md', mimeType: 'text/plain', buffer: Buffer.from(`Before $${source}$ after`),
  });
  const atom = page.getByRole('button', { name: '인라인 수식 편집', exact: true });
  await atom.click(); await expandMath(page);
  const dialog = page.getByRole('dialog', { name: '수학 수식' });
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  await page.setViewportSize({ width: 820, height: 720 });
  await expect(dialog.getByRole('button', { name: '수식 적용', exact: true })).toBeInViewport();
  const toolbar = dialog.getByRole('toolbar');
  await expect(toolbar.getByRole('button', { name: '분수', exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue(source);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await dialog.locator('.me-run[data-value="a"]').click();
  await dialog.locator('.me-input').fill('c');
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await toolbar.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(dialog.locator('.me-run[data-value="a"]')).toBeVisible();
  // Loading new source is a draft history entry, so it can also be undone.
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await dialog.getByLabel('LaTeX 수식', { exact: true }).fill(String.raw`\sqrt{z}`);
  await dialog.getByRole('tab', { name: '시각 편집', exact: true }).click();
  await expect(dialog.locator('.me-run[data-value="z"]')).toBeVisible();
  await toolbar.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(dialog.locator('.me-fraction')).toBeVisible();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await atom.focus(); await atom.press('Enter'); await expandMath(page);
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue(source);
  await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload(); await atom.click(); await expandMath(page);
  await dialog.getByRole('tab', { name: 'LaTeX 원문', exact: true }).click();
  await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue(source);
});
