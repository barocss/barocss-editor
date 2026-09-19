import { test, expect, type Page } from '@playwright/test';

const text = (value: string) => ({ stype: 'inline-text', text: value });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
async function openFixture(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'editing.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: '주간 제품 리뷰' }, content: [
      paragraph('이번 주에 확인할 것들'),
      { stype: 'callout', attributes: { type: 'note', title: '함께 확인해주세요' }, content: [paragraph('본문은 그대로 유지합니다.')] },
      { stype: 'callout', attributes: { type: 'warning', title: '' }, content: [paragraph('출시 전에 저장 흐름을 확인합니다.')] },
      { stype: 'bTable', content: [
        { stype: 'bTableHeader', content: ['담당', '상태'].map(value => ({ stype: 'bTableHeaderCell', content: [text(value)] })) },
        { stype: 'bTableBody', content: [
          { stype: 'bTableRow', content: ['지수', '검토 중'].map(value => ({ stype: 'bTableCell', content: [text(value)] })) },
          { stype: 'bTableRow', content: ['민호', '완료'].map(value => ({ stype: 'bTableCell', content: [text(value)] })) }
        ] }
      ] },
      paragraph('다음 회의에서 다시 확인합니다.')
    ] }
  })) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('주간 제품 리뷰');
}

test('table tools hide when the document clips the table and return without losing the selection', async ({ page }) => {
  await openFixture(page);
  const table = page.locator('.on-doc table');
  await table.locator('td').first().click();
  const tools = page.locator('[data-note-table-context]');
  await expect(tools).toBeVisible();
  await page.locator('.on-doc').evaluate(element => {
    const doc = element as HTMLElement;
    doc.dataset.testStyle = doc.getAttribute('style') ?? '';
    doc.style.minHeight = '0'; doc.style.height = '1px'; doc.style.overflow = 'hidden';
  });
  await expect(tools).toHaveCount(0);
  await page.locator('.on-doc').evaluate(element => element.setAttribute('style', (element as HTMLElement).dataset.testStyle!));
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: '행 편집', exact: true }).click();
  await page.locator('[data-note-table-action="insertRowBelow"]').click();
  await expect(table.locator('tr')).toHaveCount(4);
});

test('콜아웃 제목도 본문처럼 선택·서식·링크·Enter·실행 취소·저장을 지원한다', async ({ page }, testInfo) => {
  await openFixture(page);
  const callout = page.locator('.w-callout').first();
  const title = callout.locator('.w-callout-title');
  await expect(title).toHaveAttribute('data-bc-sid');
  await expect(title).not.toHaveAttribute('contenteditable', 'false');
  await title.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  await page.keyboard.type('이번 주 결정 사항');
  await expect(title).toHaveText('이번 주 결정 사항');
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorOffset)).toBe(10);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  const formatting = page.locator('[data-note-formatting]');
  await expect(formatting).toBeVisible();
  await formatting.getByRole('button', { name: '기울임', exact: true }).click();
  await expect(title.locator('span').last()).toHaveCSS('font-style', 'italic');
  await page.keyboard.press('Control+z');
  await expect(title.locator('span').last()).not.toHaveCSS('font-style', 'italic');
  await page.keyboard.press('Control+Shift+z');
  await expect(title.locator('span').last()).toHaveCSS('font-style', 'italic');
  await formatting.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByLabel('링크 주소').fill('https://example.com/decision');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(title.locator('a')).toHaveAttribute('href', 'https://example.com/decision');
  await title.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Action: ');
  await expect(callout.locator('p')).toHaveText('Action: 본문은 그대로 유지합니다.');
  await expect(callout.locator('.w-callout-title')).toHaveCount(1);
  const second = page.locator('.w-callout').last();
  await second.locator('.w-callout-title').click();
  await page.keyboard.insertText('배포 전 확인');
  await expect(second.locator('.w-callout-title')).toHaveText('배포 전 확인');
  // Switching immediately after native title input must flush into the correct note.
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await page.getByRole('button', { name: '주간 제품 리뷰', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(title).toHaveText('이번 주 결정 사항');
  await expect(title.locator('a')).toHaveAttribute('href', 'https://example.com/decision');
  await expect(second.locator('.w-callout-title')).toHaveText('배포 전 확인');
  await page.locator('[data-note-editor]').screenshot({ path: testInfo.outputPath('inline-callouts.png') });
});

test('블록 위에 올린 추가 버튼은 다른 곳의 캐럿 대신 해당 블록 뒤에 삽입한다', async ({ page }) => {
  await openFixture(page);
  await page.locator('.on-doc > p').first().click();
  const last = page.locator('.on-doc > p').last();
  await last.hover();
  await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await page.locator('[data-note-insert] [data-note-control="insertChecklist"]').click();
  await expect(page.locator('.on-doc > :last-child')).toHaveClass(/w-task-item/);
  await page.keyboard.type('다음 주 확인');
  await expect(page.locator('.w-task-content')).toHaveText('다음 주 확인');
});

