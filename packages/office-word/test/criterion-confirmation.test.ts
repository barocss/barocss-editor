import { describe, expect, it } from 'vitest';
import { appendDecisionVersion, BUSINESS_PAIR_KEY, createBusinessPair, deriveBusinessPair } from '../src/business-pair';
import { readWordFile, wordFileText } from '../src/word-file';
import { captureCriterionContext, compareCriterionContext } from '../src/criterion-confirmation';

interface TestNode { stype: string; content?: TestNode[]; attributes?: Record<string, unknown>; text?: string; marks?: { stype: string; range: [number, number] }[] }
function authored() {
  const document: { stype: string; metadata: { approved: boolean; actor: string; confirmedAt: string }; content: TestNode[] } = { stype: 'document', metadata: { approved: true, actor: 'forged', confirmedAt: 'forged' }, content: [
    { stype: 'surface', content: [
      { stype: 'paragraph', attributes: { styleId: 'custom' }, content: [{ stype: 'bookmarkAnchor', attributes: { id: 'requirement' } }, { stype: 'inline-text', text: 'Retain the original', marks: [{ stype: 'bold', range: [0, 6] }] }] },
      { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'decision' } }, { stype: 'inline-text', text: 'Save before changes', marks: [] }] }
    ] },
    { stype: 'resources', content: [{ stype: 'styleDef', attributes: { id: 'custom', name: 'Custom', type: 'paragraph', fontSize: 31 } }] }
  ] };
  const payload = createBusinessPair(document, 'requirement', 'decision');
  return { ...document, metadata: { ...document.metadata, [BUSINESS_PAIR_KEY]: payload } };
}

describe('exact native criterion confirmation context', () => {
  it('captures opaque identities, exact full rich pins and directed reference without mutating source or claiming approval', () => {
    const document = authored(); const before = structuredClone(document);
    const source = wordFileText(document, ''); const context = captureCriterionContext(source);
    const [requirement, decision] = document.metadata[BUSINESS_PAIR_KEY].items;
    expect(context).toEqual({ schemaVersion: 1,
      requirement: { itemId: requirement.id, version: 1, locator: requirement.locator, snapshotText: requirement.versions[0].snapshotText },
      decision: { itemId: decision.id, version: 1, currentVersion: 1, locator: decision.locator, snapshotText: decision.versions[0].snapshotText, currentSnapshotText: decision.versions[0].snapshotText },
      relation: document.metadata[BUSINESS_PAIR_KEY].relations[0] });
    expect(readWordFile(context.requirement.snapshotText)).toEqual(readWordFile(requirement.versions[0].snapshotText));
    expect(document).toEqual(before);
    expect(compareCriterionContext(source, context)).toBe(true);
    expect(Object.keys(context)).toEqual(['schemaVersion', 'requirement', 'decision', 'relation']);
  });
  it('allows an explicit current decision v2 context with the retained exact v1 pin, but retires the earlier capture', () => {
    const document = authored(); const earlier = captureCriterionContext(wordFileText(document, ''));
    document.content[0].content![1].content![1].text = 'Keep two backups';
    document.metadata[BUSINESS_PAIR_KEY] = appendDecisionVersion(document);
    const source = wordFileText(document, ''); const current = captureCriterionContext(source);
    expect(current.decision.version).toBe(1); expect(current.decision.currentVersion).toBe(2);
    expect(current.decision.snapshotText).toBe(earlier.decision.snapshotText);
    expect(current.decision.currentSnapshotText).toContain('Keep two backups');
    expect(current.relation).toEqual(earlier.relation);
    expect(compareCriterionContext(source, earlier)).toBe(false);
    expect(compareCriterionContext(source, current)).toBe(true);
  });
  it('refuses changed source and resources, missing and ambiguous points, preserving complete native content', () => {
    for (const mutate of [
      (doc: ReturnType<typeof authored>) => { doc.content[0].content![0].content![1].text = 'Changed criterion'; },
      (doc: ReturnType<typeof authored>) => { doc.content[1].content![0].attributes!.fontSize = 47; },
      (doc: ReturnType<typeof authored>) => { doc.content[0].content![0].content!.shift(); },
      (doc: ReturnType<typeof authored>) => { doc.content[0].content!.push(structuredClone(doc.content[0].content![0])); }
    ]) {
      const document = authored(); const context = captureCriterionContext(wordFileText(document, ''));
      mutate(document); const before = structuredClone(document); const source = wordFileText(document, '');
      expect(() => captureCriterionContext(source)).toThrow();
      expect(compareCriterionContext(source, context)).toBe(false); expect(document).toEqual(before);
    }
  });
  it('strictly refuses forged extra fields and altered identities, versions, locators or full rich pin data', () => {
    const source = wordFileText(authored(), ''); const context = captureCriterionContext(source);
    const forged = [
      { ...context, actor: 'forged' }, { ...context, schemaVersion: 2 },
      { ...context, requirement: { ...context.requirement, approved: true } },
      { ...context, requirement: { ...context.requirement, version: 2 } },
      { ...context, decision: { ...context.decision, currentSnapshotText: '{}' } },
      { ...context, decision: { ...context.decision, locator: { kind: 'point-bookmark', bookmarkId: 'other' } } },
      { ...context, relation: { ...context.relation, source: context.relation.target, target: context.relation.source } }
    ];
    for (const expected of forged) expect(compareCriterionContext(source, expected)).toBe(false);
    expect(compareCriterionContext(source, { relation: context.relation, decision: context.decision, requirement: context.requirement, schemaVersion: 1 })).toBe(true);
  });
  it('separates unsupported, absent, malformed files and invalid historic rich content from confirmable source', () => {
    const document = authored(); const context = captureCriterionContext(wordFileText(document, ''));
    const absent = structuredClone(document); delete (absent.metadata as Record<string, unknown>)[BUSINESS_PAIR_KEY];
    const unsupported = structuredClone(document); Object.assign(unsupported.metadata[BUSINESS_PAIR_KEY], { schemaVersion: 2 });
    const invalid = structuredClone(document); invalid.metadata[BUSINESS_PAIR_KEY].items[0].versions[0].snapshotText = '{}';
    for (const source of ['{', '{}', wordFileText(absent, ''), wordFileText(unsupported, ''), wordFileText(invalid, '')]) {
      expect(() => captureCriterionContext(source)).toThrow(); expect(compareCriterionContext(source, context)).toBe(false);
    }
  });
  it('independent derived identities cannot reuse the original captured context or inherit native approval claims', () => {
    const document = authored(); const source = wordFileText(document, ''); const original = captureCriterionContext(source);
    const derived = deriveBusinessPair(document); const copySource = wordFileText(derived, ''); const copy = captureCriterionContext(copySource);
    expect(copy.requirement.itemId).not.toBe(original.requirement.itemId);
    expect(copy.decision.itemId).not.toBe(original.decision.itemId);
    expect(copy.requirement.snapshotText).toBe(original.requirement.snapshotText);
    expect(compareCriterionContext(copySource, original)).toBe(false);
    expect(compareCriterionContext(source, copy)).toBe(false);
    expect(copy).not.toHaveProperty('approved'); expect(copy).not.toHaveProperty('actor');
  });
});
