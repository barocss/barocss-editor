import { describe, expect, it } from 'vitest';
import { createSampleSite, createSiteEditor, readSiteFile, siteFileText, refsIn, refFaults, richPlain } from '@barocss/office-site';
import { readServerSiteFile, serverSiteFileText, stableSiteSnapshotText, hasUniqueSiteResourceIdentities } from '../src/server-file';

type NativeNode = { stype: string; attributes?: Record<string, unknown>; metadata?: Record<string, unknown>;
  content?: NativeNode[]; text?: string; marks?: unknown[]; sid?: string; parentId?: string };

function fixture(): NativeNode {
  const document = createSampleSite() as NativeNode;
  document.metadata = { loadedAt: 'native-time', provenance: { creator: 'synthetic', order: [2, 1] } };
  return document;
}

function nodes(document: NativeNode): NativeNode[] {
  return [document, ...(document.content ?? []).flatMap(nodes)];
}

const envelope = (document: unknown, extra = {}) => JSON.stringify({
  format: 'barocss-site', version: 1, document, ...extra
});

describe('strict Site native server files', () => {
  it.each(['richText', 'dataset'] as const)('rejects duplicate same-namespace %s resource identities without changing the full source', stype => {
    const source = fixture(), resources = source.content!.find(node => node.stype === 'resources')!;
    const original = resources.content!.find(node => node.stype === stype)!;
    const duplicate = structuredClone(original);
    duplicate.metadata = { ...duplicate.metadata, syntheticDuplicate: true };
    resources.content!.push(duplicate);
    const before = structuredClone(source);
    // The official file codec retains both complete resources. The server gate
    // must reject ambiguity, rather than choosing the first or deleting either.
    expect(readSiteFile(siteFileText(source, 'fixed-time'))).toEqual({ document: before, version: 1 });
    expect(readServerSiteFile(siteFileText(source, 'fixed-time'))).toEqual({ error: 'duplicate_site_resource_identity' });
    expect(() => serverSiteFileText(source, 'fixed-time')).toThrow('invalid_site_snapshot');
    expect(source).toEqual(before);
  });

  it('keeps separate resource type and dataset row identity namespaces', () => {
    const source = fixture(), resources = source.content!.find(node => node.stype === 'resources')!;
    const datasets = resources.content!.filter(node => node.stype === 'dataset');
    const rich = resources.content!.find(node => node.stype === 'richText' && node.attributes?.id === '본문-스택')!;
    expect(datasets.length).toBeGreaterThanOrEqual(2);
    const sharedName = String(datasets[0].attributes!.name);
    rich.attributes = { ...rich.attributes, id: sharedName };
    const changed = JSON.parse(JSON.stringify(source).replaceAll('text:본문-스택', `text:${sharedName}`)) as NativeNode;
    const changedDatasets = changed.content!.find(node => node.stype === 'resources')!.content!.filter(node => node.stype === 'dataset');
    for (const dataset of changedDatasets.slice(0, 2)) {
      const records = dataset.attributes!.records as Record<string, unknown>[];
      dataset.attributes!.rowIds = records.map((_record, index) => `same-row-${index}`);
    }
    const before = structuredClone(changed);
    expect(hasUniqueSiteResourceIdentities(changed)).toBe(true);
    expect(readServerSiteFile(serverSiteFileText(changed, 'fixed-time'))).toEqual({ document: before, version: 1 });
    expect(changed).toEqual(before);
  });

  it('checks all direct root resource boxes while excluding inline and nested Note identities', () => {
    const source = fixture(), resources = source.content!.find(node => node.stype === 'resources')!;
    const rich = resources.content!.find(node => node.stype === 'richText')!;
    expect(hasUniqueSiteResourceIdentities(source)).toBe(true);
    const acrossBoxes = structuredClone(source);
    acrossBoxes.content!.push({ stype: 'resources', content: [structuredClone(rich)] });
    expect(hasUniqueSiteResourceIdentities(acrossBoxes)).toBe(false);
    const scoped = structuredClone(source);
    const surface = scoped.content!.find(node => node.stype === 'surface')!;
    const nested = structuredClone(rich);
    // Inline richText is not a document resource. Its own Note resources are
    // also outside the document-root resource identity namespace.
    nested.content!.push({ stype: 'resources', content: [structuredClone(rich)] });
    surface.content!.push(nested);
    expect(hasUniqueSiteResourceIdentities(scoped)).toBe(true);
    expect(hasUniqueSiteResourceIdentities(null)).toBe(false);
  });

  it('retains unreferenced native rich resources without treating them as missing targets', () => {
    const source = fixture(), resources = source.content!.find(node => node.stype === 'resources')!;
    const retained = structuredClone(resources.content!.find(node => node.stype === 'richText')!);
    retained.attributes = { ...retained.attributes, id: 'unreferenced-retained-native-body' };
    resources.content!.push(retained);
    const before = structuredClone(source), text = serverSiteFileText(source, 'fixed-time');
    expect(readServerSiteFile(text)).toEqual({ document: before, version: 1 });
    expect(source).toEqual(before);
  });
  it('rejects the complete native file when an actually referenced rich body is missing', () => {
    const source = fixture(), changed = structuredClone(source);
    const resources = changed.content!.find(node => node.stype === 'resources')!;
    const at = resources.content!.findIndex(node => node.stype === 'richText' && node.attributes?.id === '본문-스택');
    expect(at).toBeGreaterThan(-1); resources.content!.splice(at, 1);
    const native = createSiteEditor();
    try {
      native.loadDocument(changed);
      const access = { rootId: native.getRootId()!, getNode: (sid: string) => native.dataStore.getNode(sid) };
      expect(refsIn(access).some(ref => ref.kind === 'richText' && ref.to === '본문-스택')).toBe(true);
      expect(refFaults(access, refsIn(access)).some(fault => fault.kind === 'reference' && fault.said.includes('본문-스택'))).toBe(true);
      expect(richPlain(access, 'text:본문-스택')).toBe('');
      const originalNative = native.dataStore.getRootNodeId();
      expect(readServerSiteFile(siteFileText(changed, 'fixed-time'))).toHaveProperty('error');
      expect(() => serverSiteFileText(changed, 'fixed-time')).toThrow('invalid_site_snapshot');
      expect(native.dataStore.getRootNodeId()).toBe(originalNative);
      expect(readServerSiteFile(siteFileText(source, 'fixed-time'))).toEqual({ document: source, version: 1 });
      expect(source.content!.find(node => node.stype === 'resources')!.content!.some(node => node.stype === 'richText' && node.attributes?.id === '본문-스택')).toBe(true);
    } finally { native.destroy(); }
  });
  it('preserves the complete sample, page paths, native resources, references and metadata without changing its source', () => {
    const source = fixture();
    const before = structuredClone(source);
    const text = serverSiteFileText(source, 'fixed-export-time');
    const read = readServerSiteFile(text);
    expect(read).toEqual({ document: source, version: 1 });
    expect(readSiteFile(text)).toEqual(read);
    expect(source).toEqual(before);
    expect(text).toBe(siteFileText(source, 'fixed-export-time'));

    // This fixture includes actual dataset richText references, embedded assets,
    // templates and page links. Compare the whole native tree, not visible text.
    const all = nodes(source);
    for (const stype of ['surface', 'dataset', 'richText', 'asset', 'component', 'instance']) {
      expect(all.some(node => node.stype === stype), stype).toBe(true);
    }
    expect(all.some(node => node.stype === 'surface' && node.attributes?.path)).toBe(true);
    expect(all.some(node => node.stype === 'dataset' && JSON.stringify(node.attributes).includes('text:'))).toBe(true);
    expect(all.some(node => node.stype === 'asset' && node.attributes?.data)).toBe(true);
  });

  it('strips only session IDs from native nodes and preserves user metadata and durable IDs', () => {
    const source = fixture();
    const expected = structuredClone(source);
    for (const [index, node] of nodes(source).entries()) {
      node.sid = `session:${index}`;
      node.parentId = 'session:parent';
    }
    const text = serverSiteFileText(source);
    expect(readServerSiteFile(text)).toEqual({ document: expected, version: 1 });
    expect(text).not.toContain('session:');
    expect(source.sid).toBe('session:0');
    expect(text).toContain('native-time');
  });

  it('compares native values independently of key order and export timestamp, while retaining arrays and metadata', () => {
    const source = fixture();
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
    const before = stableSiteSnapshotText(serverSiteFileText(source, 'before'));
    expect(stableSiteSnapshotText(serverSiteFileText(reorder(source), 'after'))).toBe(before);
    source.metadata!.provenance = { creator: 'synthetic', order: [1, 2] };
    expect(stableSiteSnapshotText(serverSiteFileText(source))).not.toBe(before);
    source.metadata = fixture().metadata;
    const pages = source.content!.filter(node => node.stype === 'surface');
    const first = source.content!.indexOf(pages[0]);
    const second = source.content!.indexOf(pages[1]);
    [source.content![first], source.content![second]] = [source.content![second], source.content![first]];
    expect(stableSiteSnapshotText(serverSiteFileText(source))).not.toBe(before);
  });

  it('preserves absent, empty and populated native marks instead of normalizing text runs', () => {
    const document: NativeNode = { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow', id: 'home', path: '/' },
      content: [{ stype: 'paragraph', content: [
        { stype: 'inline-text', text: 'A' },
        { stype: 'inline-text', text: 'B', marks: [] },
        { stype: 'inline-text', text: 'C', marks: [{ stype: 'bold', range: [0, 1] }] }
      ] }] }] };
    expect(readServerSiteFile(serverSiteFileText(document))).toEqual({ document, version: 1 });
  });

  it('rejects unknown native fields, invalid structures and unsupported file versions before model replacement', () => {
    for (const document of [null, { stype: 'document', content: [null] },
      { stype: 'document', content: [{ stype: 'unknown' }] }, { ...fixture(), unsupportedData: 'would-be-lost' },
      { ...fixture(), sid: 'session:1' }, { ...fixture(), parentId: 'session:root' },
      { stype: 'document', content: [], attributes: [] }]) {
      expect(readServerSiteFile(envelope(document))).toHaveProperty('error');
    }
    for (const extra of [{ version: 0 }, { version: 2 }, { format: 'barocss-word' }, { savedAt: 42 }, { unknown: true }]) {
      expect(readServerSiteFile(envelope(fixture(), extra))).toHaveProperty('error');
    }
  });

  it('rejects malformed marks without dropping or rewriting them', () => {
    for (const marks of [null, [{ stype: 'unknown' }], [{ stype: 'bold', range: [0, 2] }],
      [{ stype: 'bold', range: [-1, 1] }], [{ stype: 'bold', attrs: [] }]]) {
      const document = { stype: 'document', content: [{ stype: 'surface', content: [
        { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'x', marks }] }
      ] }] };
      expect(readServerSiteFile(envelope(document))).toHaveProperty('error');
    }
  });

  it('enforces the service byte, full JSON node and nesting budgets for native attributes and metadata', () => {
    const small = { stype: 'document', content: [{ stype: 'surface', content: [{ stype: 'paragraph' }] }] };
    expect(readServerSiteFile(envelope({ ...small, metadata: { oversized: 'x'.repeat(524289) } })))
      .toEqual({ error: 'site_snapshot_too_large' });
    expect(readServerSiteFile(envelope({ ...small, metadata: { values: Array.from({ length: 10000 }, () => 1) } })))
      .toHaveProperty('error');
    let deep: unknown = 'end';
    for (let depth = 0; depth < 102; depth++) deep = { nested: deep };
    expect(readServerSiteFile(envelope({ ...small, metadata: { deep } }))).toHaveProperty('error');
  });
});