test('표의 행·열 관리와 툴팁은 셀을 가리지 않고 동작하며 저장된다', async ({ page }, testInfo) => {
  await openFixture(page);
  const table = page.locator('.on-doc table');
  await table.locator('td').first().click();
  const toolbar = page.locator('[data-note-table-context]');
  await expect(toolbar).toBeVisible();
  const tableBox = await table.boundingBox();
  const toolsBox = await toolbar.boundingBox();
  expect(toolsBox!.y + toolsBox!.height).toBeLessThanOrEqual(tableBox!.y);
  await toolbar.getByLabel('행 편집', { exact: true }).hover();
  const tooltip = page.locator('[data-office-tooltip]');
  await expect(tooltip).toBeVisible();
  const layer = await tooltip.evaluate(element => ({
    z: Number(getComputedStyle(element).zIndex),
    wrapperZ: Number(getComputedStyle(element.closest('[data-radix-popper-content-wrapper]')!).zIndex),
    inEditor: !!element.closest('[data-note-body]')
  }));
  expect(layer.z).toBeGreaterThan(60);
  expect(layer.wrapperZ).toBeGreaterThan(60);
  expect(layer.inEditor).toBe(false);
  await page.locator('[data-note-editor]').screenshot({ path: testInfo.outputPath('table-tooltip.png') });
  await toolbar.getByLabel('행 편집', { exact: true }).click();
  await page.locator('[data-note-table-action="insertRowBelow"]').click();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table).toContainText('지수');
  await expect(table).toContainText('민호');
  await table.locator('td').first().click();
  await toolbar.getByLabel('열 편집', { exact: true }).click();
  await page.locator('[data-note-table-action="insertColumnRight"]').click();
  await expect(table.locator('tr').last().locator('td')).toHaveCount(3);
  await table.locator('td').nth(1).click();
  await toolbar.getByLabel('열 편집', { exact: true }).click();
  await page.locator('[data-note-table-action="deleteColumn"]').click();
  await expect(table.locator('tr').last().locator('td')).toHaveCount(2);
  await table.locator('td').first().click();
  await toolbar.getByLabel('셀 편집', { exact: true }).click();
  await expect(page.locator('[data-note-table-action="mergeCells"]')).toBeDisabled();
  await expect(page.locator('[data-note-table-action="splitCell"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('.on-doc > p').last().click();
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('tr').last().locator('td')).toHaveCount(2);
  await expect(table).toContainText('검토 중');
});

