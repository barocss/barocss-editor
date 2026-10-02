import { describe, expect, it } from 'vitest';
import { createSampleDeck, deckFileText } from '../src';
import { assertSlidesNativeDocument, createSlidesRuntime } from '../../../apps/slide/src/runtime';

const native = (value: unknown) => JSON.parse(deckFileText(value, '')).document;

describe('authenticated Slides runtime', () => {
  it('preserves native metadata, durable references and order across editor load and export', () => {
    const document = native(createSampleDeck());
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
    const document = native(createSampleDeck());
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

  it('preserves absent versus explicit empty fields and nested resource metadata during load events', () => {
    const document = native(createSampleDeck());
    type NativeNode = { stype: string; attributes?: Record<string, unknown>; text?: string; marks?: unknown[]; metadata?: Record<string, unknown>; content?: NativeNode[] };
    const texts: NativeNode[] = [];
    const walk = (node: NativeNode) => { if (typeof node.text === 'string') texts.push(node); node.content?.forEach(walk); };
    walk(document);
    delete document.attributes;
    delete texts[0].attributes; delete texts[0].marks; delete texts[0].metadata; delete texts[0].content;
    texts[1].marks = []; texts[1].content = []; texts[1].metadata = {};
    const resources = document.content.find((node: NativeNode) => node.stype === 'resources');
    resources.metadata = { provenance: { original: null, flags: [false, 0, '', [], {}] }, loadedAt: 'resource-original-date' };
    const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document, editable: true });
    let captured: unknown;
    const changed = () => { captured = runtime.exportNativeDocument(); };
    runtime.editor.on('editor:content.change', changed);
    try {
      expect(runtime.exportNativeDocument()).toEqual(document);
      runtime.loadNativeDocument(document);
      expect(captured).toEqual(document);
      const exported = runtime.exportNativeDocument() as NativeNode;
      expect(exported).toEqual(document);
      const exportedTexts: NativeNode[] = [];
      const collect = (node: NativeNode) => { if (typeof node.text === 'string') exportedTexts.push(node); node.content?.forEach(collect); };
      collect(exported);
      expect(Object.hasOwn(exported, 'attributes')).toBe(false);
      expect(Object.keys(exportedTexts[0])).toEqual(['stype', 'text']);
      expect(Object.hasOwn(exportedTexts[1], 'content')).toBe(true);
      expect(exportedTexts[1].content).toEqual([]); expect(exportedTexts[1].marks).toEqual([]); expect(exportedTexts[1].metadata).toEqual({});
      expect(Object.hasOwn(document, 'attributes')).toBe(false);
      expect(Object.keys(texts[0])).toEqual(['stype', 'text']);
      expect(texts[1].content).toEqual([]); expect(texts[1].marks).toEqual([]); expect(texts[1].metadata).toEqual({});
    } finally { runtime.editor.off('editor:content.change', changed); runtime.dispose(); }
  });

  it('exports command-created native nodes without invented undefined fields and keeps their durable identities', async () => {
    const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: native(createSampleDeck()), editable: true });
    type NativeNode = { stype: string; attributes?: Record<string, unknown>; content?: NativeNode[]; [key: string]: unknown };
    const assertDefinedFields = (node: NativeNode) => {
      for (const key of Object.keys(node)) expect(node[key], `${node.stype}.${key}`).not.toBeUndefined();
      node.content?.forEach(assertDefinedFields);
    };
    try {
      expect(await runtime.editor.executeCommand('insertSlide')).toBe(true);
      const produced = runtime.exportNativeDocument() as NativeNode;
      assertDefinedFields(produced);
      runtime.loadNativeDocument(produced);
      expect(runtime.exportNativeDocument()).toEqual(produced);
    } finally { runtime.dispose(); }
  });

  it('preserves exact document-owned connector targets through reload and content capture', async () => {
    const document = native(createSampleDeck());
    type NativeNode = { stype: string; attributes?: Record<string, unknown>; content?: NativeNode[] };
    const surface = document.content.find((node: NativeNode) => node.stype === 'surface');
    surface.content.push(
      { stype: 'rectangle', attributes: { objectId: 'native-reference-start', x: 10, y: 20, width: 100, height: 100 } },
      { stype: 'ellipse', attributes: { objectId: 'native-reference-end', x: 200, y: 20, width: 100, height: 100 } },
      { stype: 'connector', attributes: { objectId: 'native-reference-edge', x: 10, y: 20, width: 200, height: 100,
        startObjectId: 'native-reference-start', endObjectId: 'native-reference-end' } }
    );
    const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: document, editable: true });
    let captured: unknown;
    const changed = () => { captured = runtime.exportNativeDocument(); }; runtime.editor.on('editor:content.change', changed);
    try {
      expect(runtime.exportNativeDocument()).toEqual(document);
      runtime.loadNativeDocument(document); expect(captured).toEqual(document);
      expect(runtime.exportNativeDocument()).toEqual(document);
      expect(await runtime.editor.executeCommand('insertSlide')).toBe(true);
      const produced = runtime.exportNativeDocument() as NativeNode;
      const sourceSurface = produced.content!.find(node => node.stype === 'surface')!;
      expect(sourceSurface.content!.slice(-3)).toEqual(surface.content.slice(-3));
      runtime.loadNativeDocument(produced); expect(runtime.exportNativeDocument()).toEqual(produced);
    } finally { runtime.editor.off('editor:content.change', changed); runtime.dispose(); }
  });

  it('rejects nonportable native values without replacing the current document or emitting content', () => {
    const runtime = createSlidesRuntime(window.document.createElement('div'), { initialDocument: native(createSampleDeck()), editable: false });
    const before = runtime.exportNativeDocument(); let events = 0;
    const changed = () => { events++; }; runtime.editor.on('editor:content.change', changed);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    const sparse = new Array(1);
    const extraArray = Object.assign([], { extra: 'must not disappear' });
    const numericArrayProperty = Object.assign([], { 4294967295: 'must not disappear' });
    let accessorCalls = 0;
    const arrayAccessor = Object.defineProperty([null], 0, { enumerable: true, get: () => { accessorCalls++; return null; } });
    const hidden = Object.defineProperty({}, 'hidden', { value: 'must not disappear' });
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 'must not be evaluated' });
    try {
      for (const value of [undefined, () => 1, Symbol('invalid'), 1n, NaN, Infinity, new Date(), new Map(), cyclic, sparse, extraArray, numericArrayProperty, arrayAccessor, hidden, accessor]) {
        const document = native(createSampleDeck()); document.metadata = { value };
        expect(() => runtime.loadNativeDocument(document)).toThrow();
        expect(runtime.exportNativeDocument()).toEqual(before);
        expect(events).toBe(0); expect(accessorCalls).toBe(0);
      }
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
