import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import type { INode } from '@barocss/datastore';
import { transaction, toggleMark } from '../../src/index';
import { openNoteTree } from '../../../office-note/src/session';
import { CANVAS_NAMES } from '../../../office-controls/src/index';
import { withWordDefaults } from '../../../office-word/src/default-styles';
import { createWordEditor } from '../../../office-word/src/word-kit';
import { createSampleDocument } from '../../../office-word/src/sample-document';
import { createSlidesEditor } from '../../../office-slides/src/slides-kit';
import { createSampleDeck } from '../../../office-slides/src/sample-deck';
import { createSiteEditor } from '../../../office-site/src/site-kit';
import { createSampleSite } from '../../../office-site/src/sample-site';

const FIRST = 'First native run', SECOND = 'Second native run';
function children(node: INode): INode[] {
  return (node.content ?? []).map(child => { if (typeof child === 'string') throw new Error('Independent sample must be a whole tree'); return child; });
}
function walk(node: INode): INode[] { return [node, ...children(node).flatMap(walk)]; }
function requireInputTree(value: unknown): asserts value is INode {
  if (!value || typeof value !== 'object' || !('stype' in value) || typeof value.stype !== 'string') throw new Error('Typed whole sample node required');
  if ('text' in value && value.text !== undefined && typeof value.text !== 'string') throw new Error('Sample text must be a string');
  for (const key of ['attributes', 'metadata']) {
    const field = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (field !== undefined && (!field || typeof field !== 'object' || Array.isArray(field))) throw new Error('Sample object field required');
  }
  if ('marks' in value && value.marks !== undefined) {
    if (!Array.isArray(value.marks)) throw new Error('Sample marks must be an array');
    for (const mark of value.marks) {
      if (!mark || typeof mark !== 'object' || typeof mark.stype !== 'string') throw new Error('Typed mark required');
      if (mark.range !== undefined && (!Array.isArray(mark.range) || mark.range.length !== 2 || !mark.range.every(Number.isFinite))) throw new Error('Typed mark range required');
      if (mark.attrs !== undefined && (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs))) throw new Error('Typed mark attrs required');
    }
  }
  if ('content' in value && value.content !== undefined) {
    if (!Array.isArray(value.content)) throw new Error('Whole sample children required');
    value.content.forEach(requireInputTree);
  }
}
function sample(product: string): INode {
  const source = product === 'Word' ? withWordDefaults(createSampleDocument()) : product === 'Slides' ? createSampleDeck() : product === 'Site' ? createSampleSite()
    : { stype: 'note', content: [{ stype: 'paragraph', content: [] }] };
  requireInputTree(source);
  const paragraph = walk(source).find(node => node.stype === 'paragraph');
  if (!paragraph) throw new Error('The complete current sample must have a paragraph');
  paragraph.content = [{ stype: 'inline-text', text: FIRST }, { stype: 'inline-text', text: SECOND, marks: [] }];
  walk(source).forEach((node, index) => {
    if (Object.hasOwn(CANVAS_NAMES, String(node.stype))) node.attributes = { ...node.attributes, objectId: `native-history-object-${index}` };
  });
  walk(source).forEach(node => { if (node.content === undefined || Array.isArray(node.content) && node.content.length === 0) delete node.content; });
  return source;
}
/** Compare every authored field, preserving mark omission, order and attrs.
 * Only declared engine furniture is removed: SIDs/parent IDs/load timestamps,
 * undefined optional fields and synthesized empty attributes absent in source.
 */
