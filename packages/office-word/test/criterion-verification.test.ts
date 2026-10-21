import { describe, expect, it } from 'vitest';
import { appendRequirementVersion, BUSINESS_PAIR_KEY, createBusinessPair, readBusinessPair } from '../src/business-pair';
import { captureCriterionContext } from '../src/criterion-confirmation';
import { CRITERION_EVALUATOR, captureExecutableCriterion, evaluateRenderedCriterion, getCriterionSpecimen, listCriterionSpecimens, type RenderedCriterionInput } from '../src/criterion-verification';
import { readWordFile, wordFileText } from '../src/word-file';

interface Node { stype: string; text?: string; attributes?: Record<string, unknown>; content?: Node[]; marks?: { stype: string; range: [number, number] }[] }
const sentence = 'Fictional active-button contrast: minimum 4.5:1.';
function authored() {
  const original: { stype: string; content: Node[]; metadata: Record<string, unknown> } = { stype: 'document', metadata: { original: 'fictional', approved: true }, content: [
    { stype: 'surface', content: [
      { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'req' } }, { stype: 'inline-text', text: 'Retain the full native source.', marks: [{ stype: 'bold', range: [0, 6] }] }] },
      { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'dec' } }, { stype: 'inline-text', text: 'Keep exact pinned evidence.' }] }
    ] }, { stype: 'resources', content: [{ stype: 'styleDef', attributes: { id: 'custom', name: 'Custom', type: 'paragraph', fontSize: 31 } }] }
  ] };
  return { ...original, metadata: { ...original.metadata, [BUSINESS_PAIR_KEY]: createBusinessPair(original, 'req', 'dec') } };
}
function changed(text = `Retain the full native source. ${sentence}`) {
  const doc = authored(); doc.content[0].content![0].content![1].text = text;
  doc.metadata[BUSINESS_PAIR_KEY] = appendRequirementVersion(doc); return doc;
}
function readCriterion(text?: string) { return captureExecutableCriterion(captureCriterionContext(wordFileText(changed(text), ''))); }
const opaque: RenderedCriterionInput = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)', opacity: '1', backgroundImage: 'none', ancestorOpacities: ['1', '1'], tagName: 'BUTTON', disabled: false, visibility: 'visible', display: 'inline-block' };

