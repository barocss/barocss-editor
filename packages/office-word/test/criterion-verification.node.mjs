import assert from 'node:assert/strict';
import { captureCriterionContext, captureExecutableCriterion, evaluateRenderedCriterion, listCriterionSpecimens, getCriterionSpecimen, CRITERION_EVALUATOR } from '@barocss/office-word/criterion-confirmation';

// Built Node API arithmetic/source probe only. This is not a browser execution.
const sentence = 'Fictional active-button contrast: minimum 4.5:1.';
const document = { stype: 'document', content: [{ stype: 'surface', content: [
  { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'req' } }, { stype: 'inline-text', text: `Preserve original source. ${sentence}`, marks: [{ stype: 'bold', range: [0, 8] }] }] },
  { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'dec' } }, { stype: 'inline-text', text: 'Save full native evidence' }] }
] }] };
const file = tree => JSON.stringify({ format: 'barocss-word', version: 1, savedAt: '', document: tree });
const pin = file(document);
const req = '11111111-1111-4111-8111-111111111111', dec = '22222222-2222-4222-8222-222222222222';
const source = file({ ...document, metadata: { wonfficeBusinessPair: { schemaVersion: 1,
  items: [['requirement', req, 'req'], ['decision', dec, 'dec']].map(([kind, id, bookmarkId]) => ({ id, kind, currentVersion: 1, locator: { kind: 'point-bookmark', bookmarkId }, versions: [{ version: 1, snapshotText: pin }] })),
  relations: [{ kind: 'supported_by', source: { itemId: req, version: 1 }, target: { itemId: dec, version: 1 } }]
} } });
const context = captureCriterionContext(source), read = captureExecutableCriterion(context);
assert.equal(read.status, 'executable'); assert.equal(read.criterion.minimumRatio, 4.5);
assert.equal(context.requirement.snapshotText, pin);
const input = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)', opacity: '1', backgroundImage: 'none', ancestorOpacities: ['1', '1'], tagName: 'BUTTON', disabled: false, visibility: 'visible', display: 'inline-block' };
assert.equal(evaluateRenderedCriterion(read.criterion, input).ratio, 21);
assert.equal(evaluateRenderedCriterion(read.criterion, { ...input, color: 'rgb(119, 119, 119)', backgroundColor: 'rgb(136, 136, 136)' }).status, 'failed');
assert.equal(evaluateRenderedCriterion(read.criterion, { ...input, color: 'rgba(255, 255, 255, 0.5)' }).status, 'unsupported');
assert.deepEqual(listCriterionSpecimens().map(one => one.id), ['dark', 'low', 'transparent']);
assert.equal(getCriterionSpecimen('https://untrusted.invalid'), undefined);
assert.equal(CRITERION_EVALUATOR.version, 1);
console.log(`Node ${process.version}: built full native parser, immutable registry and pure evaluator passed; actual browser execution not claimed`);
