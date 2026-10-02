import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// A helper can verify the integrator's running source before its test is cherry-picked.
const sourceRoot = process.env.OFFICE_FEEDBACK_SOURCE_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
const modules = {
  workspace: `/@fs${resolve(sourceRoot, 'packages/office-workspace/src/index.ts')}`,
  shared: `/@fs${resolve(sourceRoot, 'packages/shared/src/index.ts')}`
};
const opinion = '설치 전 준비 조건을 첫 문단에서 더 명확히 설명해 주세요.';
const guideText = '고객은 설치 전에 Windows 버전과 저장 공간을 확인합니다.';
const selectedQuote = '고객은';

type NativeNode = { stype?: string; text?: string; attributes?: Record<string, unknown>;
  marks?: { stype?: string; attrs?: Record<string, unknown> }[]; content?: NativeNode[] };
function nativeNodes(node: NativeNode): NativeNode[] { return [node, ...(node.content ?? []).flatMap(nativeNodes)]; }
function bodyText(node: NativeNode): string[] {
  if (node.stype === 'resources') return [];
  return [...(typeof node.text === 'string' ? [node.text] : []), ...(node.content ?? []).flatMap(bodyText)];
}
async function state(page: Page, flush = false) {
  return page.evaluate(async ({ modules, flush }) => {
    const { OfficeWorkspace, workspaceIdentity } = await import(modules.workspace) as typeof import('@barocss/office-workspace');
    if (flush) {
      const { prepareProductNavigation } = await import(modules.shared) as typeof import('@barocss/shared');
      if (!await prepareProductNavigation()) throw new Error('The current native input was not saved');
    }
    const workspace = new OfficeWorkspace(workspaceIdentity()), project = (await workspace.projects())[0]!;
    const guide = project.record.results.find(one => one.name === '고객 설치 안내')!;
    const saved = await workspace.require('word', guide.document.id);
    return { record: project.record, native: JSON.parse(saved.text).document as NativeNode, text: saved.text, revision: saved.row.revision };
  }, { modules, flush });
}
async function createResult(page: Page, name: string, product: 'Word' | 'Slides') {
  await page.getByRole('button', { name: '결과물 연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '결과물 연결' });
  await dialog.getByRole('textbox', { name: '결과물 이름' }).fill(name);
  await dialog.getByRole('button', { name: '새 자료', exact: true }).click();
  await dialog.getByRole('button', { name: '자료 형식', exact: true }).click();
  await page.getByRole('option', { name: product, exact: true }).click();
  await dialog.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function openGuide(page: Page, education = false) {
  await page.goto('/');
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '프로젝트 만들기' });
  await dialog.getByRole('textbox', { name: '프로젝트 이름' }).fill('고객 안내 검토');
  await dialog.getByRole('textbox', { name: '프로젝트 목표' }).fill('고객 안내를 검토하고 같은 요청에 팀 교육자료를 연결한다.');
  await dialog.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '고객 안내 검토', exact: true })).toBeVisible();
  await createResult(page, '고객 설치 안내', 'Word');
  if (education) await createResult(page, '팀 교육자료', 'Slides');
  await page.getByRole('button', { name: '고객 설치 안내', exact: true }).click();
  await page.getByRole('button', { name: '직접 편집', exact: true }).click();
  await expect(page.getByRole('button', { name: '읽기', exact: true })).toBeVisible();
  const paragraph = page.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(guideText);
  await expect(paragraph).toContainText(guideText);
  await state(page, true);
}
async function selectGuide(page: Page) {
  const paragraph = page.locator('.w-paragraph').filter({ hasText: guideText }).last();
  await paragraph.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const position = await paragraph.evaluate((element, quote) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = node.textContent?.indexOf(quote) ?? -1;
      if (start < 0) continue;
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + quote.length);
      const text = range.getBoundingClientRect(), paragraph = element.getBoundingClientRect();
      return { x: text.left - paragraph.left + text.width / 2, y: text.top - paragraph.top + text.height / 2 };
    }
    throw new Error('The intended customer-guide run is not rendered');
  }, selectedQuote);
  // Real browser word selection works in reading mode as well as direct editing.
  await paragraph.dblclick({ position });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(selectedQuote);
}
async function compose(page: Page) {
  await selectGuide(page);
  await page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '프로젝트 의견', exact: true });
  await expect(panel.getByRole('textbox', { name: '프로젝트 의견 입력' })).toBeVisible();
  await expect(panel.locator('blockquote')).toHaveText(selectedQuote);
  return panel;
}
async function returnProject(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Wonffice 작업 공간', exact: true });
  await navigation.locator('[data-menu]').click();
  await page.getByRole('menuitem', { name: '프로젝트로 돌아가기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '고객 안내 검토', exact: true })).toBeVisible();
}

async function delayNativeComment(page: Page) {
  // Delay only the actual public native command entry, then run its original implementation.
  await page.evaluate(async sharedModule => {
    const { productFeedbackHost } = await import(sharedModule) as typeof import('@barocss/shared');
    const host = productFeedbackHost()!, original = host.comment.bind(host);
    host.comment = async (target, body) => {
      document.documentElement.dataset.feedbackSubmitPending = 'true';
      await new Promise<void>(resolve => document.addEventListener('release-native-feedback', () => resolve(), { once: true }));
      host.comment = original; delete document.documentElement.dataset.feedbackSubmitPending;
      return original(target, body);
    };
  }, modules.shared);
}

test('selected native opinion, exact undo/redo, explicit same-thread work and pinned follow-up survive reload', async ({ page }) => {
  await openGuide(page, true);
  const before = await state(page, true), panel = await compose(page);
  await panel.getByRole('textbox', { name: '프로젝트 의견 입력' }).fill(opinion);
  await panel.getByRole('button', { name: '댓글만 남기기', exact: true }).click();
  await expect(panel.locator('.ow-feedback-thread')).toHaveCount(1);
  const commented = await state(page, true), comment = commented.record.comments[0]!;
  expect(comment.target.kind).toBe('word-comment');
  expect(comment.target.quote).toBe(selectedQuote);
  const threads = nativeNodes(commented.native).filter(node => node.stype === 'commentThread');
  expect(threads).toHaveLength(1); expect(threads[0]!.attributes?.id).toBe(comment.target.id);
  expect(nativeNodes(commented.native).flatMap(node => node.marks ?? []).filter(mark =>
    mark.stype === 'commentRef' && mark.attrs?.id === comment.target.id)).toHaveLength(1);
  expect(comment.body).toBe(opinion); expect(comment.workId).toBeUndefined();
  expect(commented.record.works).toEqual([]);
  expect(bodyText(commented.native)).toEqual(bodyText(before.native));
  expect(JSON.parse(comment.pin.text).document).toEqual(commented.native);
  expect(comment.pin.revision).toBe(commented.revision);
  await panel.getByRole('button', { name: '의견 닫기', exact: true }).click();
  await page.locator('.w-paragraph').filter({ hasText: guideText }).last().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect.poll(async () => (await state(page, true)).native).toEqual(before.native);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect.poll(async () => (await state(page, true)).native).toEqual(commented.native);
  await page.getByRole('button', { name: '의견 1', exact: true }).click();
  await panel.getByRole('button', { name: '수정 작업 연결', exact: true }).click();
  await expect(panel.getByRole('button', { name: '작업에 연결됨', exact: true })).toBeDisabled();
  await expect(panel).toContainText('실행기 미연결 · 원본은 자동 변경되지 않습니다.');
  const requested = await state(page, true), work = requested.record.works[0]!;
  expect(requested.record.comments).toHaveLength(1); expect(requested.record.works).toHaveLength(1);
  expect(work.commentId).toBe(comment.id); expect(work.state).toBe('unconnected');
  expect(requested.record.comments[0]!.target).toEqual(comment.target);
  expect(requested.record.comments[0]!.pin).toEqual(comment.pin);
  expect(requested.native).toEqual(commented.native);
  await returnProject(page);
  const row = page.locator('.ow-project-work'); await expect(row).toHaveCount(1);
  await row.locator('summary').click();
  await row.getByRole('button', { name: '일시 정지', exact: true }).click();
  await expect.poll(async () => (await state(page)).record.works[0]).toMatchObject({ id: work.id, state: 'paused' });
  await page.reload(); await row.locator('summary').click();
  await row.getByRole('button', { name: '같은 작업 재개', exact: true }).click();
  await expect.poll(async () => (await state(page)).record.works[0]).toMatchObject({ id: work.id, state: 'unconnected' });
  await row.getByRole('button', { name: '후속 결과 연결', exact: true }).click();
  const follow = page.getByRole('dialog', { name: '후속 결과 연결' });
  await follow.getByRole('button', { name: '후속 결과물', exact: true }).click();
  await page.getByRole('option', { name: '팀 교육자료', exact: true }).click();
  await follow.getByRole('button', { name: '현재 참고 원본', exact: true }).click();
  await page.getByRole('option', { name: '고객 설치 안내', exact: true }).click();
  await follow.getByRole('button', { name: '같은 요청에 연결', exact: true }).click();
  await expect(follow).toHaveCount(0);
  await expect(row.getByRole('group', { name: '수정 요청의 기준 원본', exact: true }).getByRole('button')).toHaveCount(1);
  await expect(row.getByRole('group', { name: '후속 결과의 참고 원본', exact: true })).toContainText('팀 교육자료');
  await expect(page.locator('.ow-project-activities')).toContainText('후속 결과물 연결');
  await expect(page.locator('.ow-project-activities')).not.toContainText('Follow-up result linked');
  const linked = await state(page), education = linked.record.results.find(one => one.name === '팀 교육자료')!;
  expect(linked.record.activities.at(-1)?.label).toBe('Follow-up result linked');
  expect(education.request).toBe(work.id);
  expect(linked.record.works).toHaveLength(1); expect(linked.record.works[0]!.id).toBe(work.id);
  expect(linked.record.works[0]!.outputs).toEqual(expect.arrayContaining([comment.resultId, education.id]));
  expect(linked.record.comments[0]!.target).toEqual(comment.target);
  expect(linked.record.comments[0]!.pin).toEqual(comment.pin);
  expect(education.inputs).toHaveLength(1);
  expect(education.inputs[0]!.text).toBe(linked.text); expect(education.inputs[0]!.revision).toBe(linked.revision);
  expect(linked.record.works[0]!.inputs).toContainEqual(education.inputs[0]);
  expect(linked.native).toEqual(commented.native);
  await page.reload(); const reopened = await state(page);
  expect(reopened.record).toEqual(linked.record); expect(reopened.native).toEqual(linked.native);
  await page.screenshot({ path: test.info().outputPath('same-work-feedback-follow-up.png'), fullPage: true });
});

test('draft survives close and reload; Korean composition Enter and Escape neither submit nor dismiss', async ({ page }) => {
  await openGuide(page); let panel = await compose(page);
  const textarea = panel.getByRole('textbox', { name: '프로젝트 의견 입력' });
  await textarea.fill('검토 의견 한글 조합');
  await textarea.dispatchEvent('compositionstart', { data: '한' });
  await textarea.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true, keyCode: 229 });
  await textarea.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
  await expect(panel).toBeVisible(); await expect(textarea).toHaveValue('검토 의견 한글 조합');
  expect((await state(page)).record.comments).toEqual([]);
  await textarea.dispatchEvent('compositionend', { data: '한' });
  await panel.getByRole('button', { name: '의견 닫기', exact: true }).click();
  await expect(panel).toHaveCount(0); await page.getByRole('button', { name: '의견 0', exact: true }).click();
  await expect(textarea).toHaveValue('검토 의견 한글 조합');
  await panel.getByRole('button', { name: '의견 닫기', exact: true }).click(); await page.reload();
  panel = await compose(page); await expect(panel.getByRole('textbox', { name: '프로젝트 의견 입력' })).toHaveValue('검토 의견 한글 조합');
  expect((await state(page)).record.comments).toEqual([]);
});

