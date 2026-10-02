import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '프로젝트 만들기' });
  await dialog.getByRole('textbox', { name: '프로젝트 이름' }).fill('Windows 베타 공개');
  await dialog.getByRole('textbox', { name: '프로젝트 목표' }).fill('고객 설치 안내와 내부 교육자료를 준비한다.');
  await dialog.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Windows 베타 공개', exact: true })).toBeVisible();
}
async function newResult(page: Page, name: string, product: string) {
  await page.getByRole('button', { name: '결과물 연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '결과물 연결' });
  await dialog.getByRole('textbox', { name: '결과물 이름' }).fill(name);
  await dialog.getByRole('button', { name: '새 자료', exact: true }).click();
  await dialog.getByRole('button', { name: '자료 형식', exact: true }).click();
  await page.getByRole('option', { name: product, exact: true }).click();
  await dialog.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}
async function project(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Wonffice 작업 공간', exact: true });
  await navigation.locator('[data-menu]').click();
  await page.getByRole('menuitem', { name: '프로젝트로 돌아가기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Windows 베타 공개', exact: true })).toBeVisible();
}
test('real project goal, four existing original editors, final input, source revisions and reload', async ({ page }) => {
  await createProject(page);
  const projectURL = page.url();
  await newResult(page, '고객 설치 안내', 'Word');
  await newResult(page, '팀 교육자료', 'Slides');
  await newResult(page, '검토 메모', 'Note');
  await newResult(page, '공개 페이지 초안', 'Site');
  const before = await page.evaluate(async workspaceModule => {
    const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    return (await workspace.list()).map(one => ({ id: one.id, product: one.product }));
  }, workspaceModule);
  for (const name of ['고객 설치 안내', '팀 교육자료', '검토 메모', '공개 페이지 초안']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Wonffice 작업 공간' })).toBeVisible();
    if (name === '고객 설치 안내') {
      const edit = page.getByRole('button', { name: '직접 편집', exact: true });
      await expect(edit).toBeVisible(); await edit.click();
      await page.locator('.w-paragraph').last().click();
      await page.keyboard.press('End'); await page.keyboard.insertText(' 실제 마지막 입력');
      await expect(page.locator('.w-paragraph').last()).toContainText('실제 마지막 입력');
    }
    await project(page);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Windows 베타 공개', exact: true })).toBeVisible();
  const after = await page.evaluate(async workspaceModule => {
    const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const docs = await workspace.list();
    return { docs: docs.map(one => ({ id: one.id, product: one.product })), guide: docs.find(one => one.product === 'word')?.searchText };
  }, workspaceModule);
  expect(after.docs.sort((a,b) => a.id.localeCompare(b.id))).toEqual(before.sort((a,b) => a.id.localeCompare(b.id)));
  expect(after.guide).toContain('실제 마지막 입력');
  expect(page.url()).toBe(projectURL);
  await page.screenshot({ path: test.info().outputPath('project-goal-results.png'), fullPage: true });
});

test('project source evidence retains exact bytes after human changes and metadata CAS refuses overwrite', async ({ page }) => {
  await createProject(page); await newResult(page, '고객 설치 안내', 'Word'); await newResult(page, '팀 교육자료', 'Slides');
  const cards = page.locator('.ow-project-result'); const education = cards.filter({ hasText: '팀 교육자료' });
  await education.getByText('요청과 참고 자료', { exact: true }).click();
  await education.getByRole('button', { name: '참고 버전 연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '참고 버전 연결' });
  await dialog.getByRole('button', { name: '참고 자료', exact: true }).click(); await page.getByRole('option', { name: '고객 설치 안내', exact: true }).click();
  await dialog.getByRole('button', { name: '이 버전 보관' }).click(); await expect(dialog).toHaveCount(0);
  const captured = await page.evaluate(async workspaceModule => {
    const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace'); const w = new OfficeWorkspace(workspaceIdentity());
    const p = (await w.projects())[0]!; const pin = p.record.results.find(one => one.name === '팀 교육자료')!.inputs[0]!;
    const source = await w.require(pin.document.product, pin.document.id);
    const stale = structuredClone(p); const fresh = await w.saveProject({ ...p.record, goal: '중간 사용자 변경' }, p.revision);
    let refused = false; try { await w.saveProject({ ...stale.record, goal: '덮어쓰기' }, stale.revision); } catch { refused = true; }
    return { pin, exact: pin.text === source.text && pin.revision === source.row.revision, refused, goal: fresh.record.goal };
  }, workspaceModule);
  expect(captured.exact).toBe(true); expect(captured.refused).toBe(true); expect(captured.goal).toBe('중간 사용자 변경');
  await page.getByRole('button', { name: '고객 설치 안내', exact: true }).click();
  const edit = page.getByRole('button', { name: '직접 편집', exact: true }); await expect(edit).toBeVisible(); await edit.click();
  await page.locator('.w-paragraph').last().click(); await page.keyboard.press('End'); await page.keyboard.insertText(' 사람의 후속 변경'); await project(page);
  await page.locator('.ow-project-result').filter({ hasText: '팀 교육자료' }).getByText('요청과 참고 자료', { exact: true }).click();
  await page.getByRole('button', { name: `고객 설치 안내 · 버전 ${captured.pin.revision}`, exact: true }).click();
  const evidence = page.getByRole('dialog', { name: '사용한 원본 버전' });
  await expect(evidence).toContainText('참고 원본이 변경되었습니다');
  expect(await evidence.locator('details pre').textContent()).toBe(captured.pin.text);
  await page.reload();
  const reopened = await page.evaluate(async workspaceModule => {
    const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace'); const w = new OfficeWorkspace(workspaceIdentity());
    return (await w.projects())[0]!.record.results.find(one => one.name === '팀 교육자료')!.inputs[0];
  }, workspaceModule);
  expect(reopened).toEqual(captured.pin);
});

test('fresh profile backup restore retains retrievable historical bytes without rebinding old source IDs', async ({ page, browser }) => {
  await createProject(page); await newResult(page, '고객 설치 안내', 'Word'); await newResult(page, '팀 교육자료', 'Slides');
  const saved = await page.evaluate(async workspaceModule => {
    const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity()), project = (await workspace.projects())[0]!;
    const source = project.record.results.find(one => one.name === '고객 설치 안내')!;
    const pin = await workspace.pin(source.document);
    const education = project.record.results.find(one => one.name === '팀 교육자료')!; education.inputs.push(pin);
    await workspace.saveProject(project.record, project.revision);
    return { backup: await workspace.backup(), pin };
  }, workspaceModule);
  const restoredContext = await browser.newContext();
  try {
    const fresh = await restoredContext.newPage(); await fresh.goto('/');
    const restored = await fresh.evaluate(async ({ workspaceModule, backup, oldId }) => {
      const { OfficeWorkspace, workspaceIdentity } = await import(workspaceModule) as typeof import('@barocss/office-workspace');
      const workspace = new OfficeWorkspace(workspaceIdentity()); await workspace.restore(backup);
      const project = (await workspace.projects())[0]!;
      return { project, missingOldSource: !(await workspace.list()).some(one => one.id === oldId) };
    }, { workspaceModule, backup: saved.backup, oldId: saved.pin.document.id });
    expect(restored.missingOldSource).toBe(true);
    expect(restored.project.record.results.find(one => one.name === '팀 교육자료')!.inputs[0]).toEqual(saved.pin);
    await fresh.reload(); await fresh.getByRole('button', { name: /Windows 베타 공개/ }).click();
    await fresh.locator('.ow-project-result').filter({ hasText: '팀 교육자료' }).getByText('요청과 참고 자료', { exact: true }).click();
    await fresh.getByRole('button', { name: `고객 설치 안내 · 버전 ${saved.pin.revision}`, exact: true }).click();
    const evidence = fresh.getByRole('dialog', { name: '사용한 원본 버전' });
    await expect(evidence).toContainText('현재 원본 버전을 확인할 수 없습니다');
    expect(await evidence.locator('details pre').textContent()).toBe(saved.pin.text);
    await fresh.reload();
    await expect(fresh.getByRole('heading', { name: 'Windows 베타 공개', exact: true })).toBeVisible();
  } finally { await restoredContext.close(); }
});
