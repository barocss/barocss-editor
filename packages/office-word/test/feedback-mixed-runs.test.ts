import { afterEach, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { mountWordRuntime, type WordRuntime } from '../../../apps/word/src/runtime';
import { createWordEditor } from '../src/word-kit';
import { createStarterDocument } from '../src/starter-document';
import { createWordFeedbackHost } from '../src/feedback-host';
import { wordFileText, readWordFile } from '../src/word-file';
import type { INode } from '@barocss/datastore';

const editors: ReturnType<typeof createWordEditor>[] = [];
const runtimes: WordRuntime[] = [], surfaces: HTMLDivElement[] = [];
afterEach(() => {
  runtimes.splice(0).forEach(runtime => runtime.dispose()); surfaces.splice(0).forEach(surface => surface.remove());
  editors.splice(0).forEach(editor => editor.destroy()); vi.restoreAllMocks();
});
const quote = '설치 전 문서를 닫고 업데이트하세요.';
function fixture() {
  const document = createStarterDocument();
  const surface = document.content!.find(node => typeof node !== 'string' && node.stype === 'surface') as INode;
  const paragraph = (id: string): INode => ({ stype: 'paragraph', attributes: { objectId: id, styleId: 'Body' }, content: [
    { stype: 'inline-text', text: '설치 전 ', attributes: { objectId: `${id}-plain` } },
    { stype: 'inline-text', text: '문서를 닫고 ', attributes: { objectId: `${id}-bold` }, marks: [{ stype: 'bold' }] },
    { stype: 'inline-text', text: '업데이트하세요.', attributes: { objectId: `${id}-link` }, marks: [{ stype: 'link', attrs: { href: 'https://example.invalid/guide' } }] }
  ] });
  surface.content = [paragraph('original'), paragraph('equal-quote')];
  const editor = createWordEditor({ author: { name: 'Fictional author', date: () => '2026-10-03' } });
  editors.push(editor); editor.loadDocument(document);
  const runs = [...editor.dataStore.getNodes().values()].filter(node => node.stype === 'inline-text' && String(node.attributes?.objectId).startsWith('original-'));
  editor.setRange({ type: 'range', collapsed: false, startNodeId: runs[0].sid!, startOffset: 0, endNodeId: runs[2].sid!, endOffset: runs[2].text!.length });
  const host = createWordFeedbackHost({ editor, id: () => 'canonical-document', canComment: () => true, captureSelection: () => editor.selection });
  return { editor, host, runs };
}
const native = (editor: ReturnType<typeof createWordEditor>) => structuredClone(editor.exportDocument());

it('captures a mixed run range without changing native source, selection or history, then locates only its durable anchor after reopen', async () => {
  const { editor, host } = fixture();
  const before = { document: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()) };
  const target = host.capture();
  expect(target?.quote).toBe(quote);
  expect(host.excerpt!(target!)).toEqual([
    { text: '설치 전 ', bold: false, italic: false, underline: false, link: false },
    { text: '문서를 닫고 ', bold: true, italic: false, underline: false, link: false },
    { text: '업데이트하세요.', bold: false, italic: false, underline: false, link: true }
  ]);
  expect({ document: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()) }).toEqual(before);
  await host.comment(target!, '이 문장에만 의견을 남깁니다.');
  const after = native(editor);
  expect(await host.comment(target!, '이 문장에만 의견을 남깁니다.')).toEqual(target);
  expect(native(editor)).toEqual(after);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.document);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
  const decoded = readWordFile(wordFileText(after));
  if ('error' in decoded) throw new Error(decoded.error);
  editor.loadDocument(decoded.document, 'reopened');
  expect(host.locate(target!)).toBe('located');
  const start = editor.dataStore.getNode(editor.selection!.startNodeId);
  const end = editor.dataStore.getNode(editor.selection!.endNodeId);
  expect(start?.attributes?.objectId).toBe('original-plain');
  expect(end?.attributes?.objectId).toBe('original-link');
  host.dispose();
});

it('retires the whole captured range when an intermediate run changes, while preserving the unsubmitted opinion', async () => {
  const { editor, host, runs } = fixture();
  const target = host.capture(); expect(target?.quote).toBe(quote);
  editor.dataStore.setNode({ ...runs[1], text: '사람이 먼저 수정했습니다. ' });
  const changed = native(editor);
  expect(host.ownsCapture!(target!)).toBe(false);
  await expect(host.comment(target!, '초안을 유지합니다.')).rejects.toThrow();
  expect(native(editor)).toEqual(changed); host.dispose();
});

it('does not substitute the equal quote after one stored coverage part is removed', async () => {
  const { editor, host, runs } = fixture();
  const target = host.capture(); expect(target?.quote).toBe(quote);
  await host.comment(target!, '원래 문장만 대상입니다.');
  const middle = editor.dataStore.getNode(runs[1].sid!)!;
  editor.dataStore.setNode({ ...middle, marks: middle.marks?.filter(mark => mark.stype !== 'commentRef') });
  const before = native(editor), selection = structuredClone(editor.selection);
  expect(host.locate(target!)).toBe('missing');
  expect(native(editor)).toEqual(before); expect(editor.selection).toEqual(selection); host.dispose();
});

async function wired() {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const original = fixture(); original.host.dispose();
  const surface = document.createElement('div'); document.body.append(surface); surfaces.push(surface);
  const runtime = mountWordRuntime(surface, { initialDocument: original.editor.exportDocument(), editable: true }); runtimes.push(runtime);
  const editor = runtime.editor;
  const runs = [...editor.dataStore.getNodes().values()].filter(node => String(node.attributes?.objectId).startsWith('original-'));
  editor.setRange({ type: 'range', collapsed: false, startNodeId: runs[0].sid!, startOffset: 0, endNodeId: runs[2].sid!, endOffset: runs[2].text!.length });
  const host = createWordFeedbackHost({ editor, id: () => 'canonical-document', canComment: () => true,
    captureSelection: () => editor.selection,
    captureCommentIntent: () => runtime.captureInputIntent({ command: 'insertComment', selection: 'gesture' }) });
  return { editor, host, surface };
}
it('permits the owned native comment command while refusing unfinished native composition', async () => {
  const { editor, host, surface } = await wired();
  surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const before = native(editor); expect(host.capture()).toBeNull(); expect(native(editor)).toEqual(before);
  surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  const target = host.capture(); expect(target?.quote).toBe(quote);
  await expect(host.comment(target!, 'One owned native command')).resolves.toEqual(target); host.dispose();
});
it('retires a native navigation gesture even before the debounced model range changes', async () => {
  const { editor, host, surface } = await wired();
  const target = host.capture(); expect(target?.quote).toBe(quote);
  const before = native(editor), selection = structuredClone(editor.selection);
  surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(editor.selection).toEqual(selection); expect(host.ownsCapture!(target!)).toBe(false);
  await expect(host.comment(target!, 'Retained draft')).rejects.toThrow(); expect(native(editor)).toEqual(before); host.dispose();
});
