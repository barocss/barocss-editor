import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckFileText } from '../src/deck-file';
import { captureSlidesSelectionOwner, changeSlidesSelectionContext, createSlidesSelectionLifetime, ownsSlidesSelection, selectedSlidesTable, trackSlidesSelectionLifetime } from '../src/selection-owner';
let editor: ReturnType<typeof createSlidesEditor>;
let lifetime: ReturnType<typeof createSlidesSelectionLifetime>, dispose: () => void;
let slide: string, second: string, box: string;
const native = () => deckFileText(editor.exportDocument());
beforeEach(() => {
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'selection427');
  const nodes: NonNullable<ReturnType<typeof editor.dataStore.getNode>>[] = [];
  const visit = (id: string) => { const node = editor.dataStore.getNode(id)!; nodes.push(node); for (const child of node.content ?? []) visit(String(child)); };
  visit(editor.getRootId()!);
  const slides = nodes.filter(node => node.stype === 'surface'); slide = slides[0].sid!; second = slides[1].sid!;
  box = String(slides[0].content![0]);
  editor.updateSelection({ type: 'node', nodeIds: [box], startNodeId: box, endNodeId: box, startOffset: 0, endOffset: 0, collapsed: false });
  lifetime = createSlidesSelectionLifetime(editor, slide); dispose = trackSlidesSelectionLifetime(lifetime);
});
afterEach(() => { dispose(); editor.destroy(); });
it('keeps tool-only selection capture native and history unchanged', () => {
  const before = native(), canUndo = editor.canRun('undo');
  expect(ownsSlidesSelection(captureSlidesSelectionOwner(lifetime))).toBe(true);
  expect(native()).toBe(before); expect(editor.canRun('undo')).toBe(canUndo);
});
it('retires async intent when slide A changes to B and returns to A', () => {
  const owner = captureSlidesSelectionOwner(lifetime), before = native(), version = editor.dataStore.getVersion();
  changeSlidesSelectionContext(lifetime, second, 'canvas'); changeSlidesSelectionContext(lifetime, slide, 'canvas');
  expect(ownsSlidesSelection(owner)).toBe(false);
  expect(ownsSlidesSelection(captureSlidesSelectionOwner(lifetime))).toBe(true);
  expect(native()).toBe(before); expect(editor.dataStore.getVersion()).toBe(version);
});
it('retires canvas intent after notes focus and canvas return without replacing the native editor', () => {
  const owner = captureSlidesSelectionOwner(lifetime), before = native();
  changeSlidesSelectionContext(lifetime, slide, 'notes'); changeSlidesSelectionContext(lifetime, slide, 'canvas');
  expect(ownsSlidesSelection(owner)).toBe(false);
  expect(ownsSlidesSelection(captureSlidesSelectionOwner(lifetime))).toBe(true); expect(native()).toBe(before);
});
it('retires a cleared and restored selection and live authority changes', () => {
  const selection = structuredClone(editor.selection!), owner = captureSlidesSelectionOwner(lifetime), before = native();
  editor.updateSelection(null); editor.updateSelection(selection);
  expect(ownsSlidesSelection(owner)).toBe(false);
  const fresh = captureSlidesSelectionOwner(lifetime); editor.setEditable(false); editor.setEditable(true);
  expect(ownsSlidesSelection(fresh)).toBe(false); expect(native()).toBe(before);
});
it('refuses old intent after exact same-session document replacement', () => {
  const owner = captureSlidesSelectionOwner(lifetime);
  editor.loadDocument(createSampleDeck(), 'selection427');
  expect(ownsSlidesSelection(owner)).toBe(false);
});
it('retires captured object intent after movement and preserves full native undo and redo', async () => {
  const owner = captureSlidesSelectionOwner(lifetime), before = native();
  expect(await editor.run('nudgeBoxes', { dx: 120, dy: 0 })).toBe(true);
  const moved = native(); expect(moved).not.toBe(before); expect(ownsSlidesSelection(owner)).toBe(false);
  await editor.undo(); expect(native()).toBe(before); expect(ownsSlidesSelection(owner)).toBe(false);
  await editor.redo(); expect(native()).toBe(moved);
  expect(ownsSlidesSelection(captureSlidesSelectionOwner(lifetime))).toBe(true);
});

it('finds the native bTable owning an actual cell selection without changing the deck', () => {
  const all: NonNullable<ReturnType<typeof editor.dataStore.getNode>>[] = [];
  const visit = (id: string) => { const node = editor.dataStore.getNode(id)!; all.push(node); for (const child of node.content ?? []) visit(String(child)); };
  visit(editor.getRootId()!);
  const table = all.find(node => node.stype === 'bTable')!;
  const cell = all.find(node => node.stype === 'bTableCell')!;
  const before = native();
  editor.updateSelection({ type: 'range', startNodeId: cell.sid!, endNodeId: cell.sid!, startOffset: 0, endOffset: 0, collapsed: true });
  expect(selectedSlidesTable(editor)).toBe(table.sid); expect(native()).toBe(before);
  editor.updateSelection({ type: 'node', nodeIds: [box], startNodeId: box, endNodeId: box, startOffset: 0, endOffset: 0, collapsed: false });
  expect(selectedSlidesTable(editor)).toBeUndefined(); expect(native()).toBe(before);
});
