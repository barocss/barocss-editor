import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@barocss/editor-core';
import { DatabaseItemBody } from '../src/database-item-body';
import { getNoteDatabaseItemBody } from '../src/database';
import { openNoteTree, type NoteSession } from '../src/session';
let session: NoteSession, root: Root, nodeId: string, child: Editor, flush: () => Promise<boolean>;
let registration: (() => Promise<boolean>) | undefined;
const unregister = vi.fn();
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  session = openNoteTree({ stype: 'note', content: [{ stype: 'noteDatabase', attributes: { source: 'tasks' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: '이름', kind: 'text' }], rowIds: ['item-1'], records: [{ 이름: '업무' }] } }] }] });
  nodeId = session.editor.dataStore.getNode(session.rootId)!.content![0] as string;
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(DatabaseItemBody, { editor: session.editor, nodeId, row: 0,
    registerBeforeNavigate: callback => { registration = callback; return unregister; },
    renderEditor: (editor, _rootId, beforeNavigate) => { child = editor; flush = beforeNavigate; return createElement('div', { 'data-child': 'true' }); }
  })));
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); vi.restoreAllMocks(); document.body.replaceChildren(); unregister.mockClear(); registration = undefined; });
async function writeChild(text: string) {
  const para = child.dataStore.getNode(child.dataStore.getNode(child.getRootId()!)!.content![0] as string)!;
  const run = para.content![0] as string;
  child.selectionManager.setSelection({ type: 'range', startNodeId: run, endNodeId: run, startOffset: 0, endOffset: 0, collapsed: true });
  await act(async () => { await child.executeCommand('replaceText', { range: child.selection, text }); });
}
it('awaits the final item body transaction before allowing navigation', async () => {
  await writeChild('이동 직전 마지막 입력');
  const original = session.editor.executeCommand.bind(session.editor);
  let release!: () => void;
  vi.spyOn(session.editor, 'executeCommand').mockImplementation((name, payload) => name === 'setNoteDatabaseItemBody' ? new Promise(resolve => { release = () => { void original(name, payload).then(resolve); }; }) : original(name, payload));
  let completed = false;
  let pending!: Promise<boolean>;
  await act(async () => { pending = flush().then(ok => { completed = true; return ok; }); await Promise.resolve(); });
  expect(completed).toBe(false); expect(registration).toBeDefined();
  await act(async () => { release(); expect(await pending).toBe(true); });
  expect(JSON.stringify(getNoteDatabaseItemBody(session.editor, nodeId, 0))).toContain('이동 직전 마지막 입력');
});
it('keeps navigation blocked when the final body write is rejected', async () => {
  await writeChild('저장되지 않은 입력');
  const original = session.editor.executeCommand.bind(session.editor);
  vi.spyOn(session.editor, 'executeCommand').mockImplementation((name, payload) => name === 'setNoteDatabaseItemBody' ? Promise.resolve(false) : original(name, payload));
  let result = true;
  await act(async () => { result = await registration!(); });
  expect(result).toBe(false); expect(document.querySelector('[role="alert"]')?.textContent).toContain('저장하지 못했습니다');
});