test('newer typing during an awaited native submit remains a distinct saved draft', async ({ page }) => {
  await openGuide(page); const panel = await compose(page), before = await state(page, true);
  const textarea = panel.getByRole('textbox', { name: '프로젝트 의견 입력' });
  await textarea.fill(opinion);
  await delayNativeComment(page);
  await panel.getByRole('button', { name: '댓글만 남기기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-feedback-submit-pending', 'true');
  const newer = '제출 중에 이어서 쓴 별도 의견'; await textarea.fill(newer);
  await page.evaluate(() => document.dispatchEvent(new Event('release-native-feedback')));
  await expect(panel.locator('.ow-feedback-thread')).toHaveCount(1);
  await expect(panel.locator('.ow-feedback-thread')).toContainText(opinion);
  await expect(panel).toContainText('작성 중인 의견을 보관했습니다.');
  const after = await state(page, true), guideAddress = after.record.results.find(one => one.name === '고객 설치 안내')!.document;
  expect(after.record.comments).toHaveLength(1); expect(after.record.comments[0]!.body).toBe(opinion);
  expect(after.record.drafts[`feedback:word:${guideAddress.id}`]).toBe(newer);
  expect(after.record.works).toEqual([]); expect(bodyText(after.native)).toEqual(bodyText(before.native));
  await panel.getByRole('button', { name: '의견 닫기', exact: true }).click(); await page.reload();
  await compose(page); await expect(page.getByRole('textbox', { name: '프로젝트 의견 입력' })).toHaveValue(newer);
});


test('an in-flight Korean composition stays mounted when an earlier opinion finishes saving', async ({ page }) => {
  await openGuide(page); const panel = await compose(page);
  const textarea = panel.getByRole('textbox', { name: '프로젝트 의견 입력' });
  await textarea.fill(opinion); await delayNativeComment(page);
  await panel.getByRole('button', { name: '댓글만 남기기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-feedback-submit-pending', 'true');
  await textarea.dispatchEvent('compositionstart', { data: '한' });
  const newer = '이어서 작성 중인 한글 의견'; await textarea.fill(newer);
  const composingElement = await textarea.elementHandle(); expect(composingElement).not.toBeNull();
  await page.evaluate(() => document.dispatchEvent(new Event('release-native-feedback')));
  await expect(panel.locator('.ow-feedback-thread')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '프로젝트 의견 남기기', exact: true })).toBeEnabled();
  await expect(textarea).toBeVisible(); await expect(textarea).toHaveValue(newer);
  expect(await composingElement!.evaluate(element => element.isConnected)).toBe(true);
  await expect(textarea).toBeFocused();
  await textarea.dispatchEvent('compositionend', { data: '견' });
  await panel.getByRole('button', { name: '의견 닫기', exact: true }).click(); await page.reload();
  await compose(page); await expect(page.getByRole('textbox', { name: '프로젝트 의견 입력' })).toHaveValue(newer);
  const saved = await state(page); expect(saved.record.comments).toHaveLength(1); expect(saved.record.comments[0]!.body).toBe(opinion);
});

