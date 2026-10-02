import { afterEach, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { registerPreCommitGuard } from '@barocss/model';
import { createStarterDocument, createWordFeedbackHost, wordFileText } from '../src/index';
import { mountWordRuntime, type WordRuntime } from '../../../apps/word/src/runtime';
import { createParagraphProposalSample, PARAGRAPH_PROPOSAL_SAMPLE } from '../../../apps/word/src/paragraph-proposal-sample';
import { previewConnectedWordRevision } from '../src/connected-proposal';

let runtime: WordRuntime | undefined, surface: HTMLDivElement | undefined;
afterEach(() => { runtime?.dispose(); surface?.remove(); vi.restoreAllMocks(); });
async function fixture() {
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
    captureSelection: () => editor.selection, nativeDocument: () => runtime!.exportNativeDocument() });
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