function native(actual: INode, authored: INode): unknown {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    if (key === 'sid' || key === 'parentId' || value === undefined) continue;
    if (key === 'metadata' && value && typeof value === 'object') {
      const metadata = { ...value }; delete metadata.loadedAt;
      if (Object.keys(metadata).length || Object.hasOwn(authored, 'metadata')) result.metadata = metadata;
    } else if (key === 'attributes' && value && typeof value === 'object') {
      if (Object.keys(value).length || Object.hasOwn(authored, 'attributes')) result.attributes = value;
    } else if (key === 'content' && Array.isArray(value)) {
      if (value.length || Object.hasOwn(authored, 'content')) result.content = value.map((child, index) => {
        if (typeof child === 'string') throw new Error('Export must be materialized');
        const original = children(authored)[index]; if (!original) throw new Error('No unexpected node allowed');
        return native(child, original);
      });
    } else if (key === 'marks' && Array.isArray(value)) {
      result.marks = value.map(mark => {
        const copy = { ...mark }; if (Object.hasOwn(copy, 'attrs') && copy.attrs === undefined) delete copy.attrs; return copy;
      });
    } else result[key] = value;
  }
  return result;
}
function leaves(editor: Editor) {
  const first = [...editor.dataStore.getNodes().values()].find(node => node.text === FIRST);
  const second = [...editor.dataStore.getNodes().values()].find(node => node.text === SECOND);
  if (!first?.sid || !second?.sid) throw new Error('Both independent text identities required');
  return { first: first.sid, second: second.sid };
}
for (const product of ['Note1', 'Word', 'Slides', 'Site']) describe(`${product} actual default editor canonical range history`, () => {
  it.each([
    ['toggleBold', 'bold'], ['toggleItalic', 'italic'], ['toggleUnderline', 'underline'], ['toggleStrikeThrough', 'strikethrough']
  ])('keeps complete native sample and selection through %s undo/redo', async (command, mark) => {
    const source = sample(product), expected = structuredClone(source);
    const expectedRuns = walk(expected).filter(node => node.text === FIRST || node.text === SECOND);
    expectedRuns[0].marks = [{ stype: mark, range: [2, FIRST.length] }];
    expectedRuns[1].marks = [{ stype: mark, range: [0, 3] }];
    const note = product === 'Note1' ? openNoteTree(source) : undefined;
    const editor = note?.editor ?? (product === 'Word' ? createWordEditor() : product === 'Slides' ? createSlidesEditor() : createSiteEditor());
    if (!note) editor.loadDocument(source, 'native-history');
    try {
      const ids = leaves(editor), selection = { type: 'range' as const, startNodeId: ids.first, endNodeId: ids.second, startOffset: 2, endOffset: 3, collapsed: false };
      editor.selectionManager.setSelection(selection);
      expect(native(editor.exportDocument(), source)).toStrictEqual(source);
      expect(await editor.executeCommand(command)).toBe(true);
      expect(native(editor.exportDocument(), source)).toStrictEqual(expected);
      expect(editor.selection).toMatchObject(selection);
      expect(await editor.undo()).toBe(true); expect(native(editor.exportDocument(), source)).toStrictEqual(source);
      expect(editor.selection).toMatchObject(selection);
      expect(await editor.redo()).toBe(true); expect(native(editor.exportDocument(), source)).toStrictEqual(expected);
      editor.setEditable(false);
      const before = { model: editor.exportDocument(), history: editor.getHistoryStats() };
      const returned = await editor.executeCommand(command);
      const evidence = process.env.NATIVE_NOTE_BASELINE_EVIDENCE;
      if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, `${product}-${mark}-readonly.json`), JSON.stringify({ returned, editable: editor.isEditable, before, after: { model: editor.exportDocument(), history: editor.getHistoryStats() } }, null, 2)); }
      expect(returned).toBe(false);
      expect({ model: editor.exportDocument(), history: editor.getHistoryStats() }).toStrictEqual(before);
    } finally { if (note) note.close(); else editor.destroy(); }
  });
});

it.each([
  { name: 'absent', marks: undefined },
  { name: 'empty', marks: [] },
  { name: 'authored ordered marks', marks: [{ stype: 'bold', attrs: { authored: { nullable: null, empty: [] } } }, { stype: 'italic', range: [1, 3] as [number, number], attrs: {} }] }
])(
  'single and cross-run undo preserves absent/empty/whole-run/attrs/order: $name', async ({ marks }) => {
    for (const cross of [false, true]) {
      const source = { stype: 'note', content: [{ stype: 'paragraph', content: [
        { stype: 'inline-text', text: FIRST, ...(marks === undefined ? {} : { marks }) }, { stype: 'inline-text', text: SECOND }
      ] }] };
      const one = openNoteTree(source, { nativeSource: true }); one.editor.setEditable(true);
      try {
        const ids = leaves(one.editor), selection = { type: 'range' as const, startNodeId: ids.first, endNodeId: cross ? ids.second : ids.first, startOffset: 1, endOffset: 3, collapsed: false };
        one.editor.selectionManager.setSelection(selection);
        expect((await transaction(one.editor, [toggleMark(ids.first, 1, selection.endNodeId, 3, 'underline')]).commit()).success).toBe(true);
        expect(await one.editor.undo()).toBe(true);
        expect(native(one.editor.exportDocument(), source)).toStrictEqual(source);
        expect(one.editor.selection).toMatchObject(selection);
      } finally { one.close(); }
    }
  }
);
