import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { useTemplateStart } from '../src/use-template-start';

let root: Root;
let state: ReturnType<typeof useTemplateStart>;
const closed = vi.fn(), opened = vi.fn();
const makeEditor = () => ({ getRootId: vi.fn(() => 'first'), loadDocument: vi.fn() });
let model = makeEditor();
let save: () => Promise<boolean>;
function Harness({ open }: { open: boolean }) {
  state = useTemplateStart(model as unknown as Editor, open, closed, opened, save);
  return null;
}
const render = async (open = true) => { await act(async () => root.render(createElement(Harness, { open }))); };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  closed.mockClear(); opened.mockClear(); model = makeEditor(); save = async () => true;
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });

it('locks duplicate start, selection and cancel during save; retries a failed save', async () => {
  let resolve!: (value: boolean) => void;
  save = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  await render(); await act(async () => state.setChosen('report'));
  await act(async () => { void state.start(); void state.start(); state.close(); state.setChosen('talk'); });
  expect(state.busy).toBe(true); expect(state.chosen).toBe('report'); expect(save).toHaveBeenCalledTimes(1);
  expect(closed).not.toHaveBeenCalled();
  await act(async () => resolve(false));
  expect(state.problem).not.toBe(''); expect(state.chosen).toBe('report'); expect(model.loadDocument).not.toHaveBeenCalled();
  save = async () => true; await render();
  model.loadDocument.mockImplementation(() => { model.getRootId.mockReturnValue('new'); });
  await act(async () => state.start());
  expect(model.loadDocument).toHaveBeenCalledTimes(1); expect(closed).toHaveBeenCalledTimes(1); expect(opened).toHaveBeenCalledTimes(1);
});

for (const change of ['document', 'editor', 'reopen'] as const) {
  it(`does not replace another session after ${change} during save`, async () => {
    let resolve!: (value: boolean) => void;
    save = () => new Promise<boolean>(done => { resolve = done; });
    await render(); const original = model;
    await act(async () => { void state.start(); });
    if (change === 'document') model.getRootId.mockReturnValue('other');
    if (change === 'editor') model = makeEditor();
    if (change === 'reopen') await render(false);
    await render(); await act(async () => resolve(true));
    expect(original.loadDocument).not.toHaveBeenCalled(); expect(model.loadDocument).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled(); expect(state.busy).toBe(false);
  });
}

it('keeps load errors in the dialog and clears them on reopening', async () => {
  await render(); model.loadDocument.mockImplementation(() => { throw new Error('Failed'); });
  await act(async () => state.start());
  expect(state.problem).not.toBe(''); expect(state.busy).toBe(false); expect(closed).not.toHaveBeenCalled();
  await render(false); await render(); expect(state.problem).toBe('');
});