describe('one explicitly authored fictional rendered criterion', () => {
  it('advances only a genuinely changed requirement, retaining all old full pins, identity and exact decision reference', () => {
    const doc = authored(); const before = structuredClone(doc.metadata[BUSINESS_PAIR_KEY]);
    expect(() => appendRequirementVersion(doc)).toThrow();
    doc.content[0].content![0].content![1].text += ` ${sentence}`;
    const source = structuredClone(doc); const payload = appendRequirementVersion(doc);
    expect(doc).toStrictEqual(source); expect(payload.items[0].id).toBe(before.items[0].id); expect(payload.items[0].currentVersion).toBe(2);
    expect(payload.items[0].versions[0]).toStrictEqual(before.items[0].versions[0]); expect(payload.items[1]).toStrictEqual(before.items[1]);
    expect(payload.relations[0]).toStrictEqual({ ...before.relations[0], source: { itemId: before.items[0].id, version: 2 } });
    const parsed = readWordFile(payload.items[0].versions[1].snapshotText); if ('error' in parsed) throw Error(parsed.error);
    const expected: typeof doc = structuredClone(doc); delete (expected.metadata as Record<string, unknown>)[BUSINESS_PAIR_KEY];
    expect(parsed.document).toStrictEqual(expected);
    doc.metadata[BUSINESS_PAIR_KEY] = payload; expect(readBusinessPair(doc)).toMatchObject({ status: 'valid', review: 'current' });
  });
  it('refuses missing or ambiguous requirement and leaves full native source and history payload unchanged', () => {
    for (const kind of ['missing', 'duplicate'] as const) {
      const doc = authored(); doc.content[0].content![0].content![1].text += ` ${sentence}`;
      if (kind === 'missing') doc.content[0].content![0].content!.shift(); else doc.content[0].content!.push(structuredClone(doc.content[0].content![0]));
      const before = structuredClone(doc); expect(() => appendRequirementVersion(doc)).toThrow(); expect(doc).toStrictEqual(before);
    }
  });
  it('parses only the one explicit independently authored sentence from the exact full rich pinned requirement', () => {
    expect(readCriterion()).toStrictEqual({ status: 'executable', criterion: { schemaVersion: 1, kind: 'fictional-active-button-contrast', minimumRatio: 4.5, authoredSentence: sentence } });
    const qualitative = captureExecutableCriterion(captureCriterionContext(wordFileText(authored(), ''))); expect(qualitative.status).toBe('unsupported');
    for (const text of [sentence + ' ' + sentence, 'minimum 4.5:1.', 'Fictional active-button contrast: minimum 0:1.', 'Fictional active-button contrast: minimum 22:1.', 'Fictional active-button contrast: minimum NaN:1.', 'Fictional active-button contrast: minimum 4.5:1. Fictional active-button contrast: minimum unknown:1.']) expect(readCriterion(text).status).toBe('unsupported');
    for (const ratio of ['1', '21', '7.25']) expect(readCriterion(`Fictional active-button contrast: minimum ${ratio}:1.`)).toMatchObject({ status: 'executable', criterion: { minimumRatio: Number(ratio) } });
  });
  it('refuses unsupported native fields, ambiguous pinned locators and schema-invalid rich source instead of inferred text', () => {
    const context = captureCriterionContext(wordFileText(changed(), '')); const original = structuredClone(context);
    const file = readWordFile(context.requirement.snapshotText); if ('error' in file) throw Error(file.error);
    const doc = file.document as { stype: string; content: Node[] };
    doc.content[0].content![0].content!.push({ stype: 'fieldDocTitle' });
    expect(captureExecutableCriterion({ ...context, requirement: { ...context.requirement, snapshotText: wordFileText(doc, '') } }).status).toBe('unsupported');
    doc.content[0].content![0].content!.pop(); doc.content[0].content!.push(structuredClone(doc.content[0].content![0]));
    expect(captureExecutableCriterion({ ...context, requirement: { ...context.requirement, snapshotText: wordFileText(doc, '') } }).status).toBe('unsupported');
    doc.content[0].content!.pop(); doc.content[0].content![0].content!.push({ stype: 'inventedField' });
    expect(captureExecutableCriterion({ ...context, requirement: { ...context.requirement, snapshotText: wordFileText(doc, '') } }).status).toBe('unsupported');
    expect(context).toStrictEqual(original);
  });
  it('keeps a closed immutable specimen/evaluator registry and rejects unknown specimen IDs', () => {
    const registry = listCriterionSpecimens(); expect(registry.map(one => one.id)).toEqual(['dark', 'low', 'transparent']);
    registry.forEach(one => { expect(one.version).toBe(1); expect(one.sourceText).toContain('id="criterion-specimen"'); expect(Object.isFrozen(one)).toBe(true); });
    expect(Object.isFrozen(registry)).toBe(true); expect(getCriterionSpecimen('dark')).toBe(registry[0]); expect(getCriterionSpecimen('arbitrary-url')).toBeUndefined();
    expect(CRITERION_EVALUATOR).toMatchObject({ id: 'opaque-solid-contrast', version: 1 }); expect(Object.isFrozen(CRITERION_EVALUATOR)).toBe(true);
  });
  it('calculates real supported measurement inputs rather than any submitted success flag', () => {
    const read = readCriterion(); if (read.status !== 'executable') throw Error('Not executable');
    const before = structuredClone(opaque); const passed = evaluateRenderedCriterion(read.criterion, opaque);
    expect(passed).toMatchObject({ status: 'passed', ratio: 21, minimumRatio: 4.5, foregroundLuminance: 0, backgroundLuminance: 1, foreground: { r: 0, g: 0, b: 0 }, background: { r: 255, g: 255, b: 255 }, inputs: opaque });
    expect(opaque).toStrictEqual(before);
    const low = { ...opaque, color: 'rgb(119, 119, 119)', backgroundColor: 'rgb(136, 136, 136)', passed: true };
    const failed = evaluateRenderedCriterion(read.criterion, low); expect(failed.status).toBe('failed');
    if (failed.status === 'unsupported') throw Error(failed.reason);
    expect(failed.ratio).toBeCloseTo(1.263, 2); expect(failed.inputs).toStrictEqual(low);
  });
  it('reports transparency, gradients/images, unsupported encodings and nonrendered/inactive controls explicitly unsupported', () => {
    const read = readCriterion(); if (read.status !== 'executable') throw Error('Not executable');
    for (const input of [ { ...opaque, color: 'rgba(255, 255, 255, 0.5)' }, { ...opaque, color: '#000000' }, { ...opaque, color: 'color(display-p3 0 0 0)' },
      { ...opaque, color: 'rgb(256, 0, 0)' }, { ...opaque, backgroundColor: 'transparent' }, { ...opaque, opacity: '0.5' },
      { ...opaque, ancestorOpacities: ['1', '0.5'] }, { ...opaque, backgroundImage: 'linear-gradient(white, black)' }, { ...opaque, backgroundImage: 'url(fake.png)' },
      { ...opaque, disabled: true }, { ...opaque, visibility: 'hidden' }, { ...opaque, display: 'none' }, { ...opaque, tagName: 'DIV' } ]) {
      const result = evaluateRenderedCriterion(read.criterion, input); expect(result).toMatchObject({ status: 'unsupported', inputs: input });
    }
    expect(evaluateRenderedCriterion(read.criterion, { ...opaque, color: 'rgba(0, 0, 0, 1)' }).status).toBe('passed');
  });
});
