import { createSchema } from '@barocss/schema';
import { describe, expect, it } from 'vitest';
import { createWordEditor, wordFileText, getWordSchemaDefinition } from '@barocss/office-word';
import { createParagraphProposalPreview } from '@barocss/office-editor-ui';
import { createParagraphProposalSample, PARAGRAPH_PROPOSAL_SAMPLE } from '../src/paragraph-proposal-sample';

function setup() {
  const editor = createWordEditor({ schema: createSchema('word', getWordSchemaDefinition()) });
  editor.loadDocument(createParagraphProposalSample(), 'proposal420');
  expect(editor.documentFaults).toEqual([]);
  const surface = editor.dataStore.getNode(String(editor.dataStore.getNode(editor.getRootId()!)!.content![0]))!;
  const paragraph = editor.dataStore.getNode(String(surface.content![1]))!;
  const id = String(paragraph.content![0]);
  const range = { type: 'range' as const, startNodeId: id, endNodeId: id, startOffset: 0,
    endOffset: PARAGRAPH_PROPOSAL_SAMPLE.original.length, collapsed: false };
  editor.updateSelection(range);
  const preview = createParagraphProposalPreview(editor);
  const native = () => wordFileText(editor.exportDocument(), '');
  return { editor, preview, range, native, dispose: () => { preview.dispose(); editor.destroy(); } };
}

describe('fixed paragraph preview safety', () => {
  it('preview, rejection and repeated unavailable apply preserve exact native content and selection', () => {
    const { editor, preview, range, native, dispose } = setup();
    try {
      const before = native(), selection = structuredClone(editor.selection);
      expect(preview.make(range, () => true)).toBe(true);
      expect(preview.preview?.original).toBe(PARAGRAPH_PROPOSAL_SAMPLE.original);
      expect(preview.preview?.before).toBe(PARAGRAPH_PROPOSAL_SAMPLE.before);
      expect(preview.preview?.after).toBe(PARAGRAPH_PROPOSAL_SAMPLE.after);
      expect(native()).toBe(before); expect(editor.selection).toEqual(selection);
      expect(preview.apply()).toBe(false); expect(preview.apply()).toBe(false);
      preview.reject(); expect(preview.state).toBe('rejected');
      expect(native()).toBe(before); expect(editor.selection).toEqual(selection);
    } finally { dispose(); }
  });

  it('selection A to B to A and clear retire old previews permanently', () => {
    const { editor, preview, range, native, dispose } = setup();
    try {
      const before = native(); preview.make(range, () => true);
      editor.updateSelection({ ...range, startOffset: 1 }); editor.updateSelection(range);
      expect(preview.state).toBe('stale'); expect(preview.apply()).toBe(false);
      expect(native()).toBe(before);
      preview.make(range, () => true); editor.updateSelection(null);
      expect(preview.state).toBe('stale'); expect(native()).toBe(before);
    } finally { dispose(); }
  });

  it('refuses foreign ownership, read-only and multi-paragraph ranges without mutation', () => {
    const { editor, preview, range, native, dispose } = setup();
    try {
      const before = native();
      expect(preview.make(range, () => false)).toBe(false);
      editor.setEditable(false); expect(preview.make(range, () => true)).toBe(false);
      editor.setEditable(true);
      const cross = { ...range, endNodeId: editor.getRootId()! };
      editor.updateSelection(cross); expect(preview.make(cross, () => true)).toBe(false);
      expect(preview.apply()).toBe(false); expect(native()).toBe(before);
    } finally { dispose(); }
  });

  it('retires queued actions, document/session replacement and disposal without applying to a later target', async () => {
    const { editor, preview, range, native, dispose } = setup();
    try {
      const before = native();
      const queued = preview.queue(range, () => true);
      editor.updateSelection({ ...range, startOffset: 1 }); editor.updateSelection(range);
      expect(await queued).toBe(false); expect(native()).toBe(before);
      preview.make(range, () => true);
      editor.loadDocument(createParagraphProposalSample(), 'session-B');
      editor.loadDocument(createParagraphProposalSample(), 'proposal420');
      expect(editor.documentFaults).toEqual([]);
      expect(preview.state).toBe('stale'); expect(preview.apply()).toBe(false);
      const replaced = native(); preview.dispose();
      expect(await preview.queue(range, () => true)).toBe(false); expect(native()).toBe(replaced);
    } finally { dispose(); }
  });

  it('content change and undo cannot revive the old proposal', async () => {
    const { editor, preview, range, native, dispose } = setup();
    try {
      preview.make(range, () => true);
      await editor.executeCommand('replaceText', { range, text: '가상 변경' });
      expect(preview.state).toBe('stale');
      await editor.executeCommand('undo');
      const undone = native(); expect(preview.state).toBe('stale');
      expect(preview.apply()).toBe(false); expect(native()).toBe(undone);
    } finally { dispose(); }
  });

  it('retains omitted marks and records the concrete existing native undo limitation', async () => {
    const { editor, range, native, dispose } = setup();
    try {
      const before = JSON.parse(native());
      const neighbors = [before.document.content[0].content[0], before.document.content[0].content[2], before.document.content[0].content[3]];
      expect(before.document.content[0].content[1].content[0]).not.toHaveProperty('marks');
      expect(await editor.executeCommand('replaceText', { range, text: PARAGRAPH_PROPOSAL_SAMPLE.proposal })).toBe(true);
      expect(await editor.executeCommand('undo')).toBe(true);
      const undone = JSON.parse(native());
      expect(undone.document.content[0].content[1].content[0].text).toBe(PARAGRAPH_PROPOSAL_SAMPLE.original);
      expect(undone.document.content[0].content[1].content[0].marks).toEqual([]);
      expect(undone).not.toEqual(before);
      expect([undone.document.content[0].content[0], undone.document.content[0].content[2], undone.document.content[0].content[3]]).toEqual(neighbors);
    } finally { dispose(); }
  });
});