// A separate browser component fixture exercises same-mounted ownership changes that
// the public shell normally performs through a full navigation. It uses the real
// Word host and repository; only the native command's delivery time is controlled.
test('same-mounted repository and project ABA retires an awaited native submission without clearing the new draft', async ({ page }) => {
  await openGuide(page);
  const before = await state(page, true);
  const entry = await (await page.request.get('/src/main.tsx')).text();
  const react = entry.match(/"([^"\n]*\/react\.js\?[^"\n]+)"/)?.[1];
  const client = entry.match(/"([^"\n]*\/react-dom_client\.js\?[^"\n]+)"/)?.[1];
  expect(react).toBeTruthy(); expect(client).toBeTruthy();
  const fixture = await page.evaluate(async ({ modules, react, client, sourceRoot }) => {
    const React = (await import(react!)).default as typeof import('react');
    const { createRoot } = (await import(client!)).default as typeof import('react-dom/client');
    const { OfficeWorkspace, workspaceIdentity } = await import(modules.workspace) as typeof import('@barocss/office-workspace');
    const { localProjectRepository } = await import(`/@fs${sourceRoot}/packages/office-workspace/src/project-local.ts`);
    const { ProjectFeedback } = await import(`/@fs${sourceRoot}/packages/office-workspace/src/project-feedback.tsx`);
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const projectA = (await workspace.projects())[0]!;
    const address = projectA.record.results.find(one => one.name === '고객 설치 안내')!.document;
    const emptyB = await workspace.createProject('다른 검토 프로젝트', '이전 요청은 현재 프로젝트로 전달하지 않는다.');
    const projectB = await workspace.saveProject({ ...emptyB.record,
      results: [{ ...projectA.record.results[0]!, id: crypto.randomUUID() }],
      drafts: { [`feedback:word:${address.id}`]: '다른 프로젝트의 기존 초안' }
    }, emptyB.revision);
    const repositoryA = localProjectRepository(workspace), repositoryB = localProjectRepository(workspace);
    const mount = document.createElement('section'); mount.dataset.feedbackOwnershipFixture = 'true'; document.body.append(mount);
    let pinCalls = 0, delayHydration = false;
    const readA = repositoryA.read.bind(repositoryA);
    repositoryA.read = async (id: string) => {
      const held = delayHydration; delayHydration = false;
      const value = await readA(id);
      if (held) {
        mount.dataset.hydrationPending = 'true';
        await new Promise<void>(resolve => document.addEventListener('release-feedback-hydration', () => resolve(), { once: true }));
        delete mount.dataset.hydrationPending;
      }
      return value;
    };
    document.addEventListener('feedback-fixture-delay-hydration', () => { delayHydration = true; });
    for (const repository of [repositoryA, repositoryB]) {
      const pin = repository.pin.bind(repository);
      repository.pin = async (value: { product: 'word'; id: string }) => { mount.dataset.pinCalls = String(++pinCalls); return pin(value); };
    }
    const root = createRoot(mount);
    function Harness({ owner }: { owner: 'A' | 'B' }) {
      React.useEffect(() => { mount.dataset.owner = owner; }, [owner]);
      return React.createElement(ProjectFeedback, {
        repository: owner === 'A' ? repositoryA : repositoryB,
        projectId: owner === 'A' ? projectA.record.id : projectB.record.id,
        document: address, actor: { kind: 'local', id: `fixture-${owner}`, label: `이 브라우저 사용자 ${owner}` }
      });
    }
    const render = (owner: 'A' | 'B') => root.render(React.createElement(Harness, { owner }));
    document.addEventListener('feedback-fixture-owner', event => render((event as CustomEvent<'A' | 'B'>).detail));
    render('A');
    return { projectA: projectA.record.id, projectB: projectB.record.id, address };
  }, { modules, react, client, sourceRoot });
  const mounted = page.locator('[data-feedback-ownership-fixture]');
  await expect(mounted).toHaveAttribute('data-owner', 'A');
  await selectGuide(page); await mounted.getByRole('button', { name: '프로젝트 의견 남기기', exact: true }).click();
  const textarea = mounted.getByRole('textbox', { name: '프로젝트 의견 입력' });
  await textarea.fill(opinion); await delayNativeComment(page);
  await mounted.getByRole('button', { name: '댓글만 남기기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-feedback-submit-pending', 'true');
  const pinCalls = await mounted.getAttribute('data-pin-calls');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('feedback-fixture-owner', { detail: 'B' })));
  await expect(mounted).toHaveAttribute('data-owner', 'B');
  await expect(textarea).toHaveValue('다른 프로젝트의 기존 초안');
  await expect(mounted.getByRole('button', { name: '댓글만 남기기', exact: true })).toBeDisabled();
  const draftB = '다른 프로젝트에서 작성한 초안'; await textarea.fill(draftB);
  const readProjects = () => page.evaluate(async ({ modules, fixture }) => {
    const { OfficeWorkspace, workspaceIdentity } = await import(modules.workspace) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    return { a: (await workspace.project(fixture.projectA))!.record, b: (await workspace.project(fixture.projectB))!.record };
  }, { modules, fixture });
  const key = `feedback:word:${fixture.address.id}`;
  await expect.poll(async () => (await readProjects()).b.drafts[key]).toBe(draftB);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('feedback-fixture-delay-hydration'));
    document.dispatchEvent(new CustomEvent('feedback-fixture-owner', { detail: 'A' }));
  });
  await expect(mounted).toHaveAttribute('data-owner', 'A');
  await expect(mounted).toHaveAttribute('data-hydration-pending', 'true');
  await expect(mounted.getByRole('button', { name: '댓글만 남기기', exact: true })).toBeDisabled();
  const newDraft = '돌아온 프로젝트의 새 초안'; await textarea.fill(newDraft);
  await expect.poll(async () => (await readProjects()).a.drafts[key]).toBe(newDraft);
  await page.evaluate(() => document.dispatchEvent(new Event('release-feedback-hydration')));
  await expect(mounted).not.toHaveAttribute('data-hydration-pending');
  await expect(textarea).toHaveValue(newDraft);
  await page.evaluate(() => document.dispatchEvent(new Event('release-native-feedback')));
  await expect.poll(async () => nativeNodes((await state(page, true)).native).filter(node => node.stype === 'commentThread').length).toBe(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(mounted).toHaveAttribute('data-pin-calls', pinCalls!);
  await expect(textarea).toHaveValue(newDraft);
  await expect(mounted.getByRole('button', { name: '프로젝트 의견 남기기', exact: true })).toBeEnabled();
  const after = await readProjects();
  expect(after.a.comments).toEqual([]); expect(after.a.works).toEqual([]); expect(after.a.drafts[key]).toBe(newDraft);
  expect(after.b.comments).toEqual([]); expect(after.b.works).toEqual([]); expect(after.b.drafts[key]).toBe(draftB);
  expect(bodyText((await state(page, true)).native)).toEqual(bodyText(before.native));
});

