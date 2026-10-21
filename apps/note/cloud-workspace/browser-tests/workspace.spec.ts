import { test, expect, type Page } from '@playwright/test';

const api = '/api/workspace';
async function create(page: Page, name: string, text: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '새 문서', exact: true }).click();
  await page.getByLabel('문서 제목').fill(name);
  const body = page.locator('.cw-native .on-doc > p').first();
  await body.click(); await page.keyboard.insertText(text);
  await expect(body).toHaveText(text);
  return body;
}
async function save(page: Page) {
  await page.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved');
  return new URL(page.url()).searchParams.get('document')!;
}

test('real Note direct editing, native undo/redo, save, reload and document-list reopen', async ({ page }, info) => {
  const name = `Native editing ${Date.now()}`;
  const body = await create(page, name, 'A directly authored paragraph.');
  await page.getByLabel('실행 취소', { exact: true }).click();
  await expect(body).toHaveText('');
  await page.getByLabel('다시 실행', { exact: true }).click();
  await expect(body).toHaveText('A directly authored paragraph.');
  const id = await save(page);
  const saved = await (await page.request.get(`${api}/documents/${id}`)).json();
  expect(saved.revision).toBe(1);
  expect(JSON.parse(saved.snapshotText).document.content[0].content[0].text).toBe('A directly authored paragraph.');
  await expect(page.getByRole('button', { name: 'AI 제안 요청', exact: true })).toBeDisabled();
  await expect(page.getByText('AI 연결 안 됨', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('workspace-desktop.png'), fullPage: true });
  await page.reload(); await expect(page.getByLabel('문서 제목')).toHaveValue(name);
  await expect(body).toHaveText('A directly authored paragraph.');
  await page.goto('/');
  await page.getByRole('navigation', { name: '내 문서', exact: true }).getByRole('button', { name: new RegExp(name) }).click();
  await expect(body).toHaveText('A directly authored paragraph.');
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' More direct work.');
  await save(page);
  expect((await (await page.request.get(`${api}/documents/${id}`)).json()).revision).toBe(2);
});

test('two tabs refuse stale saves and retain the losing native draft', async ({ page, context }, info) => {
  const name = `Conflict ${Date.now()}`;
  await create(page, name, 'Shared starting text.');
  const id = await save(page);
  const other = await context.newPage(); await other.goto(`/?document=${id}`);
  const firstBody = page.locator('.cw-native .on-doc > p').first();
  const secondBody = other.locator('.cw-native .on-doc > p').first();
  await firstBody.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Writer A.'); await save(page);
  await secondBody.click(); await other.keyboard.press('End'); await other.keyboard.insertText(' Writer B draft.');
  await other.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(other.getByText('새로운 서버 변경이 있습니다', { exact: true })).toBeVisible();
  await expect(secondBody).toHaveText('Shared starting text. Writer B draft.');
  const server = await (await page.request.get(`${api}/documents/${id}`)).json();
  expect(server.revision).toBe(2); expect(server.snapshotText).toContain('Writer A.'); expect(server.snapshotText).not.toContain('Writer B');
  const downloadEvent = other.waitForEvent('download'); await other.getByRole('button', { name: '초안 내려받기' }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toBe('workspace-draft.note.json');
  await other.screenshot({ path: info.outputPath('conflict-keeps-draft.png'), fullPage: true });
  other.once('dialog', dialog => dialog.accept());
  await other.getByRole('button', { name: '최신본 열기', exact: true }).click();
  await expect(secondBody).toHaveText('Shared starting text. Writer A.');
  await expect(other.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved');
  await other.close();
});

test('a lost acknowledgment retries the frozen request while preserving later input', async ({ page }) => {
  await create(page, `Lost ack ${Date.now()}`, 'Frozen save text.');
  let lost = false; const requests: string[] = [];
  await page.route(`**${api}/documents`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push(route.request().postData()!);
    if (!lost) { lost = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(page.getByText('초안을 유지하고 있습니다', { exact: true })).toBeVisible();
  const body = page.locator('.cw-native .on-doc > p').first();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Later unsaved input.');
  await page.getByRole('button', { name: '저장 확인·재시도', exact: true }).click();
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'dirty');
  expect(requests).toHaveLength(2); expect(requests[1]).toBe(requests[0]);
  const id = new URL(page.url()).searchParams.get('document');
  const frozen = await (await page.request.get(`${api}/documents/${id}`)).json();
  expect(frozen.revision).toBe(1); expect(frozen.snapshotText).not.toContain('Later unsaved');
  await expect(body).toHaveText('Frozen save text. Later unsaved input.');
  await save(page);
  expect((await (await page.request.get(`${api}/documents/${id}`)).json()).revision).toBe(2);
});

test('save error keeps the draft and dirty navigation is blocked', async ({ page }) => {
  const body = await create(page, `Network failure ${Date.now()}`, 'Do not lose this draft.');
  await page.route(`**${api}/documents`, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, headers: { 'Content-Type': 'application/json', 'X-Workspace-User-Scope': 'fictional-owner-a' }, body: '{"code":"storage_error"}' })
    : route.continue());
  await page.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'unconfirmed');
  await page.getByRole('button', { name: '새 문서', exact: true }).click();
  await expect(page.getByText('현재 문서에 저장되지 않은 변경이 있습니다. 저장한 뒤 이동하세요.')).toBeVisible();
  await expect(body).toHaveText('Do not lose this draft.');
  await page.unroute(`**${api}/documents`);
  await page.getByRole('button', { name: '저장 확인·재시도', exact: true }).click();
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved');
});

