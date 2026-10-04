import { afterEach, beforeEach, expect, it } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createSiteEditor } from '../src/site-kit';
import { createSampleSite } from '../src/sample-site';

let editor: ReturnType<typeof createSiteEditor>, bodyId: string;
const blocks = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Retained body from Note' }] }];
const native = () => JSON.stringify(editor.exportDocument());
const history = () => JSON.stringify(editor.historyManager.getHistory());
beforeEach(() => {
  editor = createSiteEditor(); editor.loadDocument(createSampleSite(), 'rich-text-ownership');
  bodyId = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'richText' && node.attributes?.id === '요약-스택')!.sid!;
});
afterEach(() => editor.destroy());

it.each(['public default', 'owned input'])('preserves normal %s setRichText and its native undo/redo', async mode => {
  const before = native();
  expect(await editor.executeCommand('setRichText', { nodeId: bodyId, blocks,
    ...(mode === 'owned input' ? { canApply: () => true } : {}) })).toBe(true);
  const after = native(); expect(after).toContain('Retained body from Note'); expect(after).not.toBe(before);
  expect(await editor.undo()).toBe(true); expect(native()).toBe(before);
  expect(await editor.redo()).toBe(true); expect(native()).toBe(after);
});

it('refuses an already retired input owner without changing native body or history', async () => {
  const before = native(), priorHistory = history();
  expect(await editor.executeCommand('setRichText', { nodeId: bodyId, blocks, canApply: () => false })).toBe(false);
  expect(native()).toBe(before); expect(history()).toBe(priorHistory);
});

it.each(['same-root reload', 'authority ABA', 'external owner retired', 'target replaced'])('refuses actual delayed precommit setRichText after %s', async mode => {
  let release!: () => void, entered!: () => void, current = true;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const stop = registerPreCommitGuard(editor, async () => { entered(); await waiting; });
  try {
    const pending = editor.executeCommand('setRichText', { nodeId: bodyId, blocks, canApply: () => current });
    await started;
    if (mode === 'same-root reload') { const root = editor.getRootId(); editor.loadDocument(editor.exportDocument(), 'rich-text-ownership'); expect(editor.getRootId()).toBe(root); }
    else if (mode === 'authority ABA') { editor.setEditable(false); editor.setEditable(true); }
    else if (mode === 'target replaced') {
      const held = editor.dataStore.getNode(bodyId)!;
      expect(editor.dataStore.updateNode(bodyId, { attributes: { ...held.attributes, id: 'replacement-body' } })?.valid).toBe(true);
    } else current = false;
    const replacement = native(), replacementHistory = history();
    release(); expect(await pending).toBe(false);
    expect(native()).toBe(replacement); expect(history()).toBe(replacementHistory);
  } finally { release(); stop(); }
});


it('accepts a real awaited precommit when body and authority still belong to the captured owner', async () => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const stop = registerPreCommitGuard(editor, async () => { entered(); await waiting; });
  const before = native(), priorHistory = history();
  try {
    const pending = editor.executeCommand('setRichText', { nodeId: bodyId, blocks, canApply: () => true });
    await started; expect(native()).toBe(before); expect(history()).toBe(priorHistory);
    release(); expect(await pending).toBe(true); expect(native()).toContain('Retained body from Note');
  } finally { release(); stop(); }
});
