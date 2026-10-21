import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { NOTE_FULL_SEED_V2, parseFullNoteSeedSource, createFullNoteSeed,
  decodeFullNoteSeedTree, typedFullNoteSeedTree, canonicalFullNoteSeedHash,
  createInitialFullNoteSeedRoot, decodeFullNoteSeedRoot, decodeInitialFullNoteSeedRoot }
  from '../dist/index.js';

const text = (value, marks = []) => ({ stype: 'inline-text', text: value, marks });
const paragraph = value => ({ stype: 'paragraph', content: [text(value)] });
const file = (content, attributes = { title: '계획', pageId: 'page-1' }) =>
  JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', attributes, content }, savedAt: '2026-09-28T00:00:00.000Z' });
const digest = value => createHash('sha256').update(value).digest('hex');
const mint = () => { let next = 0; return () => `node:${++next}`; };

test('full Note seed binds source bytes and legacy page identity separately from typed tree', () => {
  assert.equal(NOTE_FULL_SEED_V2, 'note-full-seed-v2');
  const raw = ` { "format":"barocss-note", "version":1, "document":${JSON.stringify({
    stype: 'note', attributes: { title: '🌿' }, content: [paragraph(''), paragraph('한글 🌿\r\nnext')]
  })} }\n`;
  const source = parseFullNoteSeedSource(raw);
  assert.equal(source.snapshotText, raw);
  assert.equal(source.sourceHash, digest(raw));
  const seed = createFullNoteSeed(source, { pageId: 'legacy-bound', mintNodeId: mint() });
  assert.equal(seed.sourcePageId, undefined);
  assert.equal(seed.tree.attributes.pageId, 'legacy-bound');
  assert.equal(seed.tree.content[0].content[0].text, '');
  assert.equal(seed.tree.content[1].content[0].text, '한글 🌿\r\nnext');
  assert.deepEqual(decodeFullNoteSeedTree(seed.tree), seed.tree);
  assert.deepEqual(typedFullNoteSeedTree(seed.tree).content[1].content[0].text,
    { type: 'yorkie.Text', value: '한글 🌿\r\nnext' });
  assert.equal(seed.canonicalTreeHash, canonicalFullNoteSeedHash(seed.tree));
  assert.notEqual(seed.sourceHash, seed.canonicalTreeHash);
  assert.equal(createFullNoteSeed(source, { pageId: 'legacy-bound', mintNodeId: mint() }).canonicalTreeHash,
    seed.canonicalTreeHash);
  const compact = parseFullNoteSeedSource(JSON.stringify(JSON.parse(raw)));
  assert.notEqual(compact.sourceHash, source.sourceHash);
  assert.equal(createFullNoteSeed(compact, { pageId: 'legacy-bound', mintNodeId: mint() }).canonicalTreeHash,
    seed.canonicalTreeHash);
  const untitled = JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', content: [paragraph('legacy')] } });
  const untitledSeed = createFullNoteSeed(parseFullNoteSeedSource(untitled),
    { pageId: 'legacy-untitled', mintNodeId: mint() });
  assert.deepEqual(untitledSeed.tree.attributes, { pageId: 'legacy-untitled' });
  assert.equal(JSON.parse(untitled).document.attributes, undefined);
});