// Local component ownership coverage, not an authenticated account-switch test.
test('project home retires old pinned reads and stops refresh continuation after unmount', async ({ page }) => {
  await openGuide(page);
  const before = await state(page, true);
  const entry = await (await page.request.get('/src/main.tsx')).text();
  const react = entry.match(/"([^"\n]*\/react\.js\?[^"\n]+)"/)?.[1];
  const client = entry.match(/"([^"\n]*\/react-dom_client\.js\?[^"\n]+)"/)?.[1];
  expect(react).toBeTruthy(); expect(client).toBeTruthy();
  const fixture = await page.evaluate(async ({ modules, react, client, sourceRoot }) => {
    const React = (await import(react!)).default as typeof import('react');
    const { createRoot } = (await import(client!)).default as typeof import('react-dom/client');
    const { OfficeWorkspace, workspaceIdentity } = await import(modules.workspace) as typeof import('@barocss/office-workspace');
    const { localProjectRepository } = await import(`/@fs${sourceRoot}/packages/office-workspace/src/project-local.ts`);
    const { ProjectHome } = await import(`/@fs${sourceRoot}/packages/office-workspace/src/project-ui.tsx`);
    const workspace = new OfficeWorkspace(workspaceIdentity()), original = (await workspace.projects())[0]!;
    const guide = original.record.results.find(one => one.name === '고객 설치 안내')!;
    const pin = await workspace.pin(guide.document);
    const projectA = await workspace.saveProject({ ...original.record,
      activities: [...original.record.activities, { id: crypto.randomUUID(), at: new Date().toISOString(), label: '직접 기록한 활동: 원문 유지' }],
      results: original.record.results.map(one => one.id === guide.id ? { ...one, inputs: [...one.inputs, pin] } : one)
    }, original.revision);
    const projectB = await workspace.createProject('다른 소유자의 프로젝트', '이전 화면의 자료를 표시하지 않는다.');
    const repositoryA = localProjectRepository(workspace), repositoryB = localProjectRepository(workspace);
    const mount = document.createElement('section'); mount.dataset.projectHomeFixture = 'true'; document.body.append(mount);
    const originalReadPin = repositoryA.readPin.bind(repositoryA);
    repositoryA.readPin = async (project: string, id: string) => {
      const value = await originalReadPin(project, id); mount.dataset.pinPending = 'true';
      await new Promise<void>(resolve => document.addEventListener('release-home-pin', () => resolve(), { once: true }));
      mount.dataset.pinResolved = 'true'; return value;
    };
    const repositoryC = localProjectRepository(workspace);
    const list = repositoryC.list.bind(repositoryC), documents = repositoryC.documents.bind(repositoryC), read = repositoryC.read.bind(repositoryC);
    let documentCalls = 0, readCalls = 0;
    mount.dataset.documentCalls = '0'; mount.dataset.readCalls = '0';
    repositoryC.list = async () => {
      const value = await list(); mount.dataset.listPending = 'true';
      await new Promise<void>(resolve => document.addEventListener('release-home-list', () => resolve(), { once: true }));
      mount.dataset.listResolved = 'true'; return value;
    };
    repositoryC.documents = () => { mount.dataset.documentCalls = String(++documentCalls); return documents(); };
    repositoryC.read = (id: string) => { mount.dataset.readCalls = String(++readCalls); return read(id); };
    const root = createRoot(mount);
    function Harness({ owner }: { owner: 'A' | 'B' | 'C' | 'unmounted' }) {
      React.useEffect(() => { mount.dataset.owner = owner; }, [owner]);
      return owner === 'unmounted' ? null : React.createElement(ProjectHome, {
        repository: owner === 'A' ? repositoryA : owner === 'B' ? repositoryB : repositoryC,
        onOpen: async () => {}, onLibrary: () => {}
      });
    }
    const render = (owner: 'A' | 'B' | 'C' | 'unmounted') => {
      const url = new URL(location.href); url.searchParams.set('project', owner === 'B' ? projectB.record.id : projectA.record.id);
      history.replaceState(null, '', url); root.render(React.createElement(Harness, { owner }));
    };
    document.addEventListener('home-fixture-owner', event => render((event as CustomEvent<'A' | 'B' | 'C' | 'unmounted'>).detail));
    render('A'); return { pinTitle: `${pin.title} · 버전 ${pin.revision}` };
  }, { modules, react, client, sourceRoot });
  const mounted = page.locator('[data-project-home-fixture]');
  await expect(mounted.getByRole('heading', { name: '고객 안내 검토', exact: true })).toBeVisible();
  const recordedActivity = mounted.getByRole('listitem').filter({ hasText: '직접 기록한 활동: 원문 유지' });
  await expect(recordedActivity).toHaveCount(1);
  await expect(recordedActivity).toBeVisible();
  await expect.poll(() => recordedActivity.evaluate(element => Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()))
    .toBe('직접 기록한 활동: 원문 유지');
  await mounted.locator('.ow-project-result summary').click();
  await mounted.getByRole('button', { name: fixture.pinTitle, exact: true }).click();
  await expect(mounted).toHaveAttribute('data-pin-pending', 'true');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('home-fixture-owner', { detail: 'B' })));
  await expect(mounted.getByRole('heading', { name: '다른 소유자의 프로젝트', exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('release-home-pin')));
  await expect(mounted).toHaveAttribute('data-pin-resolved', 'true');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Keep both independent failure signals when running this case against the old implementation.
  await expect.soft(page.getByRole('dialog', { name: '사용한 원본 버전', exact: true })).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('home-fixture-owner', { detail: 'C' })));
  await expect(mounted).toHaveAttribute('data-list-pending', 'true');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('home-fixture-owner', { detail: 'unmounted' })));
  await expect(mounted).toHaveAttribute('data-owner', 'unmounted');
  await expect(mounted.locator('.ow-project-home')).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new Event('release-home-list')));
  await expect(mounted).toHaveAttribute('data-list-resolved', 'true');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.soft(mounted).toHaveAttribute('data-document-calls', '0');
  await expect.soft(mounted).toHaveAttribute('data-read-calls', '0');
  const after = await state(page, true); expect(after.native).toEqual(before.native); expect(after.text).toBe(before.text);
});
