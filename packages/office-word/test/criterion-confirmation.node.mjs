import assert from 'node:assert/strict';
import { captureCriterionContext, compareCriterionContext } from '@barocss/office-word/criterion-confirmation';

// This is a Node-only import/validation probe, not UI authorship or authentication.
const document = { stype: 'document', content: [{ stype: 'surface', content: [
  { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'req' } }, { stype: 'inline-text', text: 'Preserve native source', marks: [{ stype: 'bold', range: [0, 8] }] }] },
  { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'dec' } }, { stype: 'inline-text', text: 'Save a full snapshot' }] }
] }] };
const file = tree => JSON.stringify({ format: 'barocss-word', version: 1, savedAt: '', document: tree });
const pin = file(document);
const req = '11111111-1111-4111-8111-111111111111', dec = '22222222-2222-4222-8222-222222222222';
const source = file({ ...document, metadata: { wonfficeBusinessPair: { schemaVersion: 1,
  items: [['requirement', req, 'req'], ['decision', dec, 'dec']].map(([kind, id, bookmarkId]) => ({ id, kind, currentVersion: 1, locator: { kind: 'point-bookmark', bookmarkId }, versions: [{ version: 1, snapshotText: pin }] })),
  relations: [{ kind: 'supported_by', source: { itemId: req, version: 1 }, target: { itemId: dec, version: 1 } }]
} } });
const context = captureCriterionContext(source);
assert.equal(context.requirement.itemId, req);
assert.equal(context.requirement.snapshotText, pin);
assert.equal(context.decision.snapshotText, pin);
assert.equal(compareCriterionContext(source, context), true);
assert.equal(compareCriterionContext(source, { ...context, actor: 'forged' }), false);
assert.equal(compareCriterionContext('{}', context), false);
const changed = JSON.parse(source);
changed.document.content[0].content[0].content[1].text = 'Changed criterion';
assert.throws(() => captureCriterionContext(JSON.stringify(changed)));
assert.equal(compareCriterionContext(JSON.stringify(changed), context), false);
console.log(`Node ${process.version}: built package import, rich native pins, exact context and stale-source refusal passed`);
