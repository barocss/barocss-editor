// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DataStore, type INode } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createStarterDeck, createSampleDeck, createSlidesEditor, deckFileText, normalizeSlidesNativeDocument, getSlidesSchemaDefinition } from '@barocss/office-slides';
import { readServerSlidesFile, serverSlidesFileText, stableSlidesSnapshotText } from '../src/server-file';

function fixture(): INode {
  const deck = createStarterDeck();
  const slide = deck.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
  const resources = deck.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources');
  if (!slide || !resources) throw new Error('Missing deck fixture');
  slide.attributes = { ...slide.attributes, id: 'slide-a', trackId: 'track-a' };
  slide.content?.push({ stype: 'connector', attributes: { startX: 0, startY: 0, endX: 1500, endY: 1500, stroke: '#123456' } });
  slide.content?.push({ stype: 'group', attributes: { name: 'group-a', x: 0, y: 0, width: 2000, height: 1000 }, content: [
    { stype: 'rectangle', attributes: { name: 'shape-a', x: 0, y: 0, width: 1000, height: 1000, goTo: 'slide-b' } },
    { stype: 'ellipse', attributes: { name: 'shape-b', x: 1000, y: 0, width: 1000, height: 1000 } }
  ] });
  const second = structuredClone(slide);
  second.attributes = { ...second.attributes, id: 'slide-b' };
  delete second.attributes.trackId;
  deck.content?.splice(2, 0, second);
  resources.content?.push({ stype: 'motionTrack', attributes: { id: 'track-a' }, content: [
    { stype: 'motionStep', attributes: { kind: 'build', effect: 'appear', target: 'shape-a', on: 'shape-b' } }
  ] });
  deck.content?.push({ stype: 'components', content: [{ stype: 'component', attributes: { id: 'card-a' }, content: [
    { stype: 'componentVar', attributes: { name: 'accent', kind: 'color', value: '#123456' } },
    { stype: 'componentBind', attributes: { part: 'part-a', attr: 'fill', var: 'accent' } },
    { stype: 'rectangle', attributes: { partId: 'part-a', x: 0, y: 0, width: 1000, height: 1000 } }
  ] }] });
  slide.content?.push({ stype: 'instance', attributes: { componentId: 'card-a', x: 0, y: 0, width: 1000, height: 1000 }, content: [{ stype: 'componentValue', attributes: { name: 'accent', value: '#abcdef' } }] });
  deck.metadata = { loadedAt: 'native-time', provenance: { creator: 'synthetic', order: [2, 1] } };
  return normalizeSlidesNativeDocument(deck) as INode;
}

