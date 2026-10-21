import { describe, expect, it } from 'vitest';
import { createSchema, validateTree } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import { appendDecisionVersion, BUSINESS_PAIR_KEY, createBusinessPair, deriveBusinessPair, readBusinessPair } from '../src/business-pair';
import { readWordFile, wordFileText } from '../src/word-file';

interface TestNode { stype: string; content?: TestNode[]; attributes?: Record<string, unknown>; text?: string; marks?: { stype: string; range: number[] }[] }
function fixture(): { stype: string; metadata: { ownerClaim: string }; content: TestNode[] } {
  return { stype: 'document', metadata: { ownerClaim: 'fictional' }, content: [
    { stype: 'surface', content: [
      { stype: 'paragraph', attributes: { styleId: 'custom' }, content: [{ stype: 'bookmarkAnchor', attributes: { id: 'requirement' } }, { stype: 'inline-text', text: 'Retain the original', marks: [{ stype: 'bold', range: [0, 6] }] }] },
      { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'decision' } }, { stype: 'inline-text', text: 'Save before changes' }] }
    ] },
    { stype: 'resources', content: [{ stype: 'styleDef', attributes: { id: 'custom', name: 'Custom', type: 'paragraph', fontSize: 31 } }] }
  ] };
}
function authored() {
  const doc = fixture();
  return { ...doc, metadata: { ...doc.metadata, [BUSINESS_PAIR_KEY]: createBusinessPair(doc, 'requirement', 'decision') } };
}
describe('one fictional native business pair', () => {
  it('starts from schema-valid fictional native content', () => {
    expect(validateTree(createSchema('word-business-fixture', getWordSchemaDefinition()), fixture() as never)).toEqual([]);
  });
  it('refuses schema-invalid current content and historic rich pins without altering originals', () => {
    const document = authored();
    const original = structuredClone(document);
    const pin = readWordFile(document.metadata[BUSINESS_PAIR_KEY].items[0].versions[0].snapshotText);
    if ('error' in pin) throw new Error(pin.error);
    const tree = pin.document as typeof document;
    tree.content[0].content![0].content!.push({ stype: 'unknownNativeBusinessBlock', text: 'Cannot render' });
    document.metadata[BUSINESS_PAIR_KEY].items[0].versions[0].snapshotText = wordFileText(tree, '');
    const before = structuredClone(document);
    expect(readBusinessPair(document).status).toBe('invalid');
    expect(() => deriveBusinessPair(document)).toThrow();
    expect(document).toEqual(before);
    original.content[0].content![0].content!.push({ stype: 'unknownNativeBusinessBlock', text: 'Cannot render' });
    expect(readBusinessPair(original).status).toBe('invalid');
  });
  it('captures rich complete resource-backed files with independent durable identities and exact directed v1 pin', () => {
    const doc = authored();
    const read = readBusinessPair(doc);
    expect(read.status).toBe('valid');
    if (read.status !== 'valid') throw Error('Pair invalid');
    expect(read.review).toBe('current');
    expect(read.items.map(item => item.state)).toEqual(['current', 'current']);
    const [requirement, decision] = read.payload.items;
    expect(requirement.id).not.toBe(decision.id);
    expect(requirement.id).not.toBe(requirement.locator.bookmarkId);
    expect(read.payload.relations).toEqual([{ kind: 'supported_by', source: { itemId: requirement.id, version: 1 }, target: { itemId: decision.id, version: 1 } }]);
    const pin = readWordFile(requirement.versions[0].snapshotText);
    expect('error' in pin).toBe(false);
    if ('error' in pin) throw Error('Invalid pin');
    expect(pin.document).toEqual(fixture());
    expect(requirement.versions[0].snapshotText).not.toContain(BUSINESS_PAIR_KEY);
    const reopened = readWordFile(wordFileText(doc, ''));
    if ('error' in reopened) throw Error('Invalid file');
    expect(readBusinessPair(reopened.document)).toEqual(read);
  });
  it('captures through the native codec without leaking live runtime node identifiers', () => {
    const doc = fixture();
    Object.assign(doc, { sid: 'runtime-root', parentId: 'runtime-parent' });
    Object.assign(doc.content[0].content![0], { sid: 'runtime-paragraph', parentId: 'runtime-surface' });
    const payload = createBusinessPair(doc, 'requirement', 'decision');
    expect(payload.items[0].versions[0].snapshotText).not.toContain('runtime-');
    expect(JSON.stringify(doc)).toContain('runtime-paragraph');
  });
  it('retains historical content and v1 relation after an explicit decision-v2 capture', () => {
    const doc = authored(); const original = structuredClone(doc.metadata[BUSINESS_PAIR_KEY]);
    const decision = doc.content[0].content![1]; decision.content![1].text = 'Keep two backups';
    const changed = readBusinessPair(doc);
    expect(changed.status === 'valid' && changed.items[1].state).toBe('stale');
    doc.metadata[BUSINESS_PAIR_KEY] = appendDecisionVersion(doc);
    const read = readBusinessPair(doc);
    if (read.status !== 'valid') throw Error('Pair invalid');
    expect(read.review).toBe('needed'); expect(read.items.map(item => item.state)).toEqual(['current', 'current']);
    expect(read.payload.items[1].currentVersion).toBe(2);
    expect(read.payload.items[1].versions[0]).toEqual(original.items[1].versions[0]);
    expect(read.payload.relations).toEqual(original.relations);
    expect(read.payload.items[1].versions[1].snapshotText).toContain('Keep two backups');
    expect(() => appendDecisionVersion(doc)).toThrow();
  });
  it('detects changed resource definitions even when paragraph bytes stay unchanged', () => {
    const doc = authored(); doc.content[1].content![0].attributes!.fontSize = 47;
    const read = readBusinessPair(doc);
    expect(read.status === 'valid' && read.items.map(item => item.state)).toEqual(['stale', 'stale']);
  });
  it('does not normalize authored empty attributes or runtime-looking fields into current content', () => {
    const doc = authored();
    doc.content[0].content![1].attributes = {};
    const empty = readBusinessPair(doc);
    expect(empty.status === 'valid' && empty.items[1].state).toBe('stale');
    const next = authored();
    next.content[0].content![1].attributes = { loadedAt: 'authored' };
    const changed = readBusinessPair(next);
    expect(changed.status === 'valid' && changed.items[1].state).toBe('stale');
  });
  it('keeps identity on paragraph move and reports unavailable on deleted or ambiguous point', () => {
    const doc = authored(); const items = doc.metadata[BUSINESS_PAIR_KEY].items;
    doc.content[0].content!.reverse();
    const read = readBusinessPair(doc);
    expect(read.status === 'valid' && read.payload.items).toEqual(items);
    expect(read.status === 'valid' && read.review).toBe('current');
    doc.content[0].content!.push(structuredClone(doc.content[0].content![0]));
    const ambiguous = readBusinessPair(doc);
    expect(ambiguous.status === 'valid' && ambiguous.items[1].state).toBe('unavailable');
    expect(() => appendDecisionVersion(doc)).toThrow();
  });
  it('derives fresh identities and remaps only internal references, preserving original and full pins', () => {
    const original = authored(); const frozen = structuredClone(original);
    const copied = deriveBusinessPair(original); const restored = deriveBusinessPair(original);
    const read = readBusinessPair(copied), restore = readBusinessPair(restored);
    if (read.status !== 'valid' || restore.status !== 'valid') throw Error('Invalid copy');
    expect(original).toEqual(frozen);
    read.payload.items.forEach((item, index) => {
      expect(item.id).not.toBe(frozen.metadata[BUSINESS_PAIR_KEY].items[index].id);
      expect(item.id).not.toBe(restore.payload.items[index].id);
      expect(item.derivedFrom).toEqual({ itemId: frozen.metadata[BUSINESS_PAIR_KEY].items[index].id, version: 1 });
      expect(item.versions).toEqual(frozen.metadata[BUSINESS_PAIR_KEY].items[index].versions);
    });
    expect(read.payload.relations[0].source.itemId).toBe(read.payload.items[0].id);
    expect(read.payload.relations[0].target.itemId).toBe(read.payload.items[1].id);
  });
  it('distinguishes absent, unsupported and malformed metadata without changing any original bytes', () => {
    expect(readBusinessPair(fixture())).toEqual({ status: 'absent' });
    expect(deriveBusinessPair(fixture())).toEqual(fixture());
    for (const raw of [null, {}, { schemaVersion: 0 }, { schemaVersion: 2 }]) {
      const doc = { ...fixture(), metadata: { [BUSINESS_PAIR_KEY]: raw } }; const before = JSON.stringify(doc);
      expect(readBusinessPair(doc).status).toBe(raw && 'schemaVersion' in raw && raw.schemaVersion === 2 ? 'unsupported' : 'invalid');
      expect(() => deriveBusinessPair(doc)).toThrow(); expect(JSON.stringify(doc)).toBe(before);
      expect(() => createBusinessPair(doc, 'requirement', 'decision')).toThrow();
    }
  });
  it.each(['duplicate', 'kind', 'direction', 'version', 'relation', 'pin', 'pin-runtime', 'pin-locator'])('refuses invalid %s without removing authored claims', failure => {
    const doc = authored(); const pair = doc.metadata[BUSINESS_PAIR_KEY];
    if (failure === 'duplicate') pair.items[1].id = pair.items[0].id;
    if (failure === 'kind') pair.items[1].kind = 'requirement';
    if (failure === 'direction') [pair.relations[0].source, pair.relations[0].target] = [pair.relations[0].target, pair.relations[0].source];
    if (failure === 'version') pair.relations[0].target.version = 2;
    if (failure === 'relation') Object.assign(pair.relations[0], { kind: 'approves' });
    if (failure === 'pin') pair.items[0].versions[0].snapshotText = '{}';
    if (failure === 'pin-runtime' || failure === 'pin-locator') {
      const pin = JSON.parse(pair.items[0].versions[0].snapshotText);
      if (failure === 'pin-runtime') pin.document.content[0].sid = 'runtime';
      else pin.document.content[0].content[0].content[0].attributes.id = 'missing';
      pair.items[0].versions[0].snapshotText = JSON.stringify(pin);
    }
    Object.assign(pair.items[0], { approved: true, actor: 'admin', time: 'yesterday' });
    const before = JSON.stringify(doc); expect(readBusinessPair(doc).status).toBe('invalid');
    expect(() => deriveBusinessPair(doc)).toThrow(); expect(JSON.stringify(doc)).toBe(before);
  });
  it('ignores authored approval as evidence and refuses creation with duplicate/missing points', () => {
    const doc = authored(); Object.assign(doc.metadata[BUSINESS_PAIR_KEY].items[0], { approved: true, actor: 'admin' });
    const read = readBusinessPair(doc); expect(read.status).toBe('valid');
    expect(read).not.toHaveProperty('approved');
    const missing = fixture(); expect(() => createBusinessPair(missing, 'unknown', 'decision')).toThrow();
    missing.content[0].content!.push(structuredClone(missing.content[0].content![0]));
    expect(() => createBusinessPair(missing, 'requirement', 'decision')).toThrow();
  });
});
