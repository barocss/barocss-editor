// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { usePropertyCommand } from '../src/use-property-command';

let root: Root;
let commands: ReturnType<typeof usePropertyCommand>;
const deferred = () => {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const makeEditor = () => ({ getRootId: vi.fn(() => 'document-a'), isEditable: true,
  executeCommand: vi.fn(async (_name: string, _payload: Record<string, unknown>) => true) });
function Harness({ editor, context }: { editor: ReturnType<typeof makeEditor>; context: string }) {
  commands = usePropertyCommand(editor as unknown as Editor, context);
  return null;
}
const render = async (editor: ReturnType<typeof makeEditor>, context = 'shape-a') => {
  await act(async () => { root.render(createElement(Harness, { editor, context })); });
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });

it('serializes a multi-command gesture and retries the failed payload', async () => {
  const editor = makeEditor(), first = deferred();
  editor.executeCommand.mockImplementationOnce(() => first.promise);
  await render(editor);
  await act(async () => { commands.run('width', { value: 10 }); commands.run('height', { value: 20 }); });
  expect(editor.executeCommand).toHaveBeenCalledTimes(1); expect(commands.busy).toBe(true);
  await act(async () => first.resolve(false));
  expect(editor.executeCommand).toHaveBeenCalledTimes(2); expect(commands.busy).toBe(false); expect(commands.failed).toBe(true);
  await act(async () => commands.retry());
  expect(editor.executeCommand).toHaveBeenLastCalledWith('width', { value: 10 });
  expect(commands.failed).toBe(false);
});

for (const change of ['selection', 'document', 'editor', 'return-to-selection'] as const) {
  it(`retires pending work and old feedback on ${change} change`, async () => {
    const old = makeEditor(), pending = deferred();
    old.executeCommand.mockImplementationOnce(() => pending.promise);
    await render(old);
    await act(async () => { commands.run('first', { id: 'a' }); commands.run('stale', { id: 'a' }); });
    const staleApi = commands;
    let next = old;
    if (change === 'editor') next = makeEditor();
    if (change === 'document') old.getRootId.mockReturnValue('document-b');
    await render(next, change.includes('selection') ? 'shape-b' : 'shape-a');
    if (change === 'return-to-selection') await render(next, 'shape-a');
    expect(commands.busy).toBe(false); expect(commands.failed).toBe(false);
    await act(async () => { staleApi.run('stale-handler', {}); commands.run('current', { id: 'b' }); });
    expect(commands.busy).toBe(true);
    await act(async () => pending.reject(new Error('Old request failed')));
    expect(old.executeCommand.mock.calls.map(call => call[0])).not.toContain('stale');
    expect(old.executeCommand.mock.calls.map(call => call[0])).not.toContain('stale-handler');
    expect(next.executeCommand).toHaveBeenLastCalledWith('current', { id: 'b' });
    expect(commands.busy).toBe(false); expect(commands.failed).toBe(false);
    const count = next.executeCommand.mock.calls.length;
    await act(async () => staleApi.retry());
    expect(next.executeCommand).toHaveBeenCalledTimes(count);
  });
}

it('does not start queued work after unmount', async () => {
  const editor = makeEditor(), pending = deferred();
  editor.executeCommand.mockImplementationOnce(() => pending.promise);
  await render(editor);
  await act(async () => { commands.run('first', {}); commands.run('queued', {}); });
  await act(async () => root.render(null));
  await act(async () => pending.resolve(true));
  expect(editor.executeCommand).toHaveBeenCalledTimes(1);
});

it('reports read-only refusal without executing and can retry after editing is allowed', async () => {
  const editor = makeEditor(); editor.isEditable = false;
  await render(editor);
  await act(async () => commands.run('width', { value: 12 }));
  expect(editor.executeCommand).not.toHaveBeenCalled(); expect(commands.failed).toBe(true);
  editor.isEditable = true;
  await act(async () => commands.retry());
  expect(editor.executeCommand).toHaveBeenCalledWith('width', { value: 12 }); expect(commands.failed).toBe(false);
});

it('does not revive a failed retry when returning to an earlier target', async () => {
  const editor = makeEditor(); editor.executeCommand.mockResolvedValueOnce(false);
  await render(editor);
  await act(async () => commands.run('width', { id: 'a', value: 12 }));
  expect(commands.failed).toBe(true);
  const old = commands;
  await render(editor, 'shape-b'); await render(editor, 'shape-a');
  expect(commands.failed).toBe(false);
  await act(async () => old.retry());
  expect(editor.executeCommand).toHaveBeenCalledTimes(1);
});