describe('strict Slides native server files', () => {
  it('round trips grouped slides, durable references and metadata through the actual editor', () => {
    const native = fixture();
    const text = serverSlidesFileText(native, 'fixed-time');
    const read = readServerSlidesFile(text);
    expect(read).toEqual({ document: JSON.parse(deckFileText(native)).document, version: 2 });
    if ('error' in read) throw new Error(read.error);
    const schema = createSchema('server-slides-test', getSlidesSchemaDefinition());
    const store = new DataStore(undefined, schema);
    const editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(read.document as never, 'fresh-session');
    const exported = JSON.parse(serverSlidesFileText(editor.exportDocument())).document;
    // The engine adds empty attributes and replaces loadedAt on load. Check native
    // content separately; the codec assertion above checks exact source metadata.
    const content = (value: unknown): unknown => Array.isArray(value) ? value.map(content) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key, child]) => key !== 'metadata' &&
        !(key === 'attributes' && child && typeof child === 'object' && Object.keys(child).length === 0))
        .map(([key, child]) => [key, content(child)])) : value;
    expect(content(exported)).toEqual(content(read.document));
    editor.destroy();
  });

  it('accepts the complete sample and strips only session bookkeeping', () => {
    const native = normalizeSlidesNativeDocument(createSampleDeck()) as INode;
    native.sid = 'session:1';
    native.metadata = { author: 'synthetic', loadedAt: 'original' };
    const text = serverSlidesFileText(native);
    expect(readServerSlidesFile(text)).toEqual({ document: JSON.parse(deckFileText(native)).document, version: 2 });
    expect(text).not.toContain('session:1');
    expect(text).toContain('original');
  });

  it('keeps dirty comparison sensitive to arrays and metadata, independent of property order or savedAt', () => {
    const native = fixture();
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
    const before = stableSlidesSnapshotText(serverSlidesFileText(native, 'before'));
    expect(stableSlidesSnapshotText(serverSlidesFileText(reorder(native), 'after'))).toBe(before);
    native.metadata = { author: 'changed' };
    expect(stableSlidesSnapshotText(serverSlidesFileText(native))).not.toBe(before);
  });

  it('rejects unsupported trees, wrong versions and unresolved native references without simplifying them', () => {
    for (const key of ['layoutId', 'trackId', 'noteId', 'componentId', 'goTo']) {
      const native = fixture();
      const slide = native.content?.[1] as INode;
      slide.attributes = { ...slide.attributes, [key]: 'missing-reference' };
      expect(readServerSlidesFile(deckFileText(native))).toHaveProperty('error');
    }
    for (const document of [null, { stype: 'document', content: [null] }, { stype: 'document', content: [{ stype: 'unknown' }] },
      { ...fixture(), sid: 'session:1' }]) {
      expect(readServerSlidesFile(JSON.stringify({ format: 'barocss-slides', version: 1, document }))).toHaveProperty('error');
    }
    expect(readServerSlidesFile(JSON.stringify({ format: 'barocss-slides', version: 3, document: fixture() }))).toHaveProperty('error');
  });

  it('rejects ambiguous IDs, dangling motion names and service budget overflow', () => {
    const native = fixture();
    (native.content?.[2] as INode).attributes!.id = 'slide-a';
    expect(readServerSlidesFile(deckFileText(native))).toHaveProperty('error');
    const broken = fixture();
    const resources = broken.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'resources');
    const track = resources?.content?.at(-1) as INode;
    (track.content?.[0] as INode).attributes!.target = 'missing-shape';
    expect(readServerSlidesFile(deckFileText(broken))).toHaveProperty('error');
    for (const metadata of [{ values: Array.from({ length: 10000 }, () => 1) }, { oversized: 'x'.repeat(524289) }]) {
      expect(readServerSlidesFile(deckFileText({ ...fixture(), metadata }))).toHaveProperty('error');
    }
  });
  it('rejects fields the loader cannot retain, unsupported marks and excessive JSON depth', () => {
    const envelope = (document: unknown) => JSON.stringify({ format: 'barocss-slides', version: 1, document });
    expect(readServerSlidesFile(envelope({ ...fixture(), unsupportedData: 'would-be-lost' }))).toHaveProperty('error');
    const native = fixture();
    const slide = native.content?.[1] as INode;
    slide.content = [{ stype: 'textFrame', content: [{ stype: 'paragraph', content: [
      { stype: 'inline-text', text: 'x', marks: [{ stype: 'unknown', range: [0, 1] }] }
    ] }] }];
    expect(readServerSlidesFile(deckFileText(native))).toHaveProperty('error');
    let metadata: unknown = 'deep';
    for (let depth = 0; depth < 102; depth++) metadata = { nested: metadata };
    expect(readServerSlidesFile(envelope({ ...fixture(), metadata }))).toHaveProperty('error');
  });

  it('refuses attached connector session references instead of silently detaching on reopen', () => {
    const native = fixture();
    const slide = native.content?.[1] as INode;
    slide.content?.push({ stype: 'connector', attributes: { startNodeId: 'session:shape-a', endNodeId: 'session:shape-b' } });
    const legacy = JSON.stringify({ format: 'barocss-slides', version: 1, document: native });
    expect(readServerSlidesFile(legacy)).toHaveProperty('error');
    expect(() => serverSlidesFileText(native)).toThrow();
  });

});


it('accepts a free legacy v1 connector and preserves the original wire bytes', () => {
  const document = { stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'connector', attributes: { startNodeId: '', endNodeId: '', startX: 0, startY: 0, endX: 10, endY: 10 } }
  ] }] };
  const text = JSON.stringify({ format: 'barocss-slides', version: 1, document });
  expect(readServerSlidesFile(text)).toEqual({ version: 1, document });
});
