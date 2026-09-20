import { describe, expect, it } from 'vitest';
import { Editor } from '../src/editor';
import { FragmentEditor, defineEditingRule } from '@barocss/model';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';

function fixture() {
  const editor = new Editor({ schema: createSchema('fragment-integration', getStandardSchemaDefinition()) });
  editor.loadDocument({ stype: 'document', content: [
    { sid: 'source', stype: 'paragraph', content: [{ sid: 's', stype: 'inline-text', text: 'source' }] },
    { sid: 'target', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'target' }] }
  ] });
  editor.updateSelection({ type: 'range', collapsed: true, startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2 });
  return { editor, editing: new FragmentEditor(editor) };
}
function snapshot(editor: Editor) {
  return structuredClone(editor.dataStore.getAllNodes().sort((a, b) => a.sid!.localeCompare(b.sid!)));
}

describe('fragment policies in an actual editor', () => {
  it('restores document, IDs and selection through editor undo/redo after policy replacement', async () => {
    const { editor, editing } = fixture();
    const rule = defineEditingRule({
      id: 'paragraph.open-content',
      match: { sourceType: 'paragraph', targetType: 'paragraph', boundary: 'open', attributes: 'equal' },
      effect: 'join-inline', reason: 'Join compatible paragraph content',
    });
    editing.configure({ rules: [rule] });
    const before = snapshot(editor), selection = structuredClone(editor.selection);
    const decision = editing.plan({ intent: 'copy', fragment: editing.captureText('s', 0, 6), target: { kind: 'text', nodeId: 't', from: 2, to: 2 } });
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error(decision.reason);
    expect(decision.plan.trace).toMatchObject([{ ruleIds: ['paragraph.open-content'], effect: 'join-inline' }]);
    expect((await editing.apply(decision.plan)).success).toBe(true);
    const after = snapshot(editor), afterSelection = structuredClone(editor.selection);
    editing.configure({ rules: [defineEditingRule({ ...rule, effect: 'reject', reason: 'New edits are refused by product policy' })] });
    expect(await editor.undo()).toBe(true);
    expect(snapshot(editor)).toEqual(before);
    expect(editor.selection).toEqual(selection);
    expect(await editor.redo()).toBe(true);
    expect(snapshot(editor)).toEqual(after);
    expect(editor.selection).toEqual(afterSelection);
    expect(editor.getHistoryStats().totalEntries).toBe(1);
    editor.destroy();
  });
  it('rejects a plan after loadDocument even when IDs and text are reused', async () => {
    const { editor, editing } = fixture();
    const decision = editing.plan({ intent: 'copy', fragment: editing.captureNodes(['source']), target: { kind: 'text', nodeId: 't', from: 2, to: 2 } });
    if (!decision.ok) throw new Error(decision.reason);
    editor.loadDocument({ stype: 'document', content: [
      { sid: 'source', stype: 'paragraph', content: [{ sid: 's', stype: 'inline-text', text: 'source' }] },
      { sid: 'target', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'target' }] }
    ] });
    const before = snapshot(editor);
    expect((await editing.apply(decision.plan)).success).toBe(false);
    expect(snapshot(editor)).toEqual(before);
    editor.destroy();
  });
});
