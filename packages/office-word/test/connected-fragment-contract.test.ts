import { describe, expect, it, vi } from 'vitest';
import { createWordEditor, readWordFile, wordFileText } from '@barocss/office-word';
import { FragmentEditor, registerPreCommitGuard, type EditingPlan } from '@barocss/model';
import { createParagraphProposalSample, PARAGRAPH_PROPOSAL_SAMPLE } from '../../../apps/word/src/paragraph-proposal-sample';

import { EditorViewDOM } from '@barocss/editor-view-dom';
import { mountWordRuntime } from '../../../apps/word/src/runtime';

const replacement = '앱이 켜져 있으면 작업을 저장하고 앱을 종료한 뒤 설치합니다.';

async function fixture(comment: boolean) {
  const seed = createWordEditor();
  seed.loadDocument(createParagraphProposalSample(), 'fictional-source439');
  const source = seed.exportDocument(); seed.destroy();
  const render = vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true,
    author: { name: 'Fictional local reviewer', date: () => '2026-10-03' } });
  const editor = runtime.editor;
  expect(editor.documentFaults).toEqual([]);
  const surface = editor.dataStore.getNode(String(editor.dataStore.getNode(editor.getRootId()!)!.content![0]))!;
  const paragraph = editor.dataStore.getNode(String(surface.content![1]))!;
  const id = String(paragraph.content![0]);
  const range = { type: 'range' as const, startNodeId: id, endNodeId: id, startOffset: 0,
    endOffset: PARAGRAPH_PROPOSAL_SAMPLE.original.length, collapsed: false };
  editor.updateSelection(range);
  if (comment) expect(await editor.run('insertComment', { id: 'fictional-439-thread', text: '앱이 켜져 있을 때의 조치도 안내해주세요.' })).toBe(true);
  const editing = FragmentEditor.forEditor(editor);
  const native = () => wordFileText(runtime.exportNativeDocument(), '');
  const supplied = () => {
    const input = structuredClone(editing.plainText(replacement, id, true));
    if (comment) input.content[0].marks = [{ stype: 'commentRef', attrs: { id: 'fictional-439-thread' }, range: [0, replacement.length] }];
    return input;
  };
  const plan = (): EditingPlan => {
    const decision = editing.plan({ intent: 'copy', fragment: supplied(), target: { kind: 'text', nodeId: id, from: 0, to: range.endOffset } });
    expect(decision.ok, decision.ok ? '' : decision.reason).toBe(true);
    if (!decision.ok) throw new Error(decision.reason);
    expect(decision.plan.losses).toEqual([]);
    return decision.plan;
  };
  return { editor, runtime, editing, native, plan, id, paragraphId: paragraph.sid!, range,
    dispose: () => { runtime.dispose(); host.remove(); render.mockRestore(); } };
}

