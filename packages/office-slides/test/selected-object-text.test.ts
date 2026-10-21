import { afterEach, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { applyMark, registerPreCommitGuard, transaction } from '@barocss/model';
import { markCss } from '@barocss/office-text';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { readSelectedObjectText, registerSelectedObjectTextCommands } from '../src/selected-object-text';
import { captureSlidesSelectionOwner, createSlidesSelectionLifetime, ownsSlidesSelection, trackSlidesSelectionLifetime } from '../src/selection-owner';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const editor = createSlidesEditor({ editable: true, schema: createSchema('object-text', getSlidesSchemaDefinition()) });
  editors.push(editor);
  registerSelectedObjectTextCommands(editor);
  editor.loadDocument({ sid: 'doc', stype: 'document', attributes: {}, content: [
    { sid: 'slide', stype: 'surface', attributes: { kind: 'slide' }, content: [
      { sid: 'frame', stype: 'textFrame', attributes: { x: 0, y: 0, width: 4000, height: 2000 }, content: [
        { sid: 'paragraph', stype: 'paragraph', attributes: {}, content: [
          { sid: 'run', stype: 'inline-text', attributes: {}, text: 'First text' }
        ] }
      ] }
    ] }
  ] });
  return editor;
}
const native = (editor: Editor) => structuredClone(editor.exportDocument());
function node(editor: Editor, stype: string) {
  return [...editor.dataStore.getNodes().values()].find(node => node.stype === stype)!;
}

it('the existing per-run mark operation restores the exact original native node and whole-object selection', async () => {
  const editor = fixture();
  const frame = node(editor, 'textFrame').sid!;
  const run = node(editor, 'inline-text').sid!;
  editor.setNode({ nodeIds: [frame] });
  const before = native(editor), selection = structuredClone(editor.selection);
  expect((await transaction(editor, [applyMark(run, 0, 10, 'bold')]).commit()).success).toBe(true);
  const after = native(editor);
  expect(editor.selection).toEqual(selection);
  expect(await editor.undo()).toBe(true);
  expect(native(editor)).toEqual(before);
  expect(editor.selection).toEqual(selection);
  expect(await editor.redo()).toBe(true);
  expect(native(editor)).toEqual(after);
});

const paragraph = (name: string, marks?: object[], attributes: Record<string, unknown> = {}) => ({ stype: 'paragraph', attributes: { ...attributes }, content: [{ stype: 'inline-text', attributes: {}, text: name, ...(marks === undefined ? {} : { marks }) }] });
const frame = (name: string, content = [paragraph(name)]) => ({ stype: 'textFrame', attributes: { name, x: 0, y: 0, width: 4000, height: 2000 }, content });
function deck(editor: Editor, content: object[], resources: object[] = []) {
  editor.loadDocument({ stype: 'document', attributes: {}, content: [
    { stype: 'surface', attributes: { kind: 'slide' }, content },
    { stype: 'resources', attributes: {}, content: [] },
    ...(resources.length ? [{ stype: 'components', attributes: {}, content: resources }] : [])
  ] });
}
const named = (editor: Editor, name: string) => [...editor.dataStore.getNodes().values()].find(node => node.attributes?.name === name)!;
const runNamed = (editor: Editor, text: string) => [...editor.dataStore.getNodes().values()].find(node => node.text === text)!;
const state = (editor: Editor) => ({ native: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()) });

