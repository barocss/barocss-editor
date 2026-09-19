import { test, expect } from '@playwright/test';

test('material search supports keyboard selection and excludes self, trash and existing links', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    await workspace.create('word', '검토 문서');
    await workspace.create('slides', '분기 발표');
    const trash = await workspace.create('note', '제외 자료');
    await workspace.update(`note:${trash}`, { trashedAt: Date.now() });
  });
  await page.reload();
  await page.getByRole('button', { name: '검토 문서 관리', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '자료 관리', exact: true });
  await dialog.getByRole('button', { name: '연결할 자료', exact: true }).click();
  const search = page.getByRole('combobox', { name: '연결할 자료 검색' });
  await expect(page.getByRole('option')).toHaveCount(1);
  await search.fill('없는 자료');
  await expect(page.getByText('일치하는 항목이 없습니다.', { exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '연결할 자료', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '연결할 자료', exact: true }).click();
  await search.fill('Slides');
  await search.press('ArrowDown');
  await search.press('Enter');
  await dialog.getByRole('button', { name: '원본 참조 추가' }).click();
  await expect(dialog.getByRole('button', { name: '분기 발표 연결 해제' })).toBeVisible();
  await dialog.getByRole('button', { name: '연결할 자료', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(0);
  await search.press('Escape');
  await page.screenshot({ path: '../../.dev/artifacts/design-system/workspace-links.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '분기 발표 연결 해제' }).click();
  await dialog.getByRole('button', { name: '연결할 자료', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(1);
});

test('backup file selection retains a failed file, supports retry, and clears after restore', async ({ page }) => {
  await page.goto('/');
  const backup = await page.evaluate(async () => {
    const { OfficeWorkspace, workspaceIdentity } = await import('/@fs/Users/user/github/barocss/barocss-editor/packages/office-workspace/src/index.ts');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    await workspace.create('word', '복원 원본');
    return JSON.stringify(await workspace.backup());
  });
  await page.reload();
  await page.getByRole('button', { name: '백업 및 가져오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '백업 및 가져오기', exact: true });
  const picker = dialog.getByLabel('백업 또는 제품 JSON 파일', { exact: true });
  const restore = dialog.getByRole('button', { name: '새 사본으로 복원' });
  await expect(restore).toBeDisabled();
  await picker.setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await restore.click();
  await expect(dialog.getByRole('alert')).toContainText('JSON 파일을 읽을 수 없습니다. 올바른 백업 파일을 선택하세요.');
  await expect(dialog.getByText('workspace.json', { exact: true })).toBeVisible();
  await expect(restore).toBeEnabled();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../.dev/artifacts/design-system/workspace-import.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'workspace.json 제거' }).click();
  await expect(restore).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  // Re-selecting the same name must fire the common picker again.
  await picker.setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function() {
      await new Promise(resolve => setTimeout(resolve, 800));
      return read.call(this);
    };
  });
  await restore.click();
  await expect(restore).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '파일 바꾸기' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'workspace.json 제거' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-document]')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('1개 자료를 새 사본으로 복원');
  await page.getByRole('button', { name: '백업 및 가져오기', exact: true }).click();
  await expect(restore).toBeDisabled();
  await expect(dialog.getByText('workspace.json', { exact: true })).toHaveCount(0);
});
