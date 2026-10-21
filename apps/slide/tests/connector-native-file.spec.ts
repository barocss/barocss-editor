import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

type NativeNode = { stype: string; attributes?: Record<string, unknown>; content?: NativeNode[] };
const nodesOf = (root: NativeNode): NativeNode[] => [root, ...(root.content ?? []).flatMap(nodesOf)];
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const feedback = (page: Page) => page.getByRole('complementary', { name: '파일 작업 상태' });

async function makeDiagram(page: Page) {
  return page.evaluate(async () => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const slide = root.content.find((sid: string) => store.getNode(sid)?.stype === 'surface');
    const existing = store.getNode(slide).content ?? [];
    if (existing.length) {
      editor.setNode({ nodeIds: existing });
      if (!await editor.executeCommand('deleteBoxes')) throw new Error('Could not clear source slide');
    }
    const targets: string[] = [];
    for (const [command, x] of [['insertRectangle', 2000], ['insertEllipse', 11000]] as const) {
      if (!await editor.executeCommand(command, { slideId: slide, x, y: x === 2000 ? 1500 : 3500, width: 2500, height: 1500,
        attributes: { name: 'Same display name' } })) throw new Error('Could not insert target');
      targets.push(editor.selection.nodeIds[0]);
    }
    if (!await editor.executeCommand('insertConnector', { startNodeId: targets[0], endNodeId: targets[1],
      startSide: 'e', endSide: 'w', kind: 'elbow' })) throw new Error('Could not attach connector');
    const flow = store.getNode(slide).content.at(-1);
    if (!await editor.executeCommand('insertConnector', { startNodeId: targets[0], endNodeId: flow,
      endT: 0.4, startSide: 's', kind: 'curve' })) throw new Error('Could not attach line-target connector');
    const branch = store.getNode(slide).content.at(-1);
    return { targets, flow, branch, objectIds: [...targets, flow, branch].map(sid => store.getNode(sid).attributes.objectId) };
  });
}

async function downloadFile(page: Page, path: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  await download.saveAs(path);
  return readFileSync(path, 'utf8');
}

async function openedDiagram(page: Page, objectIds: string[]) {
  return page.evaluate(ids => {
    const editor = (window as any).editor;
    const store = editor.dataStore;
    const all: any[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node) return;
      all.push(node);
      for (const child of node.content ?? []) walk(child);
    };
    walk(editor.getRootId());
    return ids.map(id => {
      const node = all.find(node => node.attributes?.objectId === id);
      if (!node) throw new Error('Native target identity was lost');
      return { sid: node.sid, attributes: node.attributes };
    });
  }, objectIds);
}

const pathFor = (page: Page, sid: string) => page.locator(`.sl-stage .sl-connector[data-bc-sid="${sid}"] path`).nth(1);