test('recursive Note structures retain marks, blocks, datasets, nested item bodies and references', () => {
  const structures = [
    { stype: 'heading', attributes: { level: 2, alignment: 'center' }, content: [text('Title')] },
    { stype: 'list', content: [{ stype: 'listItem', content: [paragraph('one'),
      { stype: 'list', content: [{ stype: 'listItem', content: [paragraph('nested')] }] }] }] },
    { stype: 'taskItem', attributes: { checked: true }, content: [text('done')] },
    { stype: 'codeBlock', attributes: { language: 'ts' }, content: [text('const x = 1;\r\n')] },
    { stype: 'mathBlock', attributes: { tex: 'x^2', engine: 'katex',
      mathDocument: '{"blocks":["x^2"]}' } },
    { stype: 'mediaVideo', attributes: { src: 'asset:clip-1', poster: 'asset:poster-1' } },
    { stype: 'proseColumns', content: [
      { stype: 'proseColumn', attributes: { weight: 1 }, content: [paragraph('left')] },
      { stype: 'proseColumn', attributes: { weight: 2 }, content: [paragraph('right')] }
    ] },
    { stype: 'bDetails', content: [
      { stype: 'bSummary', content: [text('summary')] }, paragraph('details')
    ] },
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
      { stype: 'bTableCell', content: [text('cell')] }
    ] }] }] },
    { stype: 'paragraph', content: [text('Bold', [{ stype: 'bold', range: [0, 4] }]),
      { stype: 'pageReference', attributes: { pageId: 'linked-page', title: 'Link' } }] },
    { stype: 'callout', attributes: { type: 'note', title: 'Legacy title' },
      content: [paragraph('legacy body')] },
    { stype: 'noteDatabase', attributes: { source: 'tasks',
      views: [{ id: 'view-1', columns: ['Title'] }] } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Title', kind: 'text' }],
        rowIds: ['row-1'], records: [{ Title: 'Task', details: { unicode: '🌿', lines: 'a\r\nb' } }] } },
      { stype: 'richText', attributes: { id: 'row-1' }, content: [paragraph('nested body'),
        { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'inner',
          records: [{ Name: 'Nested' }], rowIds: ['inner-row'] } },
        { stype: 'richText', attributes: { id: 'inner-row' }, content: [paragraph('inside')] }] }] }
    ] }
  ];
  // Each family remains an independently admissible saved document.
  for (const node of structures) {
    const raw = file([paragraph('prefix'), node]);
    let source;
    try { source = parseFullNoteSeedSource(raw); }
    catch (error) { throw new Error(`${node.stype}: ${error.message}`); }
    const seed = createFullNoteSeed(source, { pageId: 'page-1', mintNodeId: mint() });
    assert.deepEqual(decodeFullNoteSeedTree(seed.tree), seed.tree, node.stype);
    assert.deepEqual(seed.tree.content[1].attributes, node.attributes, node.stype);
    const nested = JSON.stringify(seed.tree.content[1]);
    for (const value of ['linked-page', 'row-1', 'inner-row'].filter(value => raw.includes(value)))
      assert.ok(nested.includes(value), `${node.stype} lost ${value}`);
    assert.equal(canonicalFullNoteSeedHash(seed.tree), seed.canonicalTreeHash, node.stype);
  }
});

