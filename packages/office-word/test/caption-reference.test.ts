import { describe, expect, it } from 'vitest';
import { createFieldResolver, walkBlocks } from '@barocss/office-text';
import { transaction } from '@barocss/model';
import { strFromU8, unzipSync } from 'fflate';
import { createWordEditor } from '../src/word-kit';
import { bookmarkSelection, captureBookmarkSession, wordCaptions } from '../src/bookmark-commands';
import { exportWordDocx } from '../src/word-docx';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '그림 ' }, { stype: 'fieldSeq', attributes: { sequence: 'Figure' } }, { stype: 'inline-text', text: ': 결과' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'BeforeAfter', marks: [] }] }
  ] }] } as never);
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const text = [...walkBlocks(doc, doc.getNode(doc.rootId))].find(n => n.text === 'BeforeAfter')!;
  editor.updateSelection({ type: 'range', startNodeId: text.sid!, endNodeId: text.sid!, startOffset: 6, endOffset: 6, collapsed: true });
  const payload = { ...captureBookmarkSession(editor)!, targetKind: 'caption', targetSid: wordCaptions(editor)[0].sid, format: 'labelNumber' };
  return { editor, doc, payload, text };
}

describe('caption references', () => {
  it('inserts at the caret, assigns an identity in one undo and keeps it through native reload', async () => {
    const { editor, doc, payload, text } = setup();
    const before = editor.exportDocument(doc.rootId);
    expect(await editor.run('insertWordReference', payload)).toBe(true);
    const nodes = [...walkBlocks(doc, doc.getNode(doc.rootId))];
    const ref = nodes.find(n => n.stype === 'fieldRef')!;
    const id = String(ref.attributes!.targetId);
    expect(id).toBe(wordCaptions(editor)[0].targetId);
    const parts = doc.getNode(text.parentId!)!.content!.map(sid => doc.getNode(String(sid))!);
    expect(parts.map(n => n.text ?? n.stype)).toEqual(['Before', 'fieldRef', 'After']);
    const fields = createFieldResolver(doc);
    expect(fields.reference(id, 'labelNumber', ref.sid, 'caption')).toBe('그림 1');
    expect(fields.reference(id, 'number', ref.sid, 'caption')).toBe('1');
    expect(fields.reference(id, 'text', ref.sid, 'caption')).toBe('그림 1: 결과');
    expect(bookmarkSelection(editor, id, 'caption')).toBeDefined();
    const saved = editor.exportDocument(doc.rootId);
    await editor.run('undo'); expect(editor.exportDocument(doc.rootId)).toEqual(before);
    await editor.run('redo'); expect(wordCaptions(editor)[0].targetId).toBe(id);
    editor.loadDocument(saved);
    expect(wordCaptions(editor)[0].targetId).toBe(id);
    expect(createFieldResolver({ ...doc, rootId: editor.getRootId()! }).reference(id, 'text', undefined, 'caption')).toBe('그림 1: 결과');
    editor.destroy();
  });

  it('renumbers without retargeting and reports a deleted or ambiguous caption', async () => {
    const { editor, doc, payload } = setup();
    await editor.run('insertWordReference', payload);
    const caption = wordCaptions(editor)[0], block = doc.getNode(caption.blockId)!;
    const rootId = editor.getRootId()!, surfaceId = block.parentId!;
    await editor.run('insertWordCaption', { rootId, surfaceId, blockId: block.sid, sequence: 'Figure', position: 'before', text: '앞쪽' });
    const value = () => createFieldResolver(doc).reference(caption.targetId!, 'labelNumber', undefined, 'caption');
    expect(value()).toBe('그림 2');
    await transaction(editor, [{ type: 'removeChild', payload: { parentId: surfaceId, childId: block.sid } }] as never).commit();
    expect(value()).toBeUndefined(); expect(bookmarkSelection(editor, caption.targetId!, 'caption')).toBeUndefined();
    await editor.run('undo'); expect(value()).toBe('그림 2');
    const other = wordCaptions(editor).find(c => c.sid !== caption.sid)!;
    await transaction(editor, [{ type: 'setAttrs', payload: { nodeId: other.sid, attrs: { id: caption.targetId } } }] as never).commit();
    expect(value()).toBeUndefined(); expect(bookmarkSelection(editor, caption.targetId!, 'caption')).toBeUndefined();
    editor.destroy();
  });

  it('rejects selection replacement, stale targets, unsupported formats, tracking and locked input', async () => {
    const { editor, payload, text } = setup();
    expect(await editor.run('insertWordReference', { ...payload, rootId: 'old' })).toBe(false);
    expect(await editor.run('insertWordReference', { ...payload, targetSid: 'deleted' })).toBe(false);
    expect(await editor.run('insertWordReference', { ...payload, format: 'pageNumber' })).toBe(false);
    expect(await editor.run('insertWordReference', { ...payload, selection: { ...payload.selection, endOffset: 9, collapsed: false } })).toBe(false);
    editor.setEditable(false); expect(await editor.run('insertWordReference', payload)).toBe(false);
    editor.setEditable(true); await editor.run('toggleTrackChanges');
    expect(await editor.run('insertWordReference', payload)).toBe(false);
    await editor.run('toggleTrackChanges');
    await transaction(editor, [{ type: 'setAttrs', payload: { nodeId: text.parentId, attrs: { locked: true } } }] as never).commit();
    expect(await editor.run('insertWordReference', payload)).toBe(false);
    editor.destroy();
  });

  it('does not export a caption target as an unrelated DOCX bookmark REF', async () => {
    const { editor, payload } = setup(); await editor.run('insertWordReference', payload);
    const file = exportWordDocx(editor.exportDocument(editor.getRootId()!));
    const xml = strFromU8(unzipSync(file.bytes)['word/document.xml']);
    expect(xml).not.toContain(' REF caption_');
    expect(file.warnings.some(w => w.includes('상호 참조'))).toBe(true);
    editor.destroy();
  });
});
