import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { registerPreCommitGuard } from '@barocss/model';
import { createStarterDocument, createWordFeedbackHost, wordFileText } from '../src/index';
import { mountWordRuntime, type WordRuntime } from '../../../apps/word/src/runtime';
import { createParagraphProposalSample, PARAGRAPH_PROPOSAL_SAMPLE } from '../../../apps/word/src/paragraph-proposal-sample';
import { previewConnectedWordRevision } from '../src/connected-proposal';

let runtime: WordRuntime | undefined, surface: HTMLDivElement | undefined;
afterEach(() => { runtime?.dispose(); surface?.remove(); vi.restoreAllMocks(); });
async function fixture(strictRevision = false) {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  surface = document.createElement('div'); document.body.append(surface);
  const source = createParagraphProposalSample();
  // The real product creates its resource catalog before it accepts native comments.
  const resources = createStarterDocument().content!.find(one => typeof one !== 'string' && one.stype === 'resources')!;
  source.content.push(resources as never);
  runtime = mountWordRuntime(surface, { initialDocument: source, editable: true });
  const editor = runtime.editor;
  const node = [...editor.dataStore.getNodes().values()].find(one => one.text === PARAGRAPH_PROPOSAL_SAMPLE.original)!;
  editor.updateSelection({ type: 'range', startNodeId: node.sid!, endNodeId: node.sid!, startOffset: 0, endOffset: node.text!.length, collapsed: false });
  const host = createWordFeedbackHost({ editor, id: () => 'original-word', canComment: () => true,
    captureSelection: () => editor.selection, nativeDocument: () => runtime!.exportNativeDocument(),
    captureRevisionIntent: strictRevision ? () => runtime!.captureInputIntent({ selection: true }) : undefined });
  const target = host.capture()!;
  expect(target).not.toBeNull(); await host.comment(target, '앱이 켜져 있을 때의 조치도 안내해주세요.');
  const before = runtime.exportNativeDocument(), expected = structuredClone(before) as Record<string, unknown>;
  const replacement = '설치 전에 Wonffice를 종료하세요. 저장 중이면 저장을 확인한 다음 종료하고 설치를 다시 시작하세요.';
  let changes = 0;
  const change = (value: unknown): void => {
    const one = value as Record<string, unknown>;
    if (one.text === PARAGRAPH_PROPOSAL_SAMPLE.original) {
      one.text = replacement; const marks = one.marks as { range: number[] }[];
      expect(marks).toHaveLength(1); marks[0].range = [0, replacement.length]; changes++;
    }
    if (Array.isArray(one.content)) one.content.forEach(change);
  };
  change(expected); expect(changes).toBe(1);
  return { editor, host, target, before, expected, node,
    proposal: { targetId: target.id, replacement, snapshotText: wordFileText(before, ''), expectedSnapshotText: wordFileText(expected, '') } };
}
async function linkedPointFixture(extraSibling = false, metadataBearing = false) {
  vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  surface = document.createElement('div'); document.body.append(surface);
  const linked = JSON.parse(readFileSync(resolve(process.cwd(), '../../apps/office-service/test/fixtures/criterion-confirmation-word.json'), 'utf8')) as {
    document: { metadata: Record<string, unknown>; content: unknown[] }
  };
  const source = structuredClone(linked.document);
  if (metadataBearing) {
    let decorated = 0;
    const decorate = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const one = value as Record<string, unknown>;
      if (one.stype === 'inline-text' && one.text === 'Store exact rich reference.') {
        one.metadata = { nativeRun: { author: 'pinned', ordinal: 7 } }; decorated++;
      }
      if (Array.isArray(one.content)) one.content.forEach(decorate);
    };
    decorate(source); expect(decorated).toBe(1);
  }
  if (extraSibling) {
    const flow = source.content[0] as { content: Array<{ content: unknown[] }> };
    flow.content[1].content.push({ stype: 'inline-text', text: 'Unselected sibling' });
  }
  const resources = createStarterDocument().content!.find(one => typeof one !== 'string' && one.stype === 'resources')!;
  source.content.push(resources);
  runtime = mountWordRuntime(surface, { initialDocument: source, editable: true });
  const editor = runtime.editor;
  const node = [...editor.dataStore.getNodes().values()].find(one => one.text === 'Store exact rich reference.')!;
  editor.updateSelection({ type: 'range', startNodeId: node.sid!, endNodeId: node.sid!,
    startOffset: 0, endOffset: node.text!.length, collapsed: false });
  const host = createWordFeedbackHost({ editor, id: () => 'pinned-word', canComment: () => true,
    captureSelection: () => editor.selection, nativeDocument: () => runtime!.exportNativeDocument() });
  const target = host.capture()!;
  expect(target).not.toBeNull();
  await host.comment(target, 'Review this pinned decision.');
  const before = runtime.exportNativeDocument() as Record<string, unknown>;
  const expected = structuredClone(before);
  const replacement = 'Store the reviewed decision.';
  let changed = 0;
  const change = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const one = value as Record<string, unknown>;
    if (one.text === target.quote && Array.isArray(one.marks) &&
      one.marks.some(mark => mark?.stype === 'commentRef' && mark.attrs?.id === target.id)) {
      one.text = replacement;
      one.marks[0].range = [0, replacement.length];
      changed++;
    }
    if (Array.isArray(one.content)) one.content.forEach(change);
  };
  change(expected); expect(changed).toBe(1);
  const proposal = { targetId: target.id, replacement, snapshotText: wordFileText(before, ''),
    expectedSnapshotText: wordFileText(expected, '') };
  return { editor, host, before, expected, proposal };
}
it('applies one complete commented run beside the pinned decision bookmark without changing the business pair', async () => {
  const { editor, host, before, expected, proposal } = await linkedPointFixture();
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  expect(preview.current()).toBe(true);
  const applied = await preview.apply();
  expect(runtime!.exportNativeDocument()).toEqual(expected);
  expect(applied).toBe(true);
  expect(await editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(expected);
  runtime!.loadNativeDocument(expected); expect(runtime!.exportNativeDocument()).toEqual(expected);
  preview.dispose(); host.dispose();
});
it('keeps an authored metadata-bearing point-bookmark run in the complete native document and history', async () => {
  const { editor, host, before, expected, proposal } = await linkedPointFixture(false, true);
  expect(JSON.stringify(before)).toContain('nativeRun');
  expect(JSON.stringify(expected)).toContain('nativeRun');
  const node = [...editor.dataStore.getNodes().values()].find(one => one.text === 'Store exact rich reference.')!;
  const originalId = node.sid!;
  const originalMetadata = structuredClone(node.metadata);
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await preview.apply()).toBe(true);
  expect(runtime!.exportNativeDocument()).toEqual(expected);
  expect(editor.dataStore.getNode(originalId)?.metadata).toEqual(originalMetadata);
  expect(editor.dataStore.getNode(originalId)?.text).toBe(proposal.replacement);
  expect(await editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(expected);
  runtime!.loadNativeDocument(expected); expect(runtime!.exportNativeDocument()).toEqual(expected);
  preview.dispose(); host.dispose();
});
it('refuses a metadata-bearing point-bookmark edit when authority changes while its native transaction is queued', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  const history = editor.getHistoryStats();
  let authorized = true;
  const preview = previewConnectedWordRevision({ editor, proposal,
    nativeDocument: () => runtime!.exportNativeDocument(), current: () => authorized })!;
  expect(preview).not.toBeNull();
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const applying = preview.apply(); await waiting; authorized = false; finish();
  expect(await applying).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  off(); preview.dispose(); host.dispose();
});
it('checks the metadata-bearing point-bookmark candidate under the existing native commit guard', async () => {
  const { editor, host, before, expected, proposal } = await linkedPointFixture(false, true);
  const node = [...editor.dataStore.getNodes().values()].find(one => one.text === 'Store exact rich reference.')!;
  let checked = false;
  const off = registerPreCommitGuard(editor, async ({ candidate }) => {
    checked = true;
    const run = candidate.getNode(node.sid!);
    expect(run?.text).toBe(proposal.replacement);
    expect(run?.metadata).toEqual(node.metadata);
  });
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await preview.apply()).toBe(true);
  expect(checked).toBe(true);
  expect(runtime!.exportNativeDocument()).toEqual(expected);
  off();
  expect(await editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(expected);
  preview.dispose(); host.dispose();
});
it('reports a committed metadata edit as unconfirmed when the postcommit host changes', async () => {
  const { editor, host, before, expected, proposal } = await linkedPointFixture(false, true);
  const preview = previewConnectedWordRevision({ editor, proposal,
    nativeDocument: () => runtime!.exportNativeDocument(), current: () => true, afterCommitCurrent: () => false })!;
  expect(preview).not.toBeNull();
  expect(runtime!.exportNativeDocument()).toEqual(before);
  await expect(preview.apply()).rejects.toThrow('edit committed');
  expect(runtime!.exportNativeDocument()).toEqual(expected);
  expect(await editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(before);
  preview.dispose(); host.dispose();
});
it('refuses a foreign root object with the same identity and native bytes before a metadata edit', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  const history = editor.getHistoryStats();
  const root = editor.dataStore.getNode(editor.getRootId()!)!;
  editor.dataStore.setNode({ ...root }, false);
  expect(editor.dataStore.getNode(root.sid!)).not.toBe(root);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(await preview.apply()).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  preview.dispose(); host.dispose();
});
it('refuses a same-byte foreign root replacement while a metadata edit awaits the native guard', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  const history = editor.getHistoryStats();
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const applying = preview.apply(); await waiting;
  const root = editor.dataStore.getNode(editor.getRootId()!)!;
  editor.dataStore.setNode({ ...root }, false);
  expect(editor.dataStore.getNode(root.sid!)).not.toBe(root);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  finish();
  expect(await applying).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  off(); preview.dispose(); host.dispose();
});
it('refuses metadata editing after a queued role A-B-A while keeping the original native document', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  let role = true, generation = 0;
  const guardedHost = createWordFeedbackHost({ editor, id: () => 'pinned-word', canComment: () => role,
    captureSelection: () => editor.selection, nativeDocument: () => runtime!.exportNativeDocument(),
    captureRevisionIntent: () => { const captured = generation; return () => generation === captured; } });
  const preview = guardedHost.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  const history = editor.getHistoryStats();
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const applying = preview.apply(); await waiting;
  role = false; generation++; role = true; generation++; finish();
  expect(await applying).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  off(); preview.dispose(); guardedHost.dispose(); host.dispose();
});
it('refuses metadata editing after queued composition input A-B-A without changing the original', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  const inputHost = createWordFeedbackHost({ editor, id: () => 'pinned-word', canComment: () => true,
    captureSelection: () => editor.selection, nativeDocument: () => runtime!.exportNativeDocument(),
    captureInputIntent: () => runtime!.captureInputIntent() });
  const preview = inputHost.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  const history = editor.getHistoryStats();
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const applying = preview.apply(); await waiting;
  surface!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  surface!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); finish();
  expect(await applying).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  off(); preview.dispose(); inputHost.dispose(); host.dispose();
});
it('refuses a failed native guard for a metadata-bearing point run without an edit or history entry', async () => {
  const { editor, host, before, proposal } = await linkedPointFixture(false, true);
  const history = editor.getHistoryStats();
  const off = registerPreCommitGuard(editor, () => 'The authenticated document changed');
  const preview = host.previewRevision!(proposal)!;
  expect(preview).not.toBeNull();
  expect(await preview.apply()).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(before);
  expect(editor.getHistoryStats()).toEqual(history);
  off(); preview.dispose(); host.dispose();
});
it('refuses a second text run beside the pinned decision bookmark without changing the source', async () => {
  const { host, before, proposal } = await linkedPointFixture(true);
  expect(host.previewRevision!(proposal)).toBeNull();
  expect(runtime!.exportNativeDocument()).toEqual(before);
  host.dispose();
});
it('validates a supplied delta on the actual native Word original, then exact undo/redo and reopen', async () => {
  const f = await fixture();
  const ids = [...f.editor.dataStore.getNodes().keys()];
  const preview = f.host.previewRevision!(f.proposal)!; expect(preview).not.toBeNull();
  expect(runtime!.exportNativeDocument()).toEqual(f.before);
  const applied = await preview.apply(); expect(runtime!.exportNativeDocument()).toEqual(f.expected); expect(applied).toBe(true);
  expect([...f.editor.dataStore.getNodes().keys()].sort()).toEqual(ids.sort());
  for (let repeat = 0; repeat < 2; repeat++) {
    expect(await f.editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(f.before);
    expect(await f.editor.redo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(f.expected);
  }
  runtime!.loadNativeDocument(f.expected); expect(runtime!.exportNativeDocument()).toEqual(f.expected);
  expect(f.host.locate(f.target)).toBe('located'); preview.dispose(); f.host.dispose();
});
it('refuses altered expected neighbors and stale selection ABA without overwriting the original', async () => {
  const f = await fixture();
  const changed = JSON.parse(f.proposal.expectedSnapshotText); changed.document.metadata = { unapproved: true };
  expect(f.host.previewRevision!({ ...f.proposal, expectedSnapshotText: JSON.stringify(changed) })).toBeNull();
  const preview = f.host.previewRevision!(f.proposal)!;
  const selection = structuredClone(f.editor.selection)!;
  if (selection.type !== 'range') throw new Error('range required');
  f.editor.updateSelection({ ...selection, startOffset: 1 }); f.editor.updateSelection(selection);
  expect(await preview.apply()).toBe(false); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  preview.dispose(); f.host.dispose();
});
it('checks the frozen authority after an awaited existing precommit guard', async () => {
  const f = await fixture(); let authorized = true;
  const preview = previewConnectedWordRevision({ editor: f.editor, proposal: f.proposal,
    nativeDocument: () => runtime!.exportNativeDocument(), current: () => authorized })!;
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(f.editor, async () => { entered(); await gate; });
  const apply = preview.apply(); await waiting; authorized = false; finish();
  expect(await apply).toBe(false); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  off(); preview.dispose(); f.host.dispose();
});
it('refuses active composition and input ABA during an awaited native guard', async () => {
  const f = await fixture();
  const host = createWordFeedbackHost({ editor: f.editor, id: () => 'original-word', canComment: () => true,
    captureSelection: () => f.editor.selection, nativeDocument: () => runtime!.exportNativeDocument(),
    captureInputIntent: () => runtime!.captureInputIntent() });
  surface!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(host.previewRevision!(f.proposal)).toBeNull(); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  surface!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  const preview = host.previewRevision!(f.proposal)!; expect(preview).not.toBeNull();
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(f.editor, async () => { entered(); await gate; });
  const applying = preview.apply(); await waiting;
  surface!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  surface!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); finish();
  expect(await applying).toBe(false); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  off(); preview.dispose(); host.dispose(); f.host.dispose();
});
it('refuses account generation ABA while queued under the existing native transaction', async () => {
  const f = await fixture(); let epoch = 0;
  const captured = epoch;
  const preview = f.host.previewRevision!(f.proposal, () => epoch === captured)!;
  const lock = await f.editor.dataStore.acquireLock('foreign-operation');
  const applying = preview.apply(); epoch++; epoch++;
  f.editor.dataStore.releaseLock(lock);
  expect(await applying).toBe(false); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  preview.dispose(); f.host.dispose();
});


it('retires a revision intent on raw DOM selection before debounced model selection arrives', async () => {
  const f = await fixture(), native = runtime!.exportNativeDocument(), model = structuredClone(f.editor.selection);
  const text = document.createTextNode('DOM selection guard'); surface!.append(text);
  const selection = document.getSelection()!; selection.setBaseAndExtent(text, 0, text, text.length);
  const intent = runtime!.captureInputIntent({ selection: true })!; expect(intent()).toBe(true);
  selection.collapse(text, text.length);
  expect(f.editor.selection).toEqual(model); expect(intent()).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(native); f.host.dispose();
});
it('retires revision selection gestures even when a rapid DOM caret ABA ends at its original range', async () => {
  const f = await fixture(), native = runtime!.exportNativeDocument(), model = structuredClone(f.editor.selection);
  const text = document.createTextNode('DOM gesture guard'); surface!.append(text);
  const selection = document.getSelection()!; selection.setBaseAndExtent(text, 0, text, text.length);
  const intent = runtime!.captureInputIntent({ selection: true })!;
  surface!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  selection.collapse(text, text.length); selection.setBaseAndExtent(text, 0, text, text.length);
  expect(f.editor.selection).toEqual(model); expect(intent()).toBe(false);
  expect(runtime!.exportNativeDocument()).toEqual(native); f.host.dispose();
});

it('accepts the exact owned native delta when its committed render changes DOM selection, preserving whole document history', async () => {
  const f = await fixture(true), text = document.createTextNode('owned render'); surface!.append(text);
  const selection = document.getSelection()!; selection.setBaseAndExtent(text, 0, text, text.length);
  const preview = f.host.previewRevision!(f.proposal)!; expect(preview.current()).toBe(true);
  // The real DOM renderer updates the caret after the validated native commit.
  // This observation changes no input/gesture/authority epoch.
  const render = () => selection.collapse(text, text.length);
  f.editor.on('editor:content.change', render);
  expect(await preview.apply()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(f.expected);
  f.editor.off('editor:content.change', render);
  expect(await f.editor.undo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(f.before);
  expect(await f.editor.redo()).toBe(true); expect(runtime!.exportNativeDocument()).toEqual(f.expected);
  preview.dispose(); f.host.dispose();
});
