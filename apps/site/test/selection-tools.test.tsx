// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSampleSite, createSiteEditor, getSiteSchemaDefinition, blocksIn, pagesOf } from '@barocss/office-site';
import { ObjectTools, useSiteSelectionTarget } from '../src/object-tools';

let root: Root;
let editor: ReturnType<typeof createSiteEditor>;
let board: HTMLDivElement;
let page: string;
let selected: string;
const state = () => ({ document: editor.exportDocument(), selection: editor.selection, history: editor.getHistoryStats() });
const doc = () => ({ rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) });

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(100, 100, 200, 40));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(100, 100, 200, 40)] as unknown as DOMRectList);
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  editor = createSiteEditor({ editable: true, schema, dataStore: store });
  editor.loadDocument(createSampleSite(), 'site');
  page = pagesOf(doc())[0].sid;
  selected = blocksIn(doc(), page)[0];
  board = document.createElement('div');
  board.tabIndex = 0;
  const block = document.createElement('div');
  block.setAttribute('data-bc-sid', selected);
  board.append(block);
  document.body.append(board);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { await editor.executeCommand('setNode', { nodeIds: [selected] }); board.focus(); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  editor.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Site compact object target', () => {
  it('duplicates the current actual block through the primary control and native undo restores the document', async () => {
    await act(async () => root.render(createElement(ObjectTools, {
      editor, host: { current: board }, pageId: page, ownerKey: page, active: true
    })));
    const native = editor.exportDocument();
    const original = blocksIn(doc(), page);
    const button = document.querySelector<HTMLButtonElement>('[data-site-object-control="duplicateBlocks"]');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    await act(async () => button!.click());
    const after = blocksIn(doc(), page);
    expect(after).toHaveLength(original.length + 1);
    expect(after[0]).toBe(selected);
    expect(editor.dataStore.getNode(after[1])?.stype).toBe(editor.dataStore.getNode(selected)?.stype);
    await act(async () => { await editor.executeCommand('undo'); });
    expect(editor.exportDocument()).toEqual(native);
  });

  it('does not expose a mutation surface in another board or after its host detaches', async () => {
    const other = document.createElement('div');
    other.tabIndex = 0;
    document.body.append(other);
    other.focus();
    await act(async () => root.render(createElement(ObjectTools, {
      editor, host: { current: board }, pageId: page, ownerKey: page, active: true
    })));
    expect(document.querySelector('[data-site-selection-chrome]')).toBeNull();
    const before = state();
    board.remove();
    await act(async () => root.render(createElement(ObjectTools, {
      editor, host: { current: board }, pageId: page, ownerKey: page, active: true
    })));
    expect(document.querySelector('[data-site-selection-chrome]')).toBeNull();
    expect(state()).toEqual(before);
  });

  it.each(['selection', 'content', 'scope', 'authority', 'unmount'] as const)('refuses a delayed command after %s retirement without restoring the old target', async retirement => {
    let deferred: (() => void) | undefined;
    let ownerKey = page;
    function PendingPick() {
      const target = useSiteSelectionTarget(editor, editor.selection, ownerKey, true, { current: board }, page);
      deferred = () => {
        if (target.current() && editor.canExecuteCommand('duplicateBlocks')) void editor.executeCommand('duplicateBlocks');
      };
      return null;
    }
    await act(async () => root.render(createElement(PendingPick)));
    const oldPick = deferred!;
    await act(async () => {
      if (retirement === 'selection') {
        await editor.executeCommand('setNode', { nodeIds: [] });
        await editor.executeCommand('setNode', { nodeIds: [selected] });
      } else if (retirement === 'content') {
        await editor.executeCommand('duplicateBlocks');
        await editor.executeCommand('setNode', { nodeIds: [selected] });
      } else if (retirement === 'scope') {
        ownerKey = `${page}:definition`;
        root.render(createElement(PendingPick));
      } else if (retirement === 'authority') {
        editor.setEditable(false);
        editor.setEditable(true);
      } else root.render(null);
    });
    if (retirement === 'scope') await act(async () => { ownerKey = page; root.render(createElement(PendingPick)); });
    const before = state();
    await act(async () => oldPick());
    expect(state()).toEqual(before);
  });
});
