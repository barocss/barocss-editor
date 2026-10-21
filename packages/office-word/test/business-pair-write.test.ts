import { expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { registerPreCommitGuard } from '@barocss/model';
import { createStarterDocument } from '../src/starter-document';
import { createBusinessPair, appendDecisionVersion, readBusinessPair } from '../src/business-pair';
import { wordFileText } from '../src/word-file';
import { mountWordRuntime } from '../../../apps/word/src/runtime';
import { prepareBusinessPairWrite } from '../src/business-pair-write';
import { captureBusinessPairIntent } from '../../../apps/word/src/business-pair-intent';

async function fixture() {
  const source = createStarterDocument();
  const surface = source.content!.find(node => typeof node === 'object' && node.stype === 'surface');
  if (!surface || typeof surface !== 'object') throw new Error('Missing surface');
  surface.content = [
    { stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Keep the fictional original.', marks: [{ stype: 'bold', range: [0, 4] }] }] },
    { stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Use the existing native editor.' }] }
  ];
  const render = vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true });
  const paragraphs = runtime.editor.dataStore.getAllNodes().filter(node => node.stype === 'paragraph');
  for (let i = 0; i < 2; i++) {
    const id = String(paragraphs[i].content![0]);
    const selection = { type: 'range' as const, startNodeId: id, endNodeId: id, startOffset: 0, endOffset: 0, collapsed: true };
    runtime.editor.updateSelection(selection);
    expect(await runtime.editor.run('addWordBookmark', { name: i ? 'fictional-decision' : 'fictional-requirement', selection })).toBe(true);
  }
  return { runtime, host, native: () => wordFileText(runtime.exportNativeDocument(), ''),
    dispose: () => { runtime.dispose(); host.remove(); render.mockRestore(); } };
}

it('genuinely authors a native pair and decision v2 through existing transactions and exact whole history', async () => {
  const f = await fixture();
  try {
    const before = f.native();
    const payload = createBusinessPair(f.runtime.exportNativeDocument(), 'fictional-requirement', 'fictional-decision');
    const expected = JSON.parse(before).document;
    expected.metadata = { ...expected.metadata, wonfficeBusinessPair: payload };
    const v1 = wordFileText(expected, '');
    const action = prepareBusinessPairWrite(f.runtime, payload, () => true)!;
    expect(f.native()).toBe(before); expect(await action.apply()).toBe(true); expect(f.native()).toBe(v1);
    const decisionRun = f.runtime.editor.dataStore.getAllNodes().find(node => node.text === 'Use the existing native editor.')!;
    const range = { type: 'range' as const, startNodeId: decisionRun.sid!, endNodeId: decisionRun.sid!, startOffset: 0, endOffset: decisionRun.text!.length, collapsed: false };
    const replacement = 'Use the native editor and exact history.';
    expect(await f.runtime.editor.run('replaceText', { range, text: replacement })).toBe(true);
    const edited = structuredClone(expected);
    const changeText = (node: { text?: string; content?: unknown[]; marks?: unknown[] }) => {
      // The existing native replaceText command explicitly writes its adjusted mark list.
      if (node.text === 'Use the existing native editor.') { node.text = replacement; node.marks = []; }
      node.content?.forEach(child => changeText(child as typeof node));
    };
    changeText(edited);
    const editedBytes = wordFileText(edited, ''); expect(f.native()).toBe(editedBytes);
    const next = appendDecisionVersion(f.runtime.exportNativeDocument());
    const expectedV2 = structuredClone(edited); expectedV2.metadata.wonfficeBusinessPair = next;
    const v2 = wordFileText(expectedV2, '');
    expect(await prepareBusinessPairWrite(f.runtime, next, () => true)!.apply()).toBe(true);
    expect(f.native()).toBe(v2); expect(readBusinessPair(f.runtime.exportNativeDocument())).toMatchObject({ status: 'valid', review: 'needed' });
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await f.runtime.editor.undo()).toBe(true); expect(f.native()).toBe(editedBytes);
      expect(await f.runtime.editor.undo()).toBe(true); expect(f.native()).toBe(v1);
      expect(await f.runtime.editor.undo()).toBe(true); expect(f.native()).toBe(before);
      expect(await f.runtime.editor.redo()).toBe(true); expect(f.native()).toBe(v1);
      expect(await f.runtime.editor.redo()).toBe(true); expect(f.native()).toBe(editedBytes);
      expect(await f.runtime.editor.redo()).toBe(true); expect(f.native()).toBe(v2);
    }
  } finally { f.dispose(); }
});

it.each(['selection', 'editable-aba', 'composition', 'authority'] as const)('refuses changed %s before native history/write', async kind => {
  const f = await fixture(); let authority = true;
  try {
    const payload = createBusinessPair(f.runtime.exportNativeDocument(), 'fictional-requirement', 'fictional-decision');
    const action = prepareBusinessPairWrite(f.runtime, payload, () => authority)!;
    if (kind === 'selection') f.runtime.editor.updateSelection(null);
    if (kind === 'editable-aba') { f.runtime.editor.setEditable(false); f.runtime.editor.setEditable(true); }
    if (kind === 'composition') f.host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    if (kind === 'authority') authority = false;
    const before = f.native(), history = f.runtime.editor.historyManager.getHistory().length;
    expect(await action.apply()).toBe(false); expect(f.native()).toBe(before);
    expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(history); action.dispose();
  } finally { f.dispose(); }
});

it('refuses authority loss while the existing pre-commit policy awaits, retaining full original', async () => {
  const f = await fixture(); let authority = true;
  const cleanup = registerPreCommitGuard(f.runtime.editor, async () => { authority = false; });
  try {
    const before = f.native(), history = f.runtime.editor.historyManager.getHistory().length;
    const payload = createBusinessPair(f.runtime.exportNativeDocument(), 'fictional-requirement', 'fictional-decision');
    expect(await prepareBusinessPairWrite(f.runtime, payload, () => authority)!.apply()).toBe(false);
    expect(f.native()).toBe(before); expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(history);
  } finally { cleanup(); f.dispose(); }
});

it.each(['unchanged', 'selection-change', 'selection-aba'] as const)('freezes the clicked paragraph across a flush (%s)', async scenario => {
  const f = await fixture();
  try {
    const before = f.native(), history = f.runtime.editor.historyManager.getHistory().length;
    const original = structuredClone(f.runtime.editor.selection);
    const intent = captureBusinessPairIntent(f.runtime, () => true)!;
    await Promise.resolve();
    if (scenario !== 'unchanged') {
      f.runtime.editor.updateSelection(null);
      if (scenario === 'selection-aba') f.runtime.editor.updateSelection(original);
    }
    if (scenario !== 'unchanged') {
      expect(intent.current()).toBe(false); expect(f.native()).toBe(before);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(history);
    } else {
      expect(intent.current()).toBe(true);
      expect(await f.runtime.editor.run('addWordBookmark', { name: 'owned-no-change', rootId: intent.rootId, selection: intent.selection!,
        validateIntent: () => intent.live() ? undefined : 'Changed clicked paragraph' })).toBe(true);
      expect(f.native()).toContain('owned-no-change');
    }
    intent.dispose();
  } finally { f.dispose(); }
});