test('native download opens in fresh and nonempty sessions with exact target bindings and drawn follow-through', async ({ page, browser }, testInfo) => {
  await openDeck(page);
  const original = await makeDiagram(page);
  expect(original.objectIds.every(id => typeof id === 'string' && !!id)).toBe(true);
  expect(new Set(original.objectIds).size).toBe(4);
  const sourcePath = testInfo.outputPath('command-created.slides.json');
  const source = await downloadFile(page, sourcePath);
  const file = JSON.parse(source);
  expect(file.version).toBe(2);
  expect(source).not.toContain('startNodeId');
  expect(source).not.toContain('endNodeId');
  const native = nodesOf(file.document);
  expect(native.some(node => Object.hasOwn(node, 'sid'))).toBe(false);
  const flow = native.find(node => node.attributes?.objectId === original.objectIds[2])!;
  const branch = native.find(node => node.attributes?.objectId === original.objectIds[3])!;
  expect(flow.attributes).toMatchObject({ startObjectId: original.objectIds[0], endObjectId: original.objectIds[1], startSide: 'e', endSide: 'w' });
  expect(branch.attributes).toMatchObject({ startObjectId: original.objectIds[0], endObjectId: original.objectIds[2], endT: 0.4 });
  const sourceHash = digest(source);
  const pageErrors: string[] = [];

  const freshContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const freshPage = await freshContext.newPage();
  try {
    await openDeck(freshPage);
    // One untouched fresh browser session and one already-edited session.
    for (const destination of [freshPage, page]) {
      destination.on('dialog', dialog => void dialog.accept());
      destination.on('pageerror', error => {
        pageErrors.push(error.message);
        console.error(`Native reopen page error: ${error.stack ?? error.message}`);
      });
      await destination.getByLabel('슬라이드 파일', { exact: true }).setInputFiles(sourcePath);
      await expect(feedback(destination)).toContainText('파일 열기 완료');
      const loaded = await openedDiagram(destination, original.objectIds);
      expect(loaded[0].attributes.name).toBe('Same display name');
      expect(loaded[1].attributes.name).toBe('Same display name');
      expect(loaded[2].attributes).toMatchObject({ startNodeId: loaded[0].sid, endNodeId: loaded[1].sid, startSide: 'e', endSide: 'w' });
      expect(loaded[3].attributes).toMatchObject({ startNodeId: loaded[0].sid, endNodeId: loaded[2].sid, endT: 0.4 });
      await expect(pathFor(destination, loaded[2].sid)).toBeVisible();
      await expect(pathFor(destination, loaded[3].sid)).toBeVisible();
      const reopenedFile = JSON.parse(await downloadFile(destination, testInfo.outputPath(destination === page
        ? 'nonempty-before-edit.slides.json' : 'fresh-before-edit.slides.json')));
      expect(reopenedFile.document).toEqual(file.document);
      const beforeFlow = await pathFor(destination, loaded[2].sid).getAttribute('d');
      const beforeBranch = await pathFor(destination, loaded[3].sid).getAttribute('d');
      expect(await destination.evaluate(async sid => await (window as any).editor.executeCommand('setBoxGeometry',
        { nodeIds: [sid], y: 4500 }), loaded[1].sid)).toBe(true);
      await expect.poll(() => pathFor(destination, loaded[2].sid).getAttribute('d')).not.toBe(beforeFlow);
      await expect.poll(() => pathFor(destination, loaded[3].sid).getAttribute('d')).not.toBe(beforeBranch);
      const after = await openedDiagram(destination, original.objectIds);
      expect(after[2].attributes.endNodeId).toBe(loaded[1].sid);
      expect(after[3].attributes.endNodeId).toBe(loaded[2].sid);
      expect(after[3].attributes.endT).toBe(0.4);
      await destination.screenshot({ path: testInfo.outputPath(destination === page ? 'nonempty-following.png' : 'fresh-following.png') });
      const exported = JSON.parse(await downloadFile(destination, testInfo.outputPath(destination === page ? 'nonempty-resave.slides.json' : 'fresh-resave.slides.json')));
      const resaved = nodesOf(exported.document);
      expect(resaved.find(node => node.attributes?.objectId === original.objectIds[2])?.attributes).toMatchObject({
        startObjectId: original.objectIds[0], endObjectId: original.objectIds[1] });
      expect(resaved.find(node => node.attributes?.objectId === original.objectIds[3])?.attributes).toMatchObject({
        endObjectId: original.objectIds[2], endT: 0.4 });
    }
    expect(digest(readFileSync(sourcePath, 'utf8'))).toBe(sourceHash);
    expect(pageErrors).toEqual([]);
  } finally { await freshContext.close(); }
});

test('invalid native references and legacy SID attachments refuse replacement and preserve each source file', async ({ page }, testInfo) => {
  await openDeck(page);
  const original = await makeDiagram(page);
  const sourcePath = testInfo.outputPath('valid-source.slides.json');
  const source = await downloadFile(page, sourcePath);
  const baseline = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const variants = ['missing', 'duplicate', 'wrong-scope', 'legacy-sid', 'newer-version'] as const;
  for (const kind of variants) {
    const file = JSON.parse(source);
    const nodes = nodesOf(file.document);
    const targets = original.objectIds.map(id => nodes.find(node => node.attributes?.objectId === id)!);
    if (kind === 'missing') targets[2].attributes!.startObjectId = 'missing-object-id';
    if (kind === 'duplicate') targets[1].attributes!.objectId = original.objectIds[0];
    if (kind === 'wrong-scope') {
      const surfaces = file.document.content.filter((node: NativeNode) => node.stype === 'surface') as NativeNode[];
      surfaces[0].content = surfaces[0].content!.filter(node => node !== targets[0]);
      surfaces[1].content = [...(surfaces[1].content ?? []), targets[0]];
    }
    if (kind === 'legacy-sid') {
      file.version = 1;
      targets[2].attributes!.startNodeId = original.targets[0];
      targets[2].attributes!.endNodeId = original.targets[1];
      delete targets[2].attributes!.startObjectId;
      delete targets[2].attributes!.endObjectId;
    }
    if (kind === 'newer-version') file.version = 99;
    const path = testInfo.outputPath(`${kind}.slides.json`);
    const bytes = JSON.stringify(file);
    writeFileSync(path, bytes);
    const before = digest(readFileSync(path, 'utf8'));
    await page.getByLabel('슬라이드 파일', { exact: true }).setInputFiles(path);
    await expect(feedback(page).getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(baseline);
    expect(digest(readFileSync(path, 'utf8'))).toBe(before);
    await feedback(page).getByRole('button', { name: /알림 닫기/ }).click();
  }
  expect(readFileSync(sourcePath, 'utf8')).toBe(source);
});
