import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DataStoreExporter } from '@barocss/datastore';
import { createSampleDocument, createWordEditor } from '../src/index';
import { CommentsPane } from '../src/comments-pane';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { createStarterDocument } from '../src/starter-document';
import { ANCHOR_STYPE } from '../src/highlight-decorators';

let editor: ReturnType<typeof createWordEditor>, host: HTMLDivElement, root: Root;
const native = () => JSON.stringify(new DataStoreExporter(editor.dataStore).exportToTree(editor.getRootId()!));
const view = { setDecorators: vi.fn() } as unknown as EditorViewDOM;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  editor = createWordEditor(); editor.loadDocument(createSampleDocument());
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); editor.destroy(); host.remove(); });

it('lets a viewer open, select and close comment threads without enabling document mutations', async () => {
  editor.setEditable(false);
  const initial = native();
  let open = false;
  const render = () => root.render(createElement(CommentsPane, { editor, view, open, readOnly: true, onToggle: () => { open = !open; render(); } }));
  await act(async () => render());
  const toggle = host.querySelector<HTMLButtonElement>('.w-comments-closed')!;
  expect(toggle.disabled).toBe(false);
  await act(async () => toggle.click());
  expect(host.querySelector('[aria-label="Comments"]')).not.toBeNull();
  const thread = host.querySelector<HTMLElement>('[data-comment]')!;
  expect(thread).not.toBeNull();
  await act(async () => thread.click());
  for (const label of ['Edit comment', 'Send reply', 'Resolve comment', 'Delete comment']) {
    const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
  }
  expect(host.querySelector<HTMLInputElement>('[aria-label="Reply"]')!.disabled).toBe(true);
  expect(native()).toBe(initial);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="댓글 닫기"]')!.click());
  expect(host.querySelector('[aria-label="Comments"]')).toBeNull();
  expect(native()).toBe(initial);
});

it('disables writer comment mutation controls immediately when live editor authority is revoked', async () => {
  await act(async () => root.render(createElement(CommentsPane, { editor, view, open: true, onToggle: () => {} })));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Delete comment"]')!.disabled).toBe(false);
  const initial = native();
  await act(async () => editor.setEditable(false));
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Delete comment"]')!;
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(native()).toBe(initial);
});

it('highlights every original rich comment run and clears all coverage when one part is missing', async () => {
  const source = createStarterDocument();
  const surface = source.content!.find(node => typeof node !== 'string' && node.stype === 'surface');
  if (!surface || typeof surface === 'string') throw new Error('Missing surface');
  surface.content = [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'Plain ' },
    { stype: 'inline-text', text: 'bold', marks: [{ stype: 'bold' }] }
  ] }];
  editor.loadDocument(source);
  const runs = [...editor.dataStore.getNodes().values()].filter(node => node.stype === 'inline-text' && ['Plain ', 'bold'].includes(node.text ?? ''));
  editor.setRange({ type: 'range', collapsed: false, startNodeId: runs[0].sid!, startOffset: 0, endNodeId: runs[1].sid!, endOffset: 4 });
  expect(await editor.run('insertComment', { id: 'rich-original', text: 'Keep original marks' })).toBe(true);
  const initial = native();
  await act(async () => root.render(createElement(CommentsPane, { editor, view, open: true, onToggle: () => {} })));
  expect(vi.mocked(view.setDecorators)).toHaveBeenLastCalledWith(ANCHOR_STYPE, [
    expect.objectContaining({ target: { sid: runs[0].sid, startOffset: 0, endOffset: 6 } }),
    expect.objectContaining({ target: { sid: runs[1].sid, startOffset: 0, endOffset: 4 } })
  ]);
  expect(native()).toBe(initial);
  await act(async () => {
    const run = editor.dataStore.getNode(runs[1].sid!)!;
    editor.dataStore.setNode({ ...run, marks: run.marks?.filter(mark => mark.stype !== 'commentRef') });
    editor.emit('editor:content.change');
  });
  expect(vi.mocked(view.setDecorators)).toHaveBeenLastCalledWith(ANCHOR_STYPE, []);
});
