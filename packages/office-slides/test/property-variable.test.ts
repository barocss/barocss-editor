import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { Properties } from '../src/properties';
import { propertyBinding } from '../src/property-variable';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';
import { PropertySheet } from '@barocss/office-ui';
import { componentsOf } from '@barocss/office-canvas';

let editor: ReturnType<typeof createSlidesEditor>, host: HTMLDivElement, root: Root;
let slideId: string, box: string, second: string;
const run = (name: string, payload?: unknown) => editor.executeCommand(name, payload);
const render = async (readOnly = false) => {
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) });
  await act(async () => root.render(createElement(Properties, { editor, slides, current: slideId, unit: 'px', onUnit() {}, readOnly })));
};
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const pick = async (label: string, name: string) => {
  await act(async () => button(`${label} 변수 연결`).click());
  const option = [...host.querySelectorAll<HTMLButtonElement>('.sl-variable-options button')].find(one => one.textContent?.startsWith(name))!;
  expect(option).toBeDefined(); await act(async () => option.click());
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'field432');
  const slides = deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) });
  slideId = slides[0].sid;
  const content = editor.dataStore.getNode(slideId)!.content as string[];
  box = content.find(sid => editor.dataStore.getNode(sid)?.stype === 'textFrame')!;
  second = content.filter(sid => editor.dataStore.getNode(sid)?.stype === 'textFrame')[1];
  await run('setDocumentVar', { name: '폭', kind: 'number', value: '3000' });
  await run('setDocumentVar', { name: '다른 폭', kind: 'number', value: '4500' });
  editor.setNode({ nodeId: box });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); editor.destroy(); vi.unstubAllGlobals(); });

it('attaches, switches and detaches beside width; native undo and redo retain exact bindings', async () => {
  await render();
  expect(host.textContent).not.toContain('문서 변수 연결');
  expect(button('너비 변수 연결').parentElement?.querySelector('input[aria-label="너비"]')).not.toBeNull();
  await pick('너비', '폭');
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toContainEqual({ attr: 'width', var: '폭' });
  expect(button('너비 변수 폭').textContent).toContain('200 px');
  expect(host.querySelector('input[aria-label="너비"]')?.matches(':disabled')).toBe(true);
  expect(button('너비 변수 연결').matches(':disabled')).toBe(false);
  await pick('너비', '다른 폭');
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toContainEqual({ attr: 'width', var: '다른 폭' });
  await pick('너비', '연결 해제');
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toBeUndefined();
  expect(host.querySelector('input[aria-label="너비"]')).not.toBeNull();
  await act(async () => { await run('undo'); });
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toContainEqual({ attr: 'width', var: '다른 폭' });
  await act(async () => { await run('redo'); });
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toBeUndefined();
});

it('shows mixed binding rather than the first shape name and replaces both from one picker', async () => {
  await run('setVarBind', { nodeIds: [box], attr: 'width', var: '폭' });
  editor.setNode({ nodeIds: [box, second] }); await render();
  expect(button('너비 변수 서로 다름').textContent).toContain('서로 다름');
  await pick('너비', '다른 폭');
  for (const sid of [box, second]) expect(editor.dataStore.getNode(sid)!.attributes.varBinds).toContainEqual({ attr: 'width', var: '다른 폭' });
});

it('resolves and offers the slide-local shadow once, and excludes incompatible local kinds', async () => {
  await run('setSlideVar', { slideId, name: '폭', kind: 'number', value: '6000' });
  editor.setNode({ nodeId: box }); await render(); await pick('너비', '폭');
  expect(button('너비 변수 폭').textContent).toContain('400 px');
  expect(propertyBinding(editor, [box], 'width')!.options.filter(one => one.name === '폭')).toHaveLength(1);
  await act(async () => { await run('setSlideVar', { slideId, name: '다른 폭', kind: 'boolean', value: 'true' }); });
  expect(propertyBinding(editor, [box], 'width')!.options.map(one => one.name)).not.toContain('다른 폭');
});

it('retires an open picker after a selection change and blocks read-only or locked mutation', async () => {
  await render(); await act(async () => button('너비 변수 연결').click());
  const stale = host.querySelector<HTMLButtonElement>('.sl-variable-options button')!;
  await act(async () => { editor.setNode({ nodeId: second }); stale.click(); });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => stale.click());
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toBeUndefined();
  expect(editor.dataStore.getNode(second)!.attributes.varBinds).toBeUndefined();
  await render(true); expect(button('너비 변수 연결').matches(':disabled')).toBe(true);
  await render(); await act(async () => { await run('setBoxLocked', { nodeIds: [second], locked: true }); });
  expect(button('너비 변수 연결').matches(':disabled')).toBe(true);
});