test('separate browser identities and anonymous browser cannot access another document', async ({ page, browser }) => {
  await create(page, `Private ${Date.now()}`, 'Fictional owner A private text.');
  const id = await save(page);
  for (const identity of ['fictional-owner-b', 'none']) {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'cw-test-identity', value: identity, url: 'http://127.0.0.1:5194' }]);
    const other = await context.newPage(); await other.goto('/');
    const response = await context.request.get(`http://127.0.0.1:5194${api}/documents/${id}`);
    expect(response.status()).toBe(identity === 'none' ? 401 : 404);
    if (identity === 'none') await expect(other.getByRole('heading', { name: '비공개 작업공간입니다' })).toBeVisible();
    else {
      const rows = await (await context.request.get(`http://127.0.0.1:5194${api}/documents`)).json();
      expect(rows.documents).toHaveLength(0);
      await expect(other.getByText('Fictional owner A private text.')).toHaveCount(0);
    }
    await context.close();
  }
});

test('identity retirement removes the previous owner document from the screen', async ({ page, context }) => {
  await create(page, `Retirement ${Date.now()}`, 'Private prior owner draft.'); await save(page);
  const body = page.locator('.cw-native .on-doc > p').first();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Pending change.');
  await context.addCookies([{ name: 'cw-test-identity', value: 'fictional-owner-b', url: 'http://127.0.0.1:5194' }]);
  await page.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '비공개 작업공간입니다' })).toBeVisible();
  await expect(page.locator('.cw-native')).toHaveCount(0);
  await expect(page.getByText('Private prior owner draft.')).toHaveCount(0);
});

test('the real editor preserves unrelated rich native data, authored savedAt and history after reopen', async ({ page }) => {
  const documentId = crypto.randomUUID();
  const original = { stype: 'note', attributes: { title: 'Native preservation', pageId: `note-${crypto.randomUUID()}` }, content: [
    { stype: 'paragraph', metadata: { loadedAt: 'authored-paragraph', compatibleUnknown: { keep: true } }, content: [
      { stype: 'inline-text', text: 'Original editable paragraph.', marks: [], metadata: { loadedAt: 'authored-run' } }
    ] },
    { stype: 'blockQuote', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated rich quote', marks: [{ stype: 'bold', range: [0, 9] }] }] }] },
    { stype: 'resources', content: [{ stype: 'richText', attributes: { id: 'retained-resource' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Retain this resource', marks: [] }] }] }] }
  ] };
  const created = await page.request.post(`${api}/documents`, { headers: { Origin: 'http://127.0.0.1:5194' }, data: {
    documentId, baseRevision: 0, requestId: crypto.randomUUID(), snapshotText: JSON.stringify({ format: 'barocss-note', version: 1, savedAt: 'authored-time-retained', document: original }, null, 2) + '\n'
  } });
  expect(created.status()).toBe(200);
  await page.goto(`/?document=${documentId}`);
  const body = page.locator('.cw-native .on-doc > p').first();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Direct addition.');
  await save(page);
  const saved = JSON.parse((await (await page.request.get(`${api}/documents/${documentId}`)).json()).snapshotText);
  const expected = structuredClone(original);
  const first = expected.content[0] as { content: { text: string }[] };
  first.content[0].text += ' Direct addition.';
  expect(saved.document).toEqual(expected); expect(saved.savedAt).toBe('authored-time-retained');
  await page.getByLabel('실행 취소', { exact: true }).click(); await expect(body).toHaveText('Original editable paragraph.');
  await page.getByLabel('다시 실행', { exact: true }).click(); await expect(body).toHaveText('Original editable paragraph. Direct addition.');
});

test('a definite validation refusal permits a corrected explicit attempt with a new key', async ({ page }) => {
  const body = await create(page, `Corrected draft ${Date.now()}`, 'First draft.');
  let refused = false; const payloads: Array<{ requestId: string; snapshotText: string }> = [];
  await page.route(`**${api}/documents`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    payloads.push(JSON.parse(route.request().postData()!));
    if (!refused) {
      refused = true;
      await route.fulfill({ status: 422, headers: { 'Content-Type': 'application/json', 'X-Workspace-User-Scope': 'fictional-owner-a' }, body: '{"code":"unsupported_note"}' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await expect(page.getByText('초안을 유지하고 있습니다', { exact: true })).toBeVisible();
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' Corrected.');
  await save(page);
  expect(payloads).toHaveLength(2); expect(payloads[0].requestId).not.toBe(payloads[1].requestId);
  expect(payloads[1].snapshotText).toContain('Corrected.');
});
