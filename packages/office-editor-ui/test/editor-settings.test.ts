// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { useEditorSettings } from '../src/use-editor-settings';

let root: Root;
let settings: ReturnType<typeof useEditorSettings<{ width: number }>>;
const onClose = vi.fn();
const editor = () => ({ getRootId: vi.fn(() => 'root-a'), isEditable: true,
  selection: { type: 'node', nodeIds: ['a'] }, width: 10 });
function Harness({ model, open, context }: { model: ReturnType<typeof editor>; open: boolean; context: string }) {
  settings = useEditorSettings(model as unknown as Editor, open, () => ({ width: model.width }), onClose,
    { context, isEqual: (a, b) => a.width === b.width });
  return null;
}
const render = async (model: ReturnType<typeof editor>, open = true, context = 'target') => {
  await act(async () => root.render(createElement(Harness, { model, open, context })));
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); onClose.mockReset();
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });

it('keeps the initial selection, skips unchanged writes and reopens with a fresh draft', async () => {
  const model = editor(), operation = vi.fn(async () => true);
  await render(model);
  model.selection.nodeIds.push('b');
  expect(settings.selection).toEqual({ type: 'node', nodeIds: ['a'] });
  await act(async () => { settings.setState({ width: 12 }); settings.setState({ width: 10 }); });
  await act(async () => settings.apply(operation));
  expect(operation).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => settings.setState({ width: 20 }));
  await render(model, false); model.width = 30; await render(model);
  expect(settings.state.width).toBe(30);
});

it('blocks duplicate apply, editing and close while pending, then preserves draft on failure', async () => {
  const model = editor(); let resolve!: (value: boolean) => void;
  const operation = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  await render(model); await act(async () => settings.setState({ width: 12 }));
  await act(async () => { void settings.apply(operation); void settings.apply(operation); settings.close(); settings.setState({ width: 50 }); });
  expect(settings.busy).toBe(true); expect(operation).toHaveBeenCalledTimes(1); expect(onClose).not.toHaveBeenCalled();
  await act(async () => resolve(false));
  expect(settings.state.width).toBe(12); expect(settings.problem).toContain('입력한 값은 유지'); expect(settings.busy).toBe(false);
  await act(async () => settings.apply(async () => true));
  expect(onClose).toHaveBeenCalledTimes(1); expect(settings.problem).toBe('');
});

for (const change of ['document', 'editor', 'reopen', 'context'] as const) {
  it(`ignores old handlers and completion after ${change}`, async () => {
    let model = editor(); let resolve!: (value: boolean) => void;
    await render(model); await act(async () => settings.setState({ width: 12 }));
    await act(async () => { void settings.apply(() => new Promise(done => { resolve = done; })); });
    const old = settings;
    if (change === 'editor') model = editor();
    if (change === 'document') model.getRootId.mockReturnValue('root-b');
    if (change === 'reopen') await render(model, false);
    await render(model, true, change === 'context' ? 'other' : 'target');
    await act(async () => { resolve(true); old.setState({ width: 90 }); old.close(); });
    expect(settings.state.width).toBe(10); expect(settings.busy).toBe(false); expect(settings.problem).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });
}

it('refuses changes in read-only mode without losing the draft', async () => {
  const model = editor(); model.isEditable = false;
  await render(model); await act(async () => settings.setState({ width: 12 }));
  const operation = vi.fn(async () => true);
  await act(async () => settings.apply(operation));
  expect(operation).not.toHaveBeenCalled(); expect(settings.state.width).toBe(12); expect(settings.problem).not.toBe('');
  await act(async () => settings.close()); expect(onClose).toHaveBeenCalledTimes(1);
});

it('can reapply an action even when its settings are unchanged', async () => {
  await render(editor());
  const operation = vi.fn(async () => true);
  await act(async () => settings.apply(operation, { skipUnchanged: false }));
  expect(operation).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
