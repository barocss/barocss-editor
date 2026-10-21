import { expect, it } from 'vitest';
import { appendDecisionVersion, appendRequirementVersion, BUSINESS_PAIR_KEY, createBusinessPair, createStandaloneRequirement, deriveBusinessPair, linkBusinessDecision, readBusinessPair, type BusinessPairPayload } from '../src/business-pair';
import { captureCriterionContext, compareCriterionContext } from '../src/criterion-confirmation';
import { readWordFile, wordFileText } from '../src/word-file';

interface Node { stype: string; content?: Node[]; attributes?: Record<string, unknown>; text?: string; marks?: { stype: string; range: number[]; attrs?: Record<string, unknown> }[] }
interface Native extends Node { metadata: Record<string, unknown> }
function fixture(): Native {
  return { stype: 'document', metadata: { ownerClaim: 'fictional', retained: { source: 'manual' } }, content: [
    { stype: 'surface', content: [
      { stype: 'paragraph', attributes: { styleId: 'custom', objectId: 'requirement-paragraph' }, content: [
        { stype: 'bookmarkAnchor', attributes: { id: 'requirement' } },
        { stype: 'inline-text', text: 'Retain rich source ', marks: [{ stype: 'bold', range: [0, 6] }] },
        { stype: 'inline-text', text: 'and the reference.', marks: [{ stype: 'link', range: [0, 17], attrs: { href: 'https://example.test/' } }] }
      ] },
      { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'decision' } }, { stype: 'inline-text', text: 'Save before changes' }] }
    ] },
    { stype: 'resources', content: [{ stype: 'styleDef', attributes: { id: 'custom', name: 'Custom', type: 'paragraph', fontSize: 31 } }] }
  ] };
}
function attach(doc: Native, payload: BusinessPairPayload): Native { return { ...doc, metadata: { ...doc.metadata, [BUSINESS_PAIR_KEY]: payload } }; }
function standalone() { const doc = fixture(); return attach(doc, createStandaloneRequirement(doc, 'requirement')); }
function payload(doc: Native) { return doc.metadata[BUSINESS_PAIR_KEY] as BusinessPairPayload; }
function valid(doc: unknown) { const read = readBusinessPair(doc); if (read.status !== 'valid') throw new Error(`Not valid: ${JSON.stringify(read)}`); return read; }
function changed(doc: Native) { doc.content![0].content![0].content![1].text = 'Retain changed rich source '; }
it('authors exactly one requirement and no relation from full native source, leaving the source untouched and unconfirmed', () => {
  const original = fixture(), before = structuredClone(original), one = createStandaloneRequirement(original, 'requirement');
  expect(original).toEqual(before);
  expect(one).toEqual({ schemaVersion: 2, lifecycle: 'unlinked', items: [{ id: expect.any(String), kind: 'requirement', currentVersion: 1,
    locator: { kind: 'point-bookmark', bookmarkId: 'requirement' }, versions: [{ version: 1, snapshotText: wordFileText(before, '') }] }], relations: [] });
  const doc = attach(original, one), read = valid(doc);
  expect(read.lifecycle).toBe('unlinked'); expect(read.review).toBe('current'); expect(read.items.map(item => item.state)).toEqual(['current']);
  const pin = readWordFile(one.items[0].versions[0].snapshotText); if ('error' in pin) throw new Error(pin.error); expect(pin.document).toEqual(before);
  expect(() => captureCriterionContext(wordFileText(doc, ''))).toThrow(/linked/i);
  expect(compareCriterionContext(wordFileText(doc, ''), {})).toBe(false);
  expect(() => appendDecisionVersion(doc)).toThrow();
  const reopened = readWordFile(wordFileText(doc, '')); if ('error' in reopened) throw new Error(reopened.error);
  expect(readBusinessPair(reopened.document)).toEqual(read);
});
it('links an explicit current version without regenerating requirement identity, pins or rich content', () => {
  const doc = standalone(), before = structuredClone(doc), requirement = structuredClone(payload(doc).items[0]);
  const linked = linkBusinessDecision(doc, 'decision', 1);
  expect(doc).toEqual(before); expect(linked.schemaVersion).toBe(2); expect(linked.lifecycle).toBe('linked');
  expect(linked.items[0]).toEqual(requirement); expect(linked.items[1].id).not.toBe(requirement.id);
  expect(linked.relations).toEqual([{ kind: 'supported_by', source: { itemId: requirement.id, version: 1 }, target: { itemId: linked.items[1].id, version: 1 } }]);
  expect(valid(attach(doc, linked)).review).toBe('current');
  expect(captureCriterionContext(wordFileText(attach(doc, linked), '')).requirement.snapshotText).toBe(requirement.versions[0].snapshotText);
  expect(() => linkBusinessDecision(attach(doc, linked), 'decision', 1)).toThrow();
});
it('retains exact standalone history and deliberately links a historic version with explicit review needed', () => {
  const doc = standalone(), old = structuredClone(payload(doc).items[0]); changed(doc);
  expect(valid(doc).items[0].state).toBe('stale');
  const appended = appendRequirementVersion(doc); expect(appended.lifecycle).toBe('unlinked'); expect(appended.relations).toEqual([]);
  expect(appended.items[0].id).toBe(old.id); expect(appended.items[0].versions[0]).toEqual(old.versions[0]); expect(appended.items[0].currentVersion).toBe(2);
  const current = attach(doc, appended); expect(valid(current).review).toBe('current');
  const linked = linkBusinessDecision(current, 'decision', 1), read = valid(attach(current, linked));
  expect(linked.items[0]).toEqual(appended.items[0]); expect(read.lifecycle).toBe('linked'); expect(read.review).toBe('needed');
  expect(linked.relations[0].source.version).toBe(1);
  expect(() => captureCriterionContext(wordFileText(attach(current, linked), ''))).toThrow(/current/i);
  const latest = linkBusinessDecision(current, 'decision', 2); expect(valid(attach(current, latest)).review).toBe('current');
  expect(captureCriterionContext(wordFileText(attach(current, latest), '')).requirement.version).toBe(2);
});
it('never repairs a stale requirement pin while linking: current content and historical pin stay distinct', () => {
  const doc = standalone(), old = structuredClone(payload(doc).items[0]); changed(doc);
  const linked = linkBusinessDecision(doc, 'decision', 1);
  expect(linked.items[0]).toEqual(old); expect(valid(attach(doc, linked)).items[0].state).toBe('stale');
  expect(() => captureCriterionContext(wordFileText(attach(doc, linked), ''))).toThrow();
});
it.each(['unlinked', 'linked'] as const)('derives independent %s identity, exact history and remapped endpoints while retaining original', lifecycle => {
  let doc = standalone(); changed(doc); doc = attach(doc, appendRequirementVersion(doc));
  if (lifecycle === 'linked') doc = attach(doc, linkBusinessDecision(doc, 'decision', 1));
  const before = structuredClone(doc), copied = valid(deriveBusinessPair(doc)), other = valid(deriveBusinessPair(doc));
  expect(doc).toEqual(before); expect(copied.lifecycle).toBe(lifecycle);
  copied.payload.items.forEach((item, index) => { const original = payload(before).items[index];
    expect(item.id).not.toBe(original.id); expect(item.id).not.toBe(other.payload.items[index].id); expect(item.versions).toEqual(original.versions);
    expect(item.derivedFrom).toEqual({ itemId: original.id, version: original.currentVersion });
  });
  if (lifecycle === 'linked') expect(copied.payload.relations).toEqual([{ kind: 'supported_by', source: { itemId: copied.payload.items[0].id, version: 1 }, target: { itemId: copied.payload.items[1].id, version: 1 } }]);
  else expect(copied.payload.relations).toEqual([]);
});
it('keeps strict legacy v1 complete pairs and unknown versions distinct', () => {
  const doc = fixture(), legacy = createBusinessPair(doc, 'requirement', 'decision'); expect(legacy.schemaVersion).toBe(1); expect(legacy).not.toHaveProperty('lifecycle');
  expect(valid(attach(doc, legacy)).lifecycle).toBe('linked');
  const malformed = structuredClone(legacy); malformed.items.pop(); malformed.relations = [];
  expect(readBusinessPair(attach(doc, malformed)).status).toBe('invalid');
  expect(readBusinessPair({ ...doc, metadata: { [BUSINESS_PAIR_KEY]: { schemaVersion: 999, lifecycle: 'unlinked' } } }).status).toBe('unsupported');
});
it.each(['decision-only', 'relation', 'lifecycle', 'version', 'pin', 'duplicate-point'] as const)('refuses malformed %s standalone bytes without changing original', damage => {
  const doc = standalone(), one = payload(doc);
  if (damage === 'decision-only') one.items[0].kind = 'decision';
  if (damage === 'relation') one.relations.push({ kind: 'supported_by', source: { itemId: one.items[0].id, version: 1 }, target: { itemId: one.items[0].id, version: 1 } });
  if (damage === 'lifecycle') Object.assign(one, { lifecycle: 'draft' });
  if (damage === 'version') one.items[0].currentVersion = 2;
  if (damage === 'pin') one.items[0].versions[0].snapshotText = '{}';
  if (damage === 'duplicate-point') doc.content![0].content!.push(structuredClone(doc.content![0].content![0]));
  const before = structuredClone(doc);
  if (damage === 'duplicate-point') expect(valid(doc).items[0].state).toBe('unavailable'); else expect(readBusinessPair(doc).status).toBe('invalid');
  expect(() => linkBusinessDecision(doc, 'decision', 1)).toThrow(); expect(() => appendRequirementVersion(doc)).toThrow(); expect(doc).toEqual(before);
});
it('rejects invalid requested link versions and missing/same/ambiguous decision points without materializing defaults', () => {
  const doc = standalone(), before = structuredClone(doc);
  for (const version of [0, 2, 1.5, NaN]) expect(() => linkBusinessDecision(doc, 'decision', version)).toThrow();
  for (const bookmark of ['requirement', 'missing']) expect(() => linkBusinessDecision(doc, bookmark, 1)).toThrow();
  expect(doc).toEqual(before);
  doc.content![0].content!.push(structuredClone(doc.content![0].content![1])); const damaged = structuredClone(doc);
  expect(() => linkBusinessDecision(doc, 'decision', 1)).toThrow(); expect(doc).toEqual(damaged);
});

