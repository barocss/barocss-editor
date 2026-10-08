import { describe, expect, it } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';

const raw = (value: unknown) => JSON.stringify(value);

/** Controlled native primitive baseline. The authenticated Office reader is a separate dependency. */
describe('separate readonly native2 stage before an authenticated consumer', () => {
  it('keeps an operated root and the last nested input in the mounted source while A2 and B are staged and closed', async () => {
    const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original authority' }] }] });
    const source = openNoteNativeSnapshot(createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_A)), { authority: authority.editor, after: 60000 });
    const staged: Array<ReturnType<typeof openNoteNativeSnapshot>> = [];
    let child: ReturnType<typeof source.openChildResource> | undefined;
    try {
      const heading = [...source.editor.dataStore.getNodes().values()].find(node => node.text === '목표 A');
      if (!heading?.sid) throw new Error('Original source heading SID required');
      const rootRange = { type: 'range' as const, startNodeId: heading.sid, endNodeId: heading.sid,
        startOffset: 4, endOffset: 4, collapsed: true };
      expect(await source.editor.executeCommand('replaceText', { range: rootRange, text: ' • 마지막 원본 입력' })).toBe(true);

      const resource = [...source.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText');
      if (!resource?.sid) throw new Error('Original nested resource SID required');
      child = source.openChildResource(resource.sid);
      const nested = [...child.editor.dataStore.getNodes().values()].find(node => node.text === '항목 본문 A');
      if (!nested?.sid) throw new Error('Original nested text SID required');
      const nestedRange = { type: 'range' as const, startNodeId: nested.sid, endNodeId: nested.sid,
        startOffset: 7, endOffset: 7, collapsed: true };
      expect(await child.editor.executeCommand('replaceText', { range: nestedRange, text: ' / 마지막 중첩 입력' })).toBe(true);
      expect(await source.commitChildResource(resource.sid, child)).toBe(true);

      const sourceModel = source.editor.exportDocument();
      const sourceNative = source.exportNativeDocument();
      const sourceRaw = source.exportSnapshot();
      const sourceSelection = source.editor.selection;
      const sourceHistory = source.editor.historyManager;
      const entries = sourceHistory.getHistory().map(entry => ({ entry, operations: entry.operations,
        inverse: entry.inverseOperations, forwardRefs: [...entry.operations], inverseRefs: [...entry.inverseOperations] }));
      const historyIndex = sourceHistory.getCurrentIndex();
      const sourceRoot = source.rootId, sourceSession = source.session;
      const sourceEpoch = source.editor.dataStore.getDocumentEpoch();
      expect(entries.length).toBeGreaterThan(0);
      expect(sourceRaw).toContain('마지막 원본 입력');
      expect(sourceRaw).toContain('마지막 중첩 입력');

      for (const original of [NATIVE_NOTE_FIXTURES.TARGET_A2, NATIVE_NOTE_FIXTURES.SOURCE_B]) {
        const text = raw(original);
        const one = openNoteNativeSnapshot(createNoteNative2Context(text));
        staged.push(one);
        expect(one.editor.isEditable).toBe(false);
        expect(one.exportSnapshot()).toBe(text);
        expect(one.exportNativeDocument()).toEqual(original.document);
        expect(one.context.schemaBundle).toEqual(original.schemaBundle);
        expect(one.editor.getHistoryStats()).toEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
        expect(one.rootId).not.toBe(sourceRoot);
        expect(one.session).not.toBe(sourceSession);
      }

      for (const one of staged.splice(0).reverse()) one.close();
      expect(source.editor.isEditable).toBe(true);
      expect(source.rootId).toBe(sourceRoot);
      expect(source.session).toBe(sourceSession);
      expect(source.editor.dataStore.getDocumentEpoch()).toBe(sourceEpoch);
      expect(source.editor.exportDocument()).toEqual(sourceModel);
      expect(source.exportNativeDocument()).toEqual(sourceNative);
      expect(source.exportSnapshot()).toBe(sourceRaw);
      expect(source.editor.selection).toEqual(sourceSelection);
      expect(source.editor.historyManager).toBe(sourceHistory);
      expect(sourceHistory.getCurrentIndex()).toBe(historyIndex);
      for (const [index, before] of entries.entries()) {
        const after = sourceHistory.getHistory()[index];
        expect(after).toBe(before.entry);
        expect(after.operations).toBe(before.operations);
        expect(after.inverseOperations).toBe(before.inverse);
        expect(after.operations).toEqual(before.forwardRefs);
        expect(after.inverseOperations).toEqual(before.inverseRefs);
      }
    } finally {
      for (const one of staged.splice(0).reverse()) one.close();
      child?.close();
      source.close();
      authority.close();
    }
  });
});
