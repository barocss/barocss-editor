import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { readWordFile, wordFileText } from '../src/index';
import { mountWordRuntime, type WordRuntime } from '../../../apps/word/src/runtime';

let runtime: WordRuntime | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { runtime?.dispose(); runtime = undefined; host?.remove(); vi.restoreAllMocks(); });

// Exact retained #432 authenticated failure fixture; only rendering is mocked.
// Actual pointer/keyboard and API/PostgreSQL acceptance is verified separately.
for (const [name, text, length] of [
  ['omitted-marks', 'This paragraph takes its font from ', 25],
  ['existing-code-mark', 'Normal', 6]
] as const) it(`restores the exact retained native Word document after underline replay (${name})`, async () => {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const source = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/native-mark-undo.word.json'), 'utf8'));
  const file = readWordFile(wordFileText(source, '2026-10-01T00:00:00.000Z'));
  if ('error' in file) throw new Error(file.error);
  host = document.createElement('div'); document.body.append(host);
  runtime = mountWordRuntime(host, { initialDocument: file.document, editable: true });
  const before = runtime.exportNativeDocument();
  expect(before).toEqual(source);
  const expected = structuredClone(before) as Record<string, unknown>;
  const ids: string[] = [];
  const visit = (id: string) => {
    const node = runtime!.editor.dataStore.getNode(id)!;
    if (node.text === text) ids.push(id);
    for (const child of node.content ?? []) visit(String(child));
  };
  visit(runtime.editor.getRootId()!); expect(ids).toHaveLength(1);
  runtime.editor.updateSelection({ type: 'range', startNodeId: ids[0], endNodeId: ids[0], startOffset: 0, endOffset: length, collapsed: false });
  const selection = structuredClone(runtime.editor.selection);
  let matches = 0;
  const setExpected = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.text === text) { node.marks = [...(node.marks as unknown[] ?? []), { stype: 'underline', range: [0, length] }]; matches++; }
    for (const child of node.content as unknown[] ?? []) setExpected(child);
  };
  setExpected(expected); expect(matches).toBe(1);
  expect(await runtime.editor.run('toggleUnderline')).toBe(true);
  expect(runtime.exportNativeDocument()).toEqual(expected);
  expect(runtime.editor.selection).toEqual(selection);
  expect(await runtime.editor.undo()).toBe(true);
  expect(runtime.exportNativeDocument()).toEqual(before);
  expect(runtime.editor.selection).toEqual(selection);
  for (let repeat = 0; repeat < 3; repeat++) {
    expect(await runtime.editor.redo()).toBe(true);
    expect(runtime.exportNativeDocument()).toEqual(expected);
    expect(await runtime.editor.undo()).toBe(true);
    expect(runtime.exportNativeDocument()).toEqual(before);
    expect(runtime.editor.selection).toEqual(selection);
  }
  const reopened = readWordFile(wordFileText(runtime.exportNativeDocument(), '2026-10-01T00:00:00.000Z'));
  if ('error' in reopened) throw new Error(reopened.error);
  expect(reopened.document).toEqual(source);
});
