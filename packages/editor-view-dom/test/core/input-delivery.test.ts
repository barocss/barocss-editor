import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { data, define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { registerPreCommitGuard } from '../../../model/src/index';
import { createCoreExtensions } from '../../../extensions/src/index';
import { EditorViewDOM } from '../../src/editor-view-dom';

let editor: Editor, view: EditorViewDOM, host: HTMLElement, textId: string;
const leaf = () => document.createTreeWalker(host.querySelector(`[data-bc-sid="${textId}"]`)!, NodeFilter.SHOW_TEXT).nextNode() as Text;
const selectEnd = () => {
  const text = leaf(), range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  editor.setRange({ type: 'range', startNodeId: textId, endNodeId: textId,
    startOffset: text.length, endOffset: text.length, collapsed: true });
};
const native = () => JSON.stringify(editor.exportDocument());
const gateCommands = () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const original = editor.executeCommand.bind(editor);
  vi.spyOn(editor, 'executeCommand').mockImplementation(async (...args) => {
    entered(); await gate; return original(...args);
  });
  return { release, started };
};
beforeEach(async () => {
  getGlobalRegistry().clear?.();
  define('document', element('div', {}, [slot('content')]));
  define('paragraph', element('p', {}, [slot('content')]));
  define('inline-text', element('span', {}, [data('text', '')]));
  const schema = createSchema('standard', getStandardSchemaDefinition());
  editor = new Editor({ schema, dataStore: new DataStore(undefined, schema), editable: true, extensions: createCoreExtensions() } as never);
  editor.loadDocument({ stype: 'document', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Contents' }] }] } as never, 'standard');
  const paragraph = editor.dataStore.getNode(editor.dataStore.getNode(editor.getRootId()!)!.content![0] as string)!;
  textId = paragraph.content![0] as string;
  host = document.createElement('div'); document.body.append(host);
  view = new EditorViewDOM(editor, { container: host, registry: getGlobalRegistry(), autoRender: false });
  view.render(undefined, { sync: true }); selectEnd();
  expect(await view.deliverInput(() => true)).toBe(true);
});
afterEach(() => { view.destroy(); host.remove(); editor.destroy(); vi.restoreAllMocks(); });

it.each(['observer', 'timer batch'])('awaits actual %s text delivery and preserves native history', async mode => {
  const before = native(), gate = gateCommands();
  leaf().data += '!'; selectEnd();
  if (mode === 'timer batch') await Promise.resolve();
  let finished = false;
  const delivery = view.deliverInput(() => true).then(result => { finished = true; return result; });
  await gate.started;
  expect(finished).toBe(false); expect(native()).toBe(before);
  gate.release(); expect(await delivery).toBe(true);
  expect(editor.dataStore.getNode(textId)!.text).toBe('Contents!');
  const after = native();
  expect(await editor.undo()).toBe(true); expect(native()).toBe(before);
  expect(await editor.redo()).toBe(true); expect(native()).toBe(after);
});

it.each(['false', 'reject'])('refuses a %s native mutation without erasing its DOM input', async mode => {
  const before = native();
  vi.spyOn(editor, 'executeCommand').mockImplementation(async () => {
    if (mode === 'reject') throw new Error('native refused'); return false;
  });
  leaf().data += '!'; selectEnd();
  expect(await view.deliverInput(() => true)).toBe(false);
  expect(native()).toBe(before); expect(leaf().data).toBe('Contents!');
  expect(await view.deliverInput(() => true)).toBe(false);
});

it('refuses an owner retired while real native delivery waits', async () => {
  const gate = gateCommands(); let current = true;
  leaf().data += '!'; selectEnd();
  const delivery = view.deliverInput(() => current); await gate.started;
  current = false; const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  gate.release(); expect(await delivery).toBe(false); expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});

it('refuses document replacement, even with the same root identity', async () => {
  const gate = gateCommands(); leaf().data += '!'; selectEnd();
  const delivery = view.deliverInput(() => true); await gate.started;
  editor.loadDocument(editor.exportDocument(), 'standard');
  const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  gate.release(); expect(await delivery).toBe(false); expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});

it('refuses active composition and a new composition started while delivery waits', async () => {
  const before = native();
  view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(await view.deliverInput(() => true)).toBe(false); expect(native()).toBe(before);
  view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  // Existing composition lifecycle owns this deferred clear; delivery does not wait for it.
  expect(await view.deliverInput(() => true)).toBe(false);
  await new Promise(resolve => setTimeout(resolve, 0));
  const gate = gateCommands(); leaf().data += '!'; selectEnd();
  const delivery = view.deliverInput(() => true); await gate.started;
  view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  gate.release(); expect(await delivery).toBe(false);
});

it('refuses disposal or detached DOM and keeps independent view composition separate', async () => {
  const otherHost = document.createElement('div'); document.body.append(otherHost);
  const other = new EditorViewDOM(editor, { container: otherHost, autoRender: false });
  try {
    view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(await other.deliverInput(() => true)).toBe(true);
    otherHost.remove(); expect(await other.deliverInput(() => true)).toBe(false);
  } finally { other.destroy(); otherHost.remove(); }
  view.destroy(); expect(await view.deliverInput(() => true)).toBe(false);
});

it('does not latch empty-history or selection/format no-ops before actual last input', async () => {
  view.historyUndo(); view.historyRedo();
  vi.spyOn(editor, 'executeCommand').mockResolvedValueOnce(false);
  view.toggleBold();
  expect(await view.deliverInput(() => true)).toBe(true);
  const text = leaf(), event = new InputEvent('beforeinput', { inputType: 'insertText', data: '!', bubbles: true, cancelable: true });
  Object.defineProperty(event, 'getTargetRanges', { value: () => [{ startContainer: text, endContainer: text,
    startOffset: text.length, endOffset: text.length, collapsed: true }] });
  const gate = gateCommands();
  view.contentEditableElement.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  let completed = false;
  const delivery = view.deliverInput(() => true).then(ok => { completed = true; return ok; });
  await gate.started; expect(completed).toBe(false);
  gate.release(); expect(await delivery).toBe(true);
  expect(editor.dataStore.getNode(textId)!.text).toBe('Contents!');
});

it('requires explicit owned retry for a refused native input and rejects replay after another edit', async () => {
  const original = editor.executeCommand.bind(editor);
  vi.spyOn(editor, 'executeCommand').mockResolvedValueOnce(false);
  leaf().data += '!'; selectEnd();
  expect(await view.deliverInput(() => true)).toBe(false);
  expect(await view.deliverInput(() => true)).toBe(false);
  expect(await view.retryInputDelivery(() => true)).toBe(true);
  expect(editor.dataStore.getNode(textId)!.text).toBe('Contents!');
  vi.spyOn(editor, 'executeCommand').mockResolvedValueOnce(false);
  leaf().data += '?'; selectEnd();
  expect(await view.deliverInput(() => true)).toBe(false);
  expect(await original('replaceText', { range: { type: 'range', startNodeId: textId, endNodeId: textId,
    startOffset: 0, endOffset: 0, collapsed: true }, text: '#' })).toBe(true);
  const changed = native();
  expect(await view.retryInputDelivery(() => true)).toBe(false); expect(native()).toBe(changed);
});

it.each(['deleteContentBackward', 'deleteContentForward'])('treats actual document-edge %s as a no-op then accepts normal typing', async inputType => {
  const text = leaf(), offset = inputType === 'deleteContentBackward' ? 0 : text.length;
  const range = document.createRange(); range.setStart(text, offset); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  editor.setRange({ type: 'range', startNodeId: textId, endNodeId: textId, startOffset: offset, endOffset: offset, collapsed: true });
  const before = native(), deletion = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
  view.contentEditableElement.dispatchEvent(deletion);
  expect(deletion.defaultPrevented).toBe(true);
  expect(await view.deliverInput(() => true)).toBe(true); expect(native()).toBe(before);
  selectEnd();
  const currentText = leaf(), input = new InputEvent('beforeinput', { inputType: 'insertText', data: '!', bubbles: true, cancelable: true });
  Object.defineProperty(input, 'getTargetRanges', { value: () => [{ startContainer: currentText, endContainer: currentText,
    startOffset: currentText.length, endOffset: currentText.length, collapsed: true }] });
  view.contentEditableElement.dispatchEvent(input);
  expect(await view.deliverInput(() => true)).toBe(true); expect(editor.dataStore.getNode(textId)!.text).toBe('Contents!');
});

it('keeps a genuine interior deletion failure distinct from a document-edge no-op', async () => {
  const before = native(); vi.spyOn(editor, 'executeCommand').mockResolvedValueOnce(false);
  view.contentEditableElement.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  expect(await view.deliverInput(() => true)).toBe(false); expect(native()).toBe(before);
  expect(await view.deliverInput(() => true)).toBe(false);
});

it.each(['disconnected', 'destroyed', 'editable ABA'])('prevents old text application after %s during awaited input', async mode => {
  const gate = gateCommands(); leaf().data += '!'; selectEnd();
  const delivery = view.deliverInput(() => true); await gate.started;
  if (mode === 'disconnected') host.remove();
  else if (mode === 'destroyed') view.destroy();
  else { editor.setEditable(false); editor.setEditable(true); }
  const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  gate.release(); expect(await delivery).toBe(false);
  expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});

const nativeAction = (name: string) => {
  if (name === 'Enter') view.insertParagraph();
  else if (name === 'Shift+Enter') view.insertLineBreak();
  else if (name === 'text') view.insertText('!');
  else if (name === 'selection delete') {
    const text = leaf(), range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 3);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    view.deleteSelection();
  } else {
    const data = new DataTransfer(); data.setData('text/plain', 'pasted');
    view.handlePaste(new ClipboardEvent('paste', { clipboardData: data }));
  }
};
it.each(['Enter', 'Shift+Enter', 'text', 'selection delete', 'paste'])('awaits and preserves normal native %s/history', async name => {
  const before = native(), gate = gateCommands(); nativeAction(name);
  const delivery = view.deliverInput(() => true); await gate.started;
  gate.release(); expect(await delivery).toBe(true);
  const after = native(); expect(after).not.toBe(before);
  expect(await editor.undo()).toBe(true); expect(native()).toBe(before);
  expect(await editor.redo()).toBe(true); expect(native()).toBe(after);
});
it.each(['Enter', 'Shift+Enter', 'text', 'selection delete', 'paste'])('blocks delayed native %s after same-root replacement', async name => {
  const gate = gateCommands(); nativeAction(name);
  const delivery = view.deliverInput(() => true); await gate.started;
  editor.loadDocument(editor.exportDocument(), 'standard');
  const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  gate.release(); expect(await delivery).toBe(false);
  expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});
it.each(['Enter', 'Shift+Enter', 'selection delete', 'paste'])('blocks delayed native %s after editability ABA', async name => {
  const gate = gateCommands(); nativeAction(name);
  const delivery = view.deliverInput(() => true); await gate.started;
  editor.setEditable(false); editor.setEditable(true);
  const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  gate.release(); expect(await delivery).toBe(false);
  expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});

it.each(['Enter', 'Shift+Enter', 'text', 'selection delete', 'paste'])('refuses native %s at the real awaited precommit guard after editability ABA', async name => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const enteredGuard = new Promise<void>(resolve => { entered = resolve; });
  const stop = registerPreCommitGuard(editor, async () => { entered(); await waiting; });
  const before = native(), history = JSON.stringify(editor.historyManager.getHistory());
  try {
    nativeAction(name); const delivery = view.deliverInput(() => true); await enteredGuard;
    editor.setEditable(false); editor.setEditable(true); release();
    expect(await delivery).toBe(false); expect(native()).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
  } finally { release(); stop(); }
});

it('offers an explicit retry witness only for genuine failure and retains rejected observer records', async () => {
  expect(view.hasFailedInputDelivery).toBe(false);
  expect(await view.retryInputDelivery(() => true)).toBe(false);
  const handler = (view as unknown as { inputHandler: { handleDomMutations: (records: MutationRecord[]) => Promise<void> } }).inputHandler;
  vi.spyOn(handler, 'handleDomMutations').mockRejectedValueOnce(new Error('observer refused'));
  const before = native(); leaf().data += '!'; selectEnd();
  expect(await view.deliverInput(() => true)).toBe(false);
  expect(view.hasFailedInputDelivery).toBe(true); expect(native()).toBe(before); expect(leaf().data).toBe('Contents!');
  expect(await view.retryInputDelivery(() => false)).toBe(false);
  expect(view.hasFailedInputDelivery).toBe(true);
  expect(await view.retryInputDelivery(() => true)).toBe(true);
  expect(editor.dataStore.getNode(textId)!.text).toBe('Contents!'); expect(view.hasFailedInputDelivery).toBe(false);
  expect(await view.retryInputDelivery(() => true)).toBe(false);
});