test('unsupported raw fields, duplicate keys, invalid content and node IDs fail closed', () => {
  const valid = file([paragraph('hello')]);
  const raw = JSON.parse(valid);
  const cases = [
    valid.replace('"format":"barocss-note"', '"format":"barocss-note","format":"barocss-note"'),
    JSON.stringify({ ...raw, metadata: { private: true } }),
    JSON.stringify({ ...raw, document: { ...raw.document, sid: 'browser-random' } }),
    JSON.stringify({ ...raw, document: { ...raw.document, attributes: { ...raw.document.attributes, unknown: true } } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { ...paragraph('hello'), content: [{ ...text('hello'), unknown: 'drop me' }] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [{ stype: 'slide', content: [] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { ...paragraph('hello'), content: [{ ...text('hello'), marks: [{ stype: 'bold', unknown: true }] }] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { ...paragraph('hello'), content: [{ ...text('hello'), attributes: { hidden: true } }] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { stype: 'paragraph', text: 'invisible' }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { stype: 'pageReference', attributes: { pageId: 'target' }, content: [text('hidden')] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { stype: 'codeBlock', content: [text('styled code', [{ stype: 'bold', range: [0, 6] }])] }] } }),
    JSON.stringify({ ...raw, document: { ...raw.document, content: [
      { stype: 'bTable', content: [{ stype: 'bTableRow', content: [] }] }] } }),
  ];
  for (const candidate of cases)
    assert.throws(() => parseFullNoteSeedSource(candidate), /invalid_note_full_seed_source/, candidate);
  const source = parseFullNoteSeedSource(valid);
  assert.throws(() => createFullNoteSeed(source, { pageId: 'other-page', mintNodeId: mint() }),
    /page_id_mismatch/);
  assert.throws(() => createFullNoteSeed(source, { pageId: 'page-1', mintNodeId: () => 'browser-random' }),
    /node_id/);
  const seed = createFullNoteSeed(source, { pageId: 'page-1', mintNodeId: mint() });
  assert.throws(() => decodeFullNoteSeedTree({ ...seed.tree, extra: 1 }), /invalid_note_full_seed_source/);
  assert.throws(() => decodeFullNoteSeedTree({ ...seed.tree,
    content: [{ ...seed.tree.content[0], id: seed.tree.id }] }), /\.id/);
  assert.throws(() => decodeFullNoteSeedTree({ ...seed.tree,
    content: [{ ...seed.tree.content[0], content: [
      { id: 'node:wrong-parent', stype: 'heading', content: [
        { id: 'node:wrong-child', stype: 'inline-text', text: 'nested heading' }
      ] }
    ] }] }), /tree.product_schema/);
  assert.notEqual(canonicalFullNoteSeedHash({ ...seed.tree,
    content: [{ ...seed.tree.content[0], content: [{ ...seed.tree.content[0].content[0], text: 'changed' }] }] }),
  seed.canonicalTreeHash);
  assert.notEqual(canonicalFullNoteSeedHash({ ...seed.tree,
    content: [{ ...seed.tree.content[0], content: [{ ...seed.tree.content[0].content[0],
      marks: [{ stype: 'bold', range: [0, 5] }] }] }] }), seed.canonicalTreeHash);
});

test('initial seed marker binds immutable source while live edit proofs remain separate', () => {
  const source = parseFullNoteSeedSource(file([paragraph('before')]));
  const seed = createFullNoteSeed(source, { pageId: 'page-1', mintNodeId: mint() });
  const root = createInitialFullNoteSeedRoot(seed, { seedId: 'attempt-1',
    documentKey: 'tenant/document', providerProject: 'project-1',
    providerBuild: '0.7.22', snapshotRevision: 3 });
  assert.deepEqual(decodeInitialFullNoteSeedRoot(root), root);
  assert.throws(() => decodeInitialFullNoteSeedRoot({ ...root, extra: true }), /root.extra/);
  assert.throws(() => decodeFullNoteSeedRoot({ ...root,
    wonfficeSeed: { ...root.wonfficeSeed, pageId: 'other-page' } }), /root.page_id/);
  const changed = { ...root, note: { ...root.note, content: [{ ...root.note.content[0],
    content: [{ ...root.note.content[0].content[0], text: 'after' }] }] },
  editProofs: [{ actor: 'actor-1', session: 'session-1', editId: 'edit-1', operationHash: digest('op-1') }] };
  assert.deepEqual(decodeFullNoteSeedRoot(changed), changed);
  assert.throws(() => decodeInitialFullNoteSeedRoot(changed), /initial_seed/);
  assert.equal(changed.wonfficeSeed.canonicalTreeHash, seed.canonicalTreeHash);
  assert.notEqual(canonicalFullNoteSeedHash(changed.note), seed.canonicalTreeHash);
  assert.throws(() => decodeFullNoteSeedRoot({ ...changed,
    editProofs: [...changed.editProofs, changed.editProofs[0]] }), /editProofs\[1\]/);
  const sparseProofs = new Array(1);
  assert.throws(() => decodeFullNoteSeedRoot({ ...root, editProofs: sparseProofs }), /root.editProofs/);
});

test('provider dataset records reject non-JSON runtime objects without erasing values', () => {
  const source = parseFullNoteSeedSource(file([paragraph('body'), { stype: 'resources', content: [
    { stype: 'dataset', attributes: { name: 'tasks', rowIds: ['row-1'],
      records: [{ details: { nested: ['safe', { unicode: '🌿', empty: '' }] } }] } }
  ] }]));
  const seed = createFullNoteSeed(source, { pageId: 'page-1', mintNodeId: mint() });
  assert.deepEqual(decodeFullNoteSeedTree(seed.tree), seed.tree);
  assert.deepEqual(seed.tree.content[1].content[0].attributes.records[0].details,
    { nested: ['safe', { unicode: '🌿', empty: '' }] });
  const record = seed.tree.content[1].content[0].attributes.records[0];
  for (const unsupported of [new Date('2026-09-28T00:00:00Z'),
    new Map([['critical', 'kept']]), new Set(['critical']), /critical/]) {
    record.details = unsupported;
    assert.throws(() => decodeFullNoteSeedTree(seed.tree), /invalid_note_full_seed_source/);
  }
  record.details = { nested: ['safe', { unicode: '🌿', empty: '' }] };
  const sparse = new Array(2);
  sparse[1] = 'survives';
  record.details = sparse;
  assert.throws(() => decodeFullNoteSeedTree(seed.tree), /invalid_note_full_seed_source/);
  const accessor = {};
  Object.defineProperty(accessor, 'critical', { enumerable: true, get: () => 'kept' });
  record.details = accessor;
  assert.throws(() => decodeFullNoteSeedTree(seed.tree), /invalid_note_full_seed_source/);
});