it('retires an old picker when the editor loads another root', async () => {
  await render(); await act(async () => button('너비 변수 연결').click());
  const stale = host.querySelector<HTMLButtonElement>('.sl-variable-options button')!;
  let before = '';
  await act(async () => {
    editor.loadDocument(createSampleDeck(), 'replacement432');
    before = JSON.stringify(editor.exportDocument());
    stale.click();
  });
  expect(JSON.stringify(editor.exportDocument())).toBe(before);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('refuses a connected old picker after same-root replacement restores the exact selection', async () => {
  await render(); await act(async () => button('너비 변수 연결').click());
  const stale = host.querySelector<HTMLButtonElement>('.sl-variable-options button')!;
  const document = editor.exportDocument();
  const rootId = editor.getRootId();
  const rootNode = editor.dataStore.getNode(rootId!);
  const selection = JSON.stringify(editor.selection);
  let before = '';
  await act(async () => {
    // Native core loads can reuse persisted SIDs. Product normalization usually mints fresh IDs.
    Editor.prototype.loadDocument.call(editor, document, 'field432');
    editor.setNode({ nodeId: box });
    expect(editor.getRootId()).toBe(rootId);
    expect(JSON.stringify(editor.selection)).toBe(selection);
    expect(editor.dataStore.getNode(rootId!)).not.toBe(rootNode);
    expect(stale.isConnected).toBe(true);
    before = JSON.stringify(editor.exportDocument());
    stale.click();
  });
  expect(JSON.stringify(editor.exportDocument())).toBe(before);
  expect(editor.dataStore.getNode(box)!.attributes.varBinds).toBeUndefined();
});

it('closes search on Escape without replacing a pending field value or native data', async () => {
  await render(); const before = JSON.stringify(editor.exportDocument()); const selection = JSON.stringify(editor.selection);
  await act(async () => button('너비 변수 연결').click());
  const search = host.querySelector<HTMLInputElement>('[aria-label="너비 변수 검색"]')!;
  await act(async () => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button('너비 변수 연결'));
  expect(JSON.stringify(editor.exportDocument())).toBe(before); expect(JSON.stringify(editor.selection)).toBe(selection);
});

it('does not offer enum, identity, or unsupported metadata binding', () => {
  for (const attr of ['name', 'locked', 'fit', 'verticalAlign', 'cornerTopLeft', 'flipX']) expect(propertyBinding(editor, [box], attr)).toBeUndefined();
});

it('leaves shared default and companion fields intact; optional decoration wraps each real control', async () => {
  const companion = { attr: 'height', group: 'size', label: 'H', ariaLabel: 'H', control: 'number' };
  const groups = [{ label: 'Size', rows: [{ attr: 'width', group: 'size', label: 'W', ariaLabel: 'W', control: 'number', with: [companion] }] }];
  const onWrite = vi.fn();
  const props = { groups, value: () => 20, onWrite };
  await act(async () => root.render(createElement(PropertySheet, props)));
  const before = [...host.querySelectorAll('input')].map(one => [one.getAttribute('aria-label'), one.value]);
  const decorated = vi.fn((row, control) => createElement('span', { 'data-decorated': row.attr }, control));
  await act(async () => root.render(createElement(PropertySheet, { ...props, decorateControl: decorated })));
  expect([...host.querySelectorAll('input')].map(one => [one.getAttribute('aria-label'), one.value])).toEqual(before);
  expect([...host.querySelectorAll('[data-decorated]')].map(one => one.getAttribute('data-decorated'))).toEqual(['width', 'height']);
  expect(onWrite).not.toHaveBeenCalled();
});


it('keeps component text binding on the definition and leaves the part and document bindings unchanged', async () => {
  const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
  const card = componentsOf(doc)[0];
  const part = card.parts.find(sid => doc.getNode(sid)?.attributes?.partId === 'title')!;
  editor.setNode({ nodeId: part }); await render();
  const beforePart = JSON.stringify(doc.getNode(part));
  const binding = propertyBinding(editor, [part], 'text')!;
  expect(binding.component).toEqual({ id: card.id, part: 'title' });
  await pick('텍스트 내용', '연결 해제');
  expect(componentsOf(doc)[0].binds.some(one => one.part === 'title' && one.attr === 'text')).toBe(false);
  expect(JSON.stringify(doc.getNode(part))).toBe(beforePart);
  await pick('텍스트 내용', '이름');
  expect(componentsOf(doc)[0].binds).toContainEqual({ part: 'title', attr: 'text', var: 'title' });
  expect(doc.getNode(part)!.attributes.varBinds).toBeUndefined();
});

it('binding a numeric field preserves exact paint-list color references', async () => {
  const paints = [{ kind: 'solid', color: 'var:주의', opacity: 0.4, visible: true }];
  await run('setBoxStyle', { nodeIds: [box], fills: paints });
  editor.setNode({ nodeId: box }); await render();
  expect(button('채우기 값 변수 연결')).toBeNull();
  expect(button('1번 채우기')).not.toBeNull();
  await pick('너비', '폭');
  expect(editor.dataStore.getNode(box)!.attributes.fills).toEqual(paints);
  await pick('너비', '연결 해제');
  expect(editor.dataStore.getNode(box)!.attributes.fills).toEqual(paints);
});
