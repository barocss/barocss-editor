import { describe, expect, it } from 'vitest';
import { createSampleDeck, deckFileText } from '../src';
import { assertSlidesNativeDocument, createSlidesRuntime } from '../../../apps/slide/src/runtime';

const native = (value: unknown) => JSON.parse(deckFileText(value, '')).document;

describe('authenticated Slides runtime', () => {
  it('preserves native metadata, durable references and order across editor load and export', () => {
    const document = createSampleDeck();
    document.metadata = { loadedAt: 'original-native-date', author: 'synthetic-owner' };
    const container = window.document.createElement('div');
    window.document.body.append(container);
    const runtime = createSlidesRuntime(container, { initialDocument: document, editable: true });
    try {
      expect(runtime.editor.isEditable).toBe(true);
      expect(runtime.exportNativeDocument()).toEqual(native(document));
      const reopened = runtime.exportNativeDocument();
      runtime.loadNativeDocument(reopened);
      expect(runtime.exportNativeDocument()).toEqual(reopened);
      expect((window as Window & { editor?: unknown }).editor).toBeUndefined();
    } finally { runtime.dispose(); container.remove(); }
  });

  it('captures edited native text during the content event and retains it through reopen', async () => {
    const document = createSampleDeck();
    document.metadata = { loadedAt: 'original-native-date', author: 'synthetic-owner' };
    const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document, editable: true });
    type NativeNode = { sid?: string; text?: string; marks?: unknown[]; content?: NativeNode[] };
    const firstText = (node: NativeNode): NativeNode | undefined => typeof node.text === 'string'
      ? node : node.content?.map(firstText).find(Boolean);
    const editedText = 'authenticated-input ';
    const insertFirstText = (node: NativeNode): boolean => {
      if (typeof node.text === 'string') { node.text = editedText + node.text; node.marks ??= []; return true; }
      return !!node.content?.some(insertFirstText);
    };
    const expected = native(document);
    if (!insertFirstText(expected)) throw new Error('Missing native text fixture');
    let captured: unknown;
    const changed = () => { captured = runtime.exportNativeDocument(); };
    runtime.editor.on('editor:content.change', changed);
    try {
      const run = firstText(runtime.editor.exportDocument() as NativeNode);
      if (!run?.sid) throw new Error('Missing loaded text run');
      const selection = { type: 'range' as const, startNodeId: run.sid, endNodeId: run.sid,
        startOffset: 0, endOffset: 0, collapsed: true };
      expect(await runtime.editor.executeCommand('insertText', { text: editedText, selection })).toBe(true);
      expect(captured).toEqual(expected);
      expect(runtime.exportNativeDocument()).toEqual(expected);
      runtime.editor.off('editor:content.change', changed);
      runtime.loadNativeDocument(captured);
      expect(runtime.exportNativeDocument()).toEqual(expected);
    } finally { runtime.editor.off('editor:content.change', changed); runtime.dispose(); }
  });

  it('refuses unsupported nodes and mutation commands before replacing the model', async () => {
    const container = window.document.createElement('div');
    const runtime = createSlidesRuntime(container, { initialDocument: createSampleDeck(), editable: false });
    try {
      const before = runtime.exportNativeDocument();
      for (const invalid of [null, {}, { stype: 'document', content: [{ stype: 'unsupported-native-node' }] }]) {
        expect(() => runtime.loadNativeDocument(invalid)).toThrow();
        expect(runtime.exportNativeDocument()).toEqual(before);
      }
      expect(runtime.editor.isEditable).toBe(false);
      expect(runtime.view.contentEditableElement.contentEditable).toBe('false');
      runtime.editor.setEditable(true);
      expect(runtime.view.contentEditableElement.contentEditable).toBe('true');
      runtime.editor.setEditable(false);
      expect(runtime.view.contentEditableElement.contentEditable).toBe('false');
      expect(runtime.editor.canExecuteCommand('insertSlide')).toBe(false);
      expect(await runtime.editor.executeCommand('insertSlide')).toBe(false);
      expect(runtime.exportNativeDocument()).toEqual(before);
    } finally { runtime.dispose(); }
  });

  it('shares one motion stylesheet and disposes each editor lifetime independently', () => {
    const first = createSlidesRuntime(window.document.createElement('div'), { initialDocument: createSampleDeck(), editable: false });
    const second = createSlidesRuntime(window.document.createElement('div'), { initialDocument: createSampleDeck(), editable: true });
    first.dispose(); first.dispose();
    expect(() => first.exportNativeDocument()).toThrow('disposed');
    expect(() => second.exportNativeDocument()).not.toThrow();
    expect(window.document.querySelectorAll('style[data-sl-tracks]')).toHaveLength(1);
    second.dispose();
  });

  it('validates native data without creating a surface or replacing the standalone debug handles', () => {
    const before = window.document.body.innerHTML;
    assertSlidesNativeDocument(createSampleDeck());
    expect(window.document.body.innerHTML).toBe(before);
    expect((window as Window & { editor?: unknown }).editor).toBeUndefined();
  });
});
