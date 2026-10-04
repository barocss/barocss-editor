// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SelectionOverlay } from '../src/overlay';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';

let editor: ReturnType<typeof createSlidesEditor>, root: Root, stage: HTMLDivElement, owner: HTMLDivElement, slide: string;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  stage = document.createElement('div'); owner = document.createElement('div');
  document.body.append(stage, owner); root = createRoot(owner);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'overlay-keyboard-owner');
  slide = deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) })[0].sid;
  const drawn = document.createElement('div'); drawn.className = 'sl-slide'; drawn.dataset.bcSid = slide; stage.append(drawn);
  const bounds = () => new DOMRect(0, 0, 960, 540);
  vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(bounds);
  vi.spyOn(drawn, 'getBoundingClientRect').mockImplementation(bounds);
});
afterEach(() => {
  act(() => root.unmount()); editor.destroy(); document.body.replaceChildren();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const native = () => JSON.stringify(editor.exportDocument());
const key = (target: EventTarget, value: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const render = (paint = false) => {
  function Example() {
    const [stop, setStop] = useState(0);
    return <SelectionOverlay editor={editor} view={null} slideSid={slide} revision={0} host={{ current: stage }}
      paintEdit={paint ? 0 : null} stopEdit={stop} onStopEdit={setStop} />;
  }
  act(() => root.render(<Example />));
};
const insert = async (command: 'insertPicture' | 'insertRectangle') => {
  await act(async () => { await editor.executeCommand(command, { slideId: slide, src: 'data:image/png;base64,AA==' }); });
  const id = editor.selection!.nodeIds![0];
  await act(async () => { await editor.executeCommand('setBoxGeometry', { nodeId: id, x: 1500, y: 1500, width: 3000, height: 1500 }); });
  return id;
};
const chrome = (role: 'menu' | 'dialog') => {
  const container = document.createElement('div'); container.setAttribute('role', role);
  const button = document.createElement('button'); container.append(button); document.body.append(container); return button;
};
it('canvas Escape exits crop once without changing selection, native bytes or history; menu Escape cannot do so', async () => {
  const id = await insert('insertPicture'); render();
  const layer = owner.querySelector<HTMLDivElement>('.sl-overlay')!;
  act(() => layer.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 150, bubbles: true, cancelable: true })));
  expect(layer.dataset.cropping).toBe(id);
  const before = native(), history = editor.getHistoryStats(), selection = structuredClone(editor.selection);
  const menu = chrome('menu'); menu.focus(); act(() => key(menu, 'Escape'));
  expect(layer.dataset.cropping).toBe(id);
  act(() => key(document.body, 'Escape'));
  expect(layer.dataset.cropping).toBeUndefined();
  expect(editor.selection).toEqual(selection); expect(native()).toBe(before); expect(editor.getHistoryStats()).toEqual(history);
});
it('gradient pointer takes canvas focus and Delete removes its newly picked stop; two native undos restore exact bytes', async () => {
  const id = await insert('insertRectangle');
  await act(async () => { await editor.executeCommand('setBoxStyle', { nodeId: id, fills: [{ kind: 'linear', angle: 90,
    stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }] }); });
  render(true); const before = native();
  const panel = document.createElement('div'); panel.dataset.floatingPanel = 'true';
  const trigger = document.createElement('button'); panel.append(trigger); document.body.append(panel); trigger.focus();
  const line = owner.querySelector<SVGElement>('[data-gradient-line]')!;
  const points = () => editor.dataStore.getNode(id)!.attributes!.fills as Array<{ stops: unknown[] }>;
  await act(async () => {
    line.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 150, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 150, bubbles: true }));
    line.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 150, bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(owner.querySelector('.sl-overlay'));
  await vi.waitFor(() => expect(points()[0].stops).toHaveLength(3)); const added = native();
  await act(async () => { key(document.activeElement!, 'Delete'); });
  await vi.waitFor(() => expect(points()[0].stops).toHaveLength(2)); expect(editor.dataStore.getNode(id)).toBeDefined();
  await act(async () => { await editor.executeCommand('historyUndo'); }); expect(native()).toBe(added);
  await act(async () => { await editor.executeCommand('historyUndo'); }); expect(native()).toBe(before);
});
it('menu and dialog keep their Delete key while a gradient stop is selected', async () => {
  const id = await insert('insertRectangle');
  await act(async () => { await editor.executeCommand('setBoxStyle', { nodeId: id, fills: [{ kind: 'linear',
    stops: [{ offset: 0, color: '#ff0000' }, { offset: .5, color: '#00ff00' }, { offset: 1, color: '#0000ff' }] }] }); });
  render(true); const before = native(), history = editor.getHistoryStats();
  for (const role of ['menu', 'dialog'] as const) { const button = chrome(role); button.focus(); act(() => key(button, 'Delete')); }
  expect(native()).toBe(before); expect(editor.getHistoryStats()).toEqual(history);
});

it('Escape cancels an active crop preview before leaving crop, without a native write or history entry', async () => {
  const id = await insert('insertPicture'); render();
  const layer = owner.querySelector<HTMLDivElement>('.sl-overlay')!;
  layer.setPointerCapture = vi.fn();
  act(() => layer.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 150, bubbles: true, cancelable: true })));
  expect(layer.dataset.cropping).toBe(id);
  const before = native(), history = editor.getHistoryStats();
  const west = owner.querySelector<HTMLElement>('[data-handle="w"]')!;
  act(() => west.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 150, bubbles: true, cancelable: true })));
  act(() => layer.dispatchEvent(new MouseEvent('pointermove', { clientX: 130, clientY: 150, bubbles: true })));
  expect(native()).toBe(before);
  act(() => key(document.body, 'Escape'));
  expect(layer.dataset.cropping).toBe(id);
  act(() => layer.dispatchEvent(new MouseEvent('pointerup', { clientX: 130, clientY: 150, bubbles: true })));
  expect(native()).toBe(before); expect(editor.getHistoryStats()).toEqual(history);
  act(() => key(document.body, 'Escape'));
  expect(layer.dataset.cropping).toBeUndefined();
  expect(native()).toBe(before); expect(editor.getHistoryStats()).toEqual(history);
});