test('객체 선택 손잡이와 선택 메뉴가 편집 영역 경계에서도 잘리지 않는다', async ({ page }, testInfo) => {
  await openFixture(page);
  const table = page.locator('.on-doc table');
  await table.hover({ position: { x: 8, y: 8 } });
  const handle = page.getByRole('button', { name: '표 선택', exact: true });
  await expect(handle).toBeVisible();
  expect(await handle.evaluate(element => {
    const box = element.getBoundingClientRect();
    return [
      [box.left + 1, box.top + 1], [box.right - 1, box.top + 1],
      [box.left + 1, box.bottom - 1], [box.right - 1, box.bottom - 1]
    ].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
  })).toBe(true);
  await handle.click();
  await expect(table).toHaveAttribute('data-table-selected', 'true');
  await expect(table).toHaveCSS('outline-offset', '-2px');
  const toolbar = page.locator('[data-note-table-context]');
  await expect(toolbar).toBeVisible();
  await toolbar.getByLabel('셀 편집', { exact: true }).click();
  await page.getByRole('menuitem', { name: '셀 배경색 · 연한 초록' }).click();
  for (const cell of await table.locator('th, td').all()) await expect(cell).toHaveCSS('background-color', 'rgb(220, 252, 231)');
  await page.keyboard.press('Escape');
  await page.locator('[data-note-editor]').screenshot({ path: testInfo.outputPath('table-selection.png') });
  await page.setViewportSize({ width: 540, height: 620 });
  const block = page.locator('.w-callout').last();
  await block.locator('p').click();
  await page.locator('[data-note-grip]').click();
  await page.getByRole('menuitem', { name: '블록 설정', exact: true }).click();
  const panel = page.locator('[data-note-properties]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.y).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(532);
  expect(box!.y + box!.height).toBeLessThanOrEqual(612);
  await panel.getByRole('button', { name: '속성 닫기' }).click();
  await expect(panel).toHaveCount(0);
});

test('표 경계에서 행·열을 추가하고 드래그로 여러 행과 열 너비를 한 번에 변경한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 1100 });
  await openFixture(page);
  const table = page.locator('.on-doc table');
  await table.locator('td').first().click();
  const grow = page.locator('[data-note-table-grow]');
  await expect(grow).toBeVisible();
  await grow.click();
  await expect(table.locator('tr')).toHaveCount(4);
  await page.locator('[data-note-row-boundary="1"]').click();
  await expect(table.locator('tr')).toHaveCount(5);
  await page.locator('[data-note-column-boundary="0"]').click();
  await expect(table.locator('tr').last().locator('td')).toHaveCount(3);
  const rowsBefore = await table.locator('tr').count();
  const box = (await grow.boundingBox())!;
  const tableBox = (await table.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + tableBox.height / rowsBefore * 3, { steps: 8 });
  await expect(grow).toContainText('3행 추가');
  await expect(page.locator('body > [data-note-table-readout]')).toContainText('3행 추가');
  const feedback = (await page.locator('[data-note-table-readout]').boundingBox())!;
  expect(feedback.x).toBeGreaterThanOrEqual(8);
  expect(feedback.y + feedback.height).toBeLessThanOrEqual(1092);
  await page.locator('[data-note-editor]').screenshot({ path: testInfo.outputPath('table-grow-preview.png') });
  await page.mouse.up();
  await expect(table.locator('tr')).toHaveCount(rowsBefore + 3);
  await table.locator('td').first().click();
  await page.keyboard.press('Control+z');
  await expect(table.locator('tr')).toHaveCount(rowsBefore);
  await page.keyboard.press('Control+Shift+z');
  await expect(table.locator('tr')).toHaveCount(rowsBefore + 3);

  const cancelBox = (await grow.boundingBox())!;
  await page.mouse.move(cancelBox.x + 50, cancelBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(cancelBox.x + 50, cancelBox.y + 80, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(table.locator('tr')).toHaveCount(rowsBefore + 3);
  await table.locator('td').first().click();
  const resize = page.locator('[data-note-column-resize="0"]');
  const before = Number(await resize.getAttribute('aria-valuenow'));
  const boundary = (await resize.boundingBox())!;
  await page.mouse.move(boundary.x + boundary.width / 2, boundary.y + 14);
  await page.mouse.down();
  await page.mouse.move(boundary.x + boundary.width / 2 + 64, boundary.y + 14, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await resize.getAttribute('aria-valuenow'))).toBeGreaterThan(before + 55);
  const width = Number(await resize.getAttribute('aria-valuenow'));
  await resize.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await resize.getAttribute('aria-valuenow'))).toBeGreaterThan(width + 5);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const savedWidth = (await table.locator('tr').last().locator('td').first().boundingBox())!.width;
  await page.reload();
  await expect(table.locator('tr')).toHaveCount(rowsBefore + 3);
  await expect.poll(async () => (await table.locator('tr').last().locator('td').first().boundingBox())!.width).toBeCloseTo(savedWidth, 0);
});

test('표 테마는 추가 행과 저장에 유지되고 개별 셀 색상은 테마를 덮어쓴다', async ({ page }, testInfo) => {
  await openFixture(page);
  const table = page.locator('.on-doc table');
  const cell = table.locator('td').first();
  const toolbar = page.locator('[data-note-table-context]');
  await cell.click();
  await toolbar.getByLabel('표 테마', { exact: true }).click();
  await page.getByRole('menuitem', { name: '표 테마 · 파랑' }).click();
  await expect(cell).toHaveCSS('background-color', 'rgb(239, 246, 255)');
  await page.keyboard.press('Escape');
  await cell.click();
  await toolbar.getByLabel('셀 편집', { exact: true }).click();
  await page.getByRole('menuitem', { name: '셀 배경색 · 연한 노랑' }).click();
  await expect(cell).toHaveCSS('background-color', 'rgb(254, 243, 199)');
  await page.locator('[data-note-editor]').screenshot({ path: testInfo.outputPath('table-cell-colors.png') });
  await page.getByRole('menuitem', { name: '셀 배경색 · 기본 색상' }).click();
  await expect(cell).toHaveCSS('background-color', 'rgb(239, 246, 255)');
  await page.keyboard.press('Escape');
  await cell.click();
  await page.locator('[data-note-table-grow]').click();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('tr').last().locator('td').first()).toHaveCSS('background-color', 'rgb(239, 246, 255)');
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(table.locator('td').first()).toHaveCSS('background-color', 'rgb(239, 246, 255)');
  await expect(table.locator('tr').last().locator('td').first()).toHaveCSS('background-color', 'rgb(239, 246, 255)');
});
