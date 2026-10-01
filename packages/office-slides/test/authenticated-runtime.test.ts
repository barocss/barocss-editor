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