describe('supplied result through the existing native fragment transaction', () => {
  it.each([false, true])('preserves the exact complete native document and run identity through Undo/Redo (comment=%s)', async comment => {
    const f = await fixture(comment);
    try {
      const before = f.native(), original = JSON.parse(before).document;
      const expected = structuredClone(original);
      // Expected bytes come only from the pre-call native original and the declared delta.
      expected.content[0].content[1].content[0].text = replacement;
      if (comment) expected.content[0].content[1].content[0].marks = [
        { stype: 'commentRef', attrs: { id: 'fictional-439-thread' }, range: [0, replacement.length] }
      ];
      else expect(expected.content[0].content[1].content[0]).not.toHaveProperty('marks');
      const expectedBytes = wordFileText(expected, '');
      const selection = structuredClone(f.editor.selection), history = f.editor.historyManager.getHistory().length;
      const plan = f.plan();
      expect(f.native()).toBe(before); expect(f.editor.selection).toEqual(selection);
      expect(f.editor.historyManager.getHistory()).toHaveLength(history);
      expect(await f.editing.apply(plan)).toMatchObject({ success: true, committed: true });
      expect(f.native()).toBe(expectedBytes);
      expect(f.editor.dataStore.getNode(f.paragraphId)?.content).toEqual([f.id]);
      expect(f.editor.dataStore.getNode(f.id)?.text).toBe(replacement);
      expect(f.editor.historyManager.getHistory()).toHaveLength(history + 1);
      for (let repeat = 0; repeat < 3; repeat++) {
        expect(await f.editor.undo()).toBe(true); expect(f.native()).toBe(before);
        expect(f.editor.selection).toEqual(selection);
        expect(f.editor.dataStore.getNode(f.paragraphId)?.content).toEqual([f.id]);
        expect(await f.editor.redo()).toBe(true); expect(f.native()).toBe(expectedBytes);
        expect(f.editor.dataStore.getNode(f.paragraphId)?.content).toEqual([f.id]);
      }
      const reopened = readWordFile(expectedBytes);
      if ('error' in reopened) throw new Error(reopened.error);
      f.runtime.loadNativeDocument(reopened.document);
      expect(f.editor.documentFaults).toEqual([]); expect(f.native()).toBe(expectedBytes);
    } finally { f.dispose(); }
  });

  it.each(['selection', 'content', 'policy', 'read-only', 'document'] as const)('refuses a stale %s basis without an accepted document or history change', async kind => {
    const f = await fixture(true);
    try {
      const plan = f.plan();
      if (kind === 'selection') f.editor.updateSelection({ ...f.range, startOffset: 1 });
      if (kind === 'content') await f.editor.run('replaceText', { range: f.range, text: '사용자 변경' });
      if (kind === 'policy') f.editing.configure({});
      if (kind === 'read-only') f.editor.setEditable(false);
      if (kind === 'document') f.runtime.loadNativeDocument(createParagraphProposalSample());
      const before = f.native(), selection = structuredClone(f.editor.selection), history = f.editor.historyManager.getHistory().length;
      expect(await f.editing.apply(plan)).toMatchObject({ success: false, committed: false });
      expect(f.native()).toBe(before); expect(f.editor.selection).toEqual(selection);
      expect(f.editor.historyManager.getHistory()).toHaveLength(history);
    } finally { f.dispose(); }
  });
  it.each(['unknown-mark', 'resource-transport', 'invalid-range'] as const)('rejects an unsupported supplied %s before native mutation', async kind => {
    const f = await fixture(true);
    try {
      const fragment = structuredClone(f.editing.plainText(replacement, f.id, true));
      if (kind === 'unknown-mark') fragment.content[0].marks = [{ stype: 'unregistered-model-mark' }];
      if (kind === 'resource-transport') fragment.resources = [{ id: 'invented-resource', type: 'external', data: {} }];
      const before = f.native(), selection = structuredClone(f.editor.selection), history = f.editor.historyManager.getHistory().length;
      const decision = f.editing.plan({ intent: 'copy', fragment,
        target: { kind: 'text', nodeId: f.id, from: 0, to: f.range.endOffset + (kind === 'invalid-range' ? 1 : 0) } });
      expect(decision.ok).toBe(false);
      expect(f.native()).toBe(before); expect(f.editor.selection).toEqual(selection);
      expect(f.editor.historyManager.getHistory()).toHaveLength(history);
    } finally { f.dispose(); }
  });

  it.each(['queued-lock', 'awaited-authority'] as const)('refuses account A to B to A during %s with the existing per-intent guard', async boundary => {
    const f = await fixture(true);
    let off = () => {};
    let lock: string | undefined;
    try {
      const plan = f.plan(), before = f.native(), selection = structuredClone(f.editor.selection);
      const history = f.editor.historyManager.getHistory().length;
      let actor = 'A', generation = 0;
      const captured = generation;
      let entered!: () => void, finish!: () => void;
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { finish = resolve; });
      if (boundary === 'queued-lock') lock = await f.editor.dataStore.acquireLock('fictional-439-queued-work');
      else off = registerPreCommitGuard(f.editor, async () => { entered(); await gate; });
      const pending = f.editing.apply(plan, { validateIntent: () =>
        actor === 'A' && generation === captured ? undefined : 'The captured authority changed' });
      if (boundary === 'awaited-authority') await waiting;
      actor = 'B'; generation++;
      actor = 'A'; generation++;
      if (lock) { f.editor.dataStore.releaseLock(lock); lock = undefined; }
      else finish();
      expect(await pending).toMatchObject({ success: false, committed: false, errors: ['The captured authority changed'] });
      expect(f.native()).toBe(before); expect(f.editor.selection).toEqual(selection);
      expect(f.editor.historyManager.getHistory()).toHaveLength(history);
    } finally { if (lock) f.editor.dataStore.releaseLock(lock); off(); f.dispose(); }
  });
});