it('refuses a second bookmark in the requirement paragraph as a decision, while preserving legacy v1 behavior', () => {
  const doc = standalone();
  doc.content![0].content![0].content!.push({ stype: 'bookmarkAnchor', attributes: { id: 'same-paragraph-decision' } });
  const before = structuredClone(doc);
  expect(() => linkBusinessDecision(doc, 'same-paragraph-decision', 1)).toThrow(/separately authored/i);
  expect(doc).toEqual(before);
  const legacy = fixture(); legacy.content![0].content![0].content!.push({ stype: 'bookmarkAnchor', attributes: { id: 'legacy-second' } });
  expect(createBusinessPair(legacy, 'requirement', 'legacy-second').schemaVersion).toBe(1);
});
it('refuses unresolved reference authoring and unavailable requirement linkage without manufacturing a decision', () => {
  const raw = fixture(); raw.content![0].content![0].content!.push({ stype: 'fieldRef', attributes: { targetId: 'unavailable-reference' } });
  const before = structuredClone(raw); expect(() => createStandaloneRequirement(raw, 'requirement')).toThrow(); expect(raw).toEqual(before);
  const doc = standalone(); doc.content![0].content![0].content!.shift();
  const deleted = structuredClone(doc); expect(valid(doc).items[0].state).toBe('unavailable');
  expect(() => linkBusinessDecision(doc, 'decision', 1)).toThrow(); expect(doc).toEqual(deleted);
});
