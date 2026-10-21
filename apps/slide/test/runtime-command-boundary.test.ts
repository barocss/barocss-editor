// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createSampleDeck, deckFileText } from '@barocss/office-slides';
import { createSlidesRuntime } from '../src/runtime';
const document = () => JSON.parse(deckFileText(createSampleDeck())).document;
const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(yes => { resolve = yes; });
  return { promise, resolve };
};
it('waits an actual registered command and refuses a root replacement or disposal', async () => {
  const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document(), editable: true });
  const held = deferred();
  runtime.editor.registerCommand({ name: 'held-native-input', execute: () => held.promise, canExecute: () => true });
  try {
    const command = runtime.editor.executeCommand('held-native-input', {});
    let done = false;
    const settlement = runtime.settleCommands(() => true).then(value => { done = true; return value; });
    expect(done).toBe(false);
    runtime.loadNativeDocument(document());
    held.resolve(true);
    expect(await command).toBe(true);
    expect(await settlement).toBe(false);
    expect(await runtime.settleCommands(() => true)).toBe(true);
    runtime.dispose();
    expect(await runtime.settleCommands(() => true)).toBe(false);
  } finally { runtime.dispose(); }
});
it('settles actual native commands and refuses a rejected native command', async () => {
  const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document(), editable: true });
  const held = deferred(), order: string[] = [];
  runtime.editor.registerCommand({ name: 'held', execute: async () => { order.push('start'); await held.promise; order.push('end'); return true; }, canExecute: () => true });
  try {
    const first = runtime.editor.executeCommand('held', {});
    const result = runtime.settleCommands(() => true);
    held.resolve(true);
    expect(await first).toBe(true);
    expect(await result).toBe(true);
    expect(order).toEqual(['start', 'end']);
    runtime.editor.registerCommand({ name: 'reject', execute: () => { throw new Error('failed'); }, canExecute: () => true });
    await runtime.editor.executeCommand('reject', {}).catch(() => false);
    expect(await runtime.settleCommands(() => true)).toBe(false);
    const recovery = runtime.commandFailure()!;
    expect(recovery.error).toBeInstanceOf(Error);
    expect(recovery.acknowledge(() => true)).toBe(true);
    expect(await runtime.settleCommands(() => true)).toBe(true);
  } finally { runtime.dispose(); }
});

it('does not attribute an old native command error to a replacement document', async () => {
  const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document(), editable: true });
  const held = deferred();
  runtime.editor.registerCommand({ name: 'retired', execute: async () => { await held.promise; throw new Error('retired failure'); }, canExecute: () => true });
  try {
    const command = runtime.editor.executeCommand('retired', {});
    const settlement = runtime.settleCommands(() => true);
    runtime.loadNativeDocument(document());
    held.resolve(true);
    expect(await command).toBe(false);
    expect(await settlement).toBe(false);
    expect(runtime.commandFailure()).toBeUndefined();
    expect(await runtime.settleCommands(() => true)).toBe(true);
  } finally { runtime.dispose(); }
});
it('refuses ambiguous overlapping error ownership until exact explicit recovery', async () => {
  const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document(), editable: true });
  const first = deferred(), second = deferred(), payload = {};
  let calls = 0;
  runtime.editor.registerCommand({ name: 'overlap', execute: async () => {
    if (++calls === 1) { await first.promise; throw new Error('ambiguous native failure'); }
    await second.promise; return true;
  }, canExecute: () => true });
  try {
    const old = runtime.editor.executeCommand('overlap', payload);
    runtime.loadNativeDocument(document());
    const current = runtime.editor.executeCommand('overlap', payload);
    first.resolve(true);
    expect(await old).toBe(false);
    const recovery = runtime.commandFailure()!;
    expect(recovery.acknowledge(() => true)).toBe(false);
    second.resolve(true);
    expect(await current).toBe(true);
    expect(await runtime.settleCommands(() => true)).toBe(false);
    expect(recovery.acknowledge(() => true)).toBe(true);
    expect(await runtime.settleCommands(() => true)).toBe(true);
  } finally { runtime.dispose(); }
});
