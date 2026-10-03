// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { createWordEditor } from '../../../office-word/src/word-kit';
import { transaction } from '../../src/transaction-dsl';
import '../../src/operations/register-operations';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));

function fixture() {
  const editor = createWordEditor();
  editors.push(editor);
  editor.loadDocument({ stype: 'document', metadata: {
    title: 'Fictional requirement review',
    resources: { namedStyle: { fontSize: 31, fontFamily: 'serif' }, image: { src: 'data:image/png;base64,AA==' } },
    originalExtension: { retained: ['rich', { value: 7 }] },
  }, content: [{ stype: 'surface', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'Keep the approved requirement.', marks: [{ stype: 'bold', range: [0, 4] }] },
  ] }] }] });
  return editor;
}

const write = (editor: Editor, nodeId: string, metadata: Record<string, unknown> | undefined) =>
  transaction(editor, [{ type: 'update', payload: { nodeId, data: { metadata } } }]).commit();

describe('native Word node metadata transaction history', () => {
  it('authors metadata and its next version while retaining the complete rich document through undo and redo', async () => {
    const editor = fixture();
    const rootId = editor.getRootId()!;
    const before = structuredClone(editor.exportDocument());
    const v1 = { ...before.metadata, businessPair: {
      requirement: { id: 'req-opaque', version: 1, supportedBy: { id: 'dec-opaque', version: 1 } },
      decision: { id: 'dec-opaque', version: 1, text: 'Preserve native editing.' },
    } };
    const expectedV1 = { ...before, metadata: v1 };

    expect(await write(editor, rootId, v1)).toMatchObject({ success: true, committed: true });
    expect(editor.exportDocument()).toStrictEqual(expectedV1);
    const v2 = { ...v1, businessPair: { ...v1.businessPair,
      decision: { ...v1.businessPair.decision, version: 2, text: 'Preserve native editing and history.' },
    } };
    const expectedV2 = { ...before, metadata: v2 };
    expect(await write(editor, rootId, v2)).toMatchObject({ success: true, committed: true });
    expect(editor.exportDocument()).toStrictEqual(expectedV2);
    expect(editor.getHistoryStats().totalEntries).toBe(2);
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toStrictEqual(expectedV1);
    expect(await editor.undo()).toBe(true);
    expect(editor.exportDocument()).toStrictEqual(before);
    expect(await editor.redo()).toBe(true);
    expect(editor.exportDocument()).toStrictEqual(expectedV1);
    expect(await editor.redo()).toBe(true);
    expect(editor.exportDocument()).toStrictEqual(expectedV2);
    // The caller's proposal is not modified by transaction/history replay.
    expect(v1.businessPair.decision.version).toBe(1);
    expect(v2.businessPair.requirement.supportedBy.version).toBe(1);
  });

  it('removes existing metadata and restores it exactly through undo and redo', async () => {
    const editor = fixture();
    const paragraph = editor.dataStore.getAllNodes().find(node => node.stype === 'paragraph')!;
    const originalMetadata = structuredClone(paragraph.metadata);
    expect(originalMetadata).toBeDefined();
    const before = structuredClone(editor.exportDocument());
    expect(await write(editor, paragraph.sid!, undefined)).toMatchObject({ success: true, committed: true });
    expect(editor.dataStore.getNode(paragraph.sid!)?.metadata).toBeUndefined();
    const after = structuredClone(editor.exportDocument());
    expect(await editor.undo()).toBe(true);
    expect(editor.dataStore.getNode(paragraph.sid!)?.metadata).toEqual(originalMetadata);
    expect(editor.exportDocument()).toStrictEqual(before);
    expect(await editor.redo()).toBe(true);
    expect(editor.exportDocument()).toStrictEqual(after);
  });
});
