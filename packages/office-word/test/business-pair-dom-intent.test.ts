import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { registerPreCommitGuard } from '@barocss/model';
import { mountWordRuntime } from '../../../apps/word/src/runtime';
import { captureBusinessPairIntent } from '../../../apps/word/src/business-pair-intent';
import { createBusinessPair } from '../src/business-pair';
import { prepareBusinessPairWrite } from '../src/business-pair-write';
import { createStarterDocument } from '../src/starter-document';
import { wordFileText } from '../src/word-file';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function fixture() {
  const source = createStarterDocument();
  const surface = source.content!.find(node => typeof node !== 'string' && node.stype === 'surface');
  if (!surface || typeof surface === 'string') throw new Error('Missing native surface');
  surface.content = [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Fictional requirement A.' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Fictional decision B.' }] },
  ];
  // jsdom has no page layout. Stub rendering only; use the real Word runtime,
  // browser Selection/Range and existing DOM→model converter on native SID spans.
  const render = vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true });
  const runs = runtime.editor.dataStore.getAllNodes().filter(node => node.stype === 'inline-text' && /^Fictional /.test(node.text ?? ''));
  expect(runs).toHaveLength(2);
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const selection = { type: 'range' as const, startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true };
    runtime.editor.updateSelection(selection);
    expect(await runtime.editor.run('addWordBookmark', { name: index ? 'decision' : 'requirement', selection })).toBe(true);
  }
  const scope = runtime.view.contentEditableElement;
  scope.tabIndex = 0;
  const texts = runs.map(run => {
    const paragraph = document.createElement('p'); paragraph.setAttribute('data-bc-sid', run.parentId!);
    const span = document.createElement('span'); span.setAttribute('data-bc-sid', run.sid!);
    const text = document.createTextNode(run.text!); span.append(text); paragraph.append(span); scope.append(paragraph);
    return text;
  });
  scope.focus();
  const point = (text: Text, offset = 1, notify = false) => {
    const range = document.createRange(); range.setStart(text, offset); range.collapse(true);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    if (notify) document.dispatchEvent(new Event('selectionchange'));
  };
  const native = () => wordFileText(runtime.exportNativeDocument(), '');
  // Leave the cached model on B, then capture the visible DOM caret on A.
  point(texts[0]);
  expect(runtime.editor.selection).toMatchObject({ startNodeId: runs[1].sid });
  expect(runtime.view.convertDOMSelectionToModel(document.getSelection()!)).toMatchObject({
    type: 'range', startNodeId: runs[0].sid, startOffset: 1, collapsed: true,
  });
  const intent = captureBusinessPairIntent(runtime, () => true);
  expect(intent).not.toBeNull();
  expect(intent!.selection).toMatchObject({ type: 'range', startNodeId: runs[0].sid, startOffset: 1, collapsed: true });
  const before = native(), history = runtime.editor.historyManager.getHistory().length;
  return { runtime, runs, texts, scope, point, native, intent: intent!, before, history,
    dispose: () => { intent?.dispose(); document.getSelection()?.removeAllRanges(); runtime.dispose(); host.remove(); render.mockRestore(); } };
}

describe('native Word business intent DOM selection guard (jsdom; no physical browser)', () => {
  it('refuses a DOM-only A→B caret change before model debounce without any document/history write', async () => {
    const f = await fixture();
    try {
      const payload = createBusinessPair(f.runtime.exportNativeDocument(), 'requirement', 'decision');
      const action = prepareBusinessPairWrite(f.runtime, payload, () => true, f.intent.live)!;
      expect(action).not.toBeNull();
      f.point(f.texts[1]);
      // No event/timer/model update is needed for direct liveness refusal.
      expect(f.runtime.editor.selection).toMatchObject({ startNodeId: f.runs[0].sid, startOffset: 1 });
      expect(f.intent.current()).toBe(false);
      expect(await action.apply()).toBe(false);
      expect(f.native()).toBe(f.before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(f.history);
      action.dispose();
    } finally { f.dispose(); }
  });

  it('permanently retires a notified DOM A→B→A change before the model catches up', async () => {
    const f = await fixture();
    try {
      vi.useFakeTimers();
      f.point(f.texts[1], 1, true);
      f.point(f.texts[0], 1, true);
      expect(f.runtime.editor.selection).toMatchObject({ startNodeId: f.runs[0].sid, startOffset: 1 });
      expect(f.intent.current()).toBe(false);
      expect(f.native()).toBe(f.before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(f.history);
    } finally { f.dispose(); }
  });

  it('refuses native selection moved outside this editor while the model remains on A', async () => {
    const f = await fixture(), outside = document.createElement('button');
    const text = document.createTextNode('Outside the owned editor'); outside.append(text); document.body.append(outside);
    try {
      f.point(text);
      expect(f.runtime.editor.selection).toMatchObject({ startNodeId: f.runs[0].sid, startOffset: 1 });
      expect(f.intent.live()).toBe(false);
      expect(f.native()).toBe(f.before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(f.history);
    } finally { outside.remove(); f.dispose(); }
  });

  it('checks the DOM again after an awaited existing policy without publishing metadata/history', async () => {
    const f = await fixture();
    const release = registerPreCommitGuard(f.runtime.editor, async () => { f.point(f.texts[1]); await Promise.resolve(); });
    try {
      const payload = createBusinessPair(f.runtime.exportNativeDocument(), 'requirement', 'decision');
      const action = prepareBusinessPairWrite(f.runtime, payload, () => true, f.intent.live)!;
      expect(action).not.toBeNull(); expect(await action.apply()).toBe(false);
      expect(f.native()).toBe(f.before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(f.history);
    } finally { release(); f.dispose(); }
  });

  it('allows its unchanged owned bookmark command and records one genuine native history entry', async () => {
    const f = await fixture();
    try {
      expect(f.intent.current()).toBe(true);
      expect(await f.runtime.editor.run('addWordBookmark', { name: 'owned-positive', rootId: f.intent.rootId, selection: f.intent.selection!,
        validateIntent: () => f.intent.live() ? undefined : 'Changed native DOM selection' })).toBe(true);
      expect(f.native()).toContain('owned-positive');
      expect(f.native()).not.toBe(f.before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(f.history + 1);
    } finally { f.dispose(); }
  });
});