it('formats every run in a selected group in one exact native history entry without touching outside text', async () => {
  const editor = fixture();
  deck(editor, [
    { stype: 'group', attributes: { name: 'Group', x: 0, y: 0, width: 4000, height: 2000 }, content: [
      frame('First', [paragraph('First', [{ stype: 'bold', range: [0, 2] }])]),
      frame('Second', [paragraph('Second', [{ stype: 'italic', range: [0, 6] }])]),
      frame('Third', [paragraph('Third', [])])
    ] }, frame('Outside')
  ]);
  editor.setNode({ nodeIds: [named(editor, 'Group').sid!] });
  const before = state(editor), outside = structuredClone(runNamed(editor, 'Outside'));
  expect(readSelectedObjectText(editor).summary.mixedMarks).toContain('bold');
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold' })).toBe(true);
  expect(readSelectedObjectText(editor).summary.marks).toContain('bold');
  expect(runNamed(editor, 'Outside')).toEqual(outside);
  expect(runNamed(editor, 'Second').marks).toContainEqual({ stype: 'italic', range: [0, 6] });
  expect(editor.historyManager.getHistory()).toHaveLength(1);
  expect(editor.selection).toEqual(before.selection);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.native);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold' })).toBe(true);
  expect(readSelectedObjectText(editor).summary.marks).not.toContain('bold');
  expect(readSelectedObjectText(editor).summary.mixedMarks).not.toContain('bold');
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('formats disjoint selected objects without crossing the unselected object between them', async () => {
  const editor = fixture(); deck(editor, [frame('A'), frame('B'), frame('C')]);
  editor.setNode({ nodeIds: ['A', 'C'].map(name => named(editor, name).sid!) });
  const before = native(editor), other = structuredClone(runNamed(editor, 'B'));
  expect(await editor.run('setSelectedObjectTextFormat', { mark: 'fontColor', value: '#123456' })).toBe(true);
  expect(runNamed(editor, 'B')).toEqual(other);
  expect(readSelectedObjectText(editor).summary.markAttributes.fontColor).toEqual({ color: '#123456' });
  expect(editor.historyManager.getHistory()).toHaveLength(1);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
});

it.each(['bold', 'italic', 'underline', 'strikethrough'] as const)('switches inherited %s off only on the complete owned paragraph with exact Undo/Redo', async mark => {
  const editor = fixture();
  const inherited = { bold: true, italic: true, underline: 'single', strike: true };
  deck(editor, [frame('A', [paragraph('A', [{ stype: mark, range: [0, 1] }], inherited)]), frame('B')]);
  editor.setNode({ nodeIds: [named(editor, 'A').sid!] });
  const before = state(editor);
  expect(readSelectedObjectText(editor).summary.marks).toContain(mark);
  expect(await editor.run('toggleSelectedObjectTextMark', { mark })).toBe(true);
  expect(readSelectedObjectText(editor).summary.marks).not.toContain(mark);
  expect(editor.selection).toEqual(before.selection);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.native);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it.each([['fontFamily', 'Georgia', 'family'], ['fontSize', '42', 'size'], ['fontColor', '#112233', 'color'], ['bgColor', '#abcdef', 'bgColor'], ['highlight', '#ffaa00', 'color']] as const)('applies and clears %s through native run operations while preserving other marks', async (mark, value, key) => {
  const editor = fixture(); deck(editor, [frame('A', [paragraph('A', [{ stype: 'italic', range: [0, 1] }]), paragraph('Another')])]);
  editor.setNode({ nodeIds: [named(editor, 'A').sid!] });
  const before = native(editor);
  expect(await editor.run('setSelectedObjectTextFormat', { mark, value })).toBe(true);
  const after = native(editor);
  expect(readSelectedObjectText(editor).summary.markAttributes[mark]).toEqual({ [key]: value });
  expect(runNamed(editor, 'A').marks).toContainEqual({ stype: 'italic', range: [0, 1] });
  expect(await editor.run('clearSelectedObjectTextFormat', { mark })).toBe(true);
  expect(readSelectedObjectText(editor).summary.marks).not.toContain(mark);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(after);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
});

it.each([
  ['36', 36, '18pt'],
  ['24px', '24px', '24px'],
  ['18pt', '18pt', '18pt']
] as const)('renders object font size %s using the existing native size units and restores exact Undo/Redo', async (value, size, css) => {
  const editor = fixture();
  editor.setNode({ nodeIds: [node(editor, 'textFrame').sid!] });
  const before = native(editor);
  expect(await editor.executeCommand('setSelectedObjectTextFormat', { mark: 'fontSize', value })).toBe(true);
  const mark = node(editor, 'inline-text').marks!.find(mark => mark.stype === 'fontSize')!;
  expect(mark.attrs).toEqual({ size });
  expect(markCss('fontSize', mark.attrs, undefined).fontSize).toBe(css);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('formats only an instance native slot and leaves the definition and sibling instance untouched', async () => {
  const editor = fixture();
  deck(editor, [
    { stype: 'instance', attributes: { name: 'Own', componentId: 'card', width: 4000, height: 2000 }, content: [frame('Own slot')] },
    { stype: 'instance', attributes: { name: 'Sibling', componentId: 'card', width: 4000, height: 2000 }, content: [frame('Sibling slot')] },
    { stype: 'instance', attributes: { name: 'Projection only', componentId: 'card', width: 4000, height: 2000 }, content: [] }
  ], [{ stype: 'component', attributes: { id: 'card', name: 'Card definition', width: 4000, height: 2000 }, content: [
    { stype: 'frame', attributes: { slot: 'body', width: 4000, height: 2000 }, content: [frame('Definition text')] }
  ] }]);
  editor.setNode({ nodeIds: [named(editor, 'Projection only').sid!] });
  expect(readSelectedObjectText(editor).reason).toBe('no-owned-text');
  editor.setNode({ nodeIds: [named(editor, 'Own').sid!] });
  expect(readSelectedObjectText(editor).scope).toBe('instance-slot');
  const before = native(editor), definition = structuredClone(runNamed(editor, 'Definition text')), sibling = structuredClone(runNamed(editor, 'Sibling slot'));
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold' })).toBe(true);
  expect(runNamed(editor, 'Definition text')).toEqual(definition);
  expect(runNamed(editor, 'Sibling slot')).toEqual(sibling);
  expect(readSelectedObjectText(editor).summary.marks).toContain('bold');
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
});

it('refuses readonly, locked descendants, projected identities, mismatched targets and text bindings', async () => {
  const editor = fixture(); editor.setNode({ nodeIds: [node(editor, 'textFrame').sid!] });
  editor.setEditable(false); let before = state(editor);
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold' })).toBe(false); expect(state(editor)).toEqual(before);
  editor.setEditable(true);
  const run = node(editor, 'inline-text'); editor.dataStore.updateNode(run.sid!, { attributes: { locked: true } }, false);
  expect(readSelectedObjectText(editor).reason).toBe('locked'); before = state(editor);
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold' })).toBe(false); expect(state(editor)).toEqual(before);
  editor.dataStore.updateNode(run.sid!, { attributes: {} }, false);
  expect(await editor.run('toggleSelectedObjectTextMark', { nodeIds: ['owner~definition'], mark: 'bold' })).toBe(false);
  const box = node(editor, 'textFrame'); editor.dataStore.updateNode(box.sid!, { attributes: { ...box.attributes, varBinds: [{ attr: 'text', var: 'title' }] } }, false);
  expect(readSelectedObjectText(editor).reason).toBe('bound-text');
});

it('retires a queued object intent across selection and authority ABA without changing native content or history', async () => {
  const editor = fixture(); deck(editor, [frame('A'), frame('B')]);
  const a = named(editor, 'A').sid!, b = named(editor, 'B').sid!;
  for (const change of [() => { editor.setNode({ nodeIds: [b] }); editor.setNode({ nodeIds: [a] }); }, () => { editor.setEditable(false); editor.setEditable(true); }]) {
    editor.setNode({ nodeIds: [a] }); const before = state(editor);
    const lock = await editor.dataStore.acquireLock('object-format');
    const pending = editor.run('toggleSelectedObjectTextMark', { mark: 'bold' });
    change(); editor.dataStore.releaseLock(lock);
    expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
  }
});

it('rechecks captured product authority after an awaited host guard and permits a clean retry', async () => {
  const editor = fixture(); editor.setNode({ nodeIds: [node(editor, 'textFrame').sid!] });
  let current = true; const before = state(editor);
  const dispose = registerPreCommitGuard(editor, async () => { await Promise.resolve(); current = false; });
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold', canApply: () => current })).toBe(false);
  expect(state(editor)).toEqual(before); dispose(); current = true;
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold', canApply: () => current })).toBe(true);
  expect(editor.historyManager.getHistory()).toHaveLength(1);
});

it('restores valid whole-run marks that omit a range exactly after object formatting', async () => {
  const editor = fixture(); deck(editor, [frame('A', [paragraph('A', [{ stype: 'italic' }])])]);
  editor.setNode({ nodeIds: [named(editor, 'A').sid!] }); const before = native(editor);
  expect(await editor.run('setSelectedObjectTextFormat', { mark: 'fontColor', value: '#123456' })).toBe(true);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
});

it('rejects a changed native document epoch while an object command waits for its lock', async () => {
  const editor = fixture(); const box = node(editor, 'textFrame').sid!;
  editor.setNode({ nodeIds: [box] });
  const lock = await editor.dataStore.acquireLock('object-format-root');
  const pending = editor.run('toggleSelectedObjectTextMark', { mark: 'bold' });
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'slide' }, content: [frame('New root')] }] });
  const afterLoad = state(editor); editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(state(editor)).toEqual(afterLoad);
});

it('refuses a newly locked ancestor even when a host wrote it without a content notification', async () => {
  const editor = fixture(); deck(editor, [{ stype: 'group', attributes: { name: 'Parent', x: 0, y: 0, width: 4000, height: 2000 }, content: [frame('A')] }]);
  editor.setNode({ nodeIds: [named(editor, 'A').sid!] });
  const lock = await editor.dataStore.acquireLock('object-format-ancestor');
  const pending = editor.run('toggleSelectedObjectTextMark', { mark: 'bold' });
  const parent = named(editor, 'Parent'); editor.dataStore.updateNode(parent.sid!, { attributes: { ...parent.attributes, locked: true } }, false);
  const afterLock = state(editor); editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(state(editor)).toEqual(afterLock);
});

it('preserves the existing contextual owner through the guarded native transaction', async () => {
  const editor = fixture(); editor.setNode({ nodeIds: [node(editor, 'textFrame').sid!] });
  const lifetime = createSlidesSelectionLifetime(editor, node(editor, 'surface').sid);
  const stop = trackSlidesSelectionLifetime(lifetime), owner = captureSlidesSelectionOwner(lifetime);
  const before = native(editor);
  expect(await editor.run('toggleSelectedObjectTextMark', { mark: 'bold', canApply: () => ownsSlidesSelection(owner) })).toBe(true);
  expect(readSelectedObjectText(editor).summary.marks).toContain('bold');
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before); stop();
});

it('the existing per-run mark operation preserves explicit empty marks and unrelated partial marks', async () => {
  const editor = fixture(); const run = node(editor, 'inline-text').sid!;
  for (const marks of [[], [{ stype: 'italic', range: [2, 6] as [number, number] }]]) {
    editor.dataStore.updateNode(run, { marks }, false);
    const before = native(editor);
    expect((await transaction(editor, [applyMark(run, 0, 10, 'bold')]).commit()).success).toBe(true);
    expect(await editor.undo()).toBe(true);
    expect(native(editor)).toEqual(before);
  }
});
