import { describe, expect, it } from 'vitest';
import { validateProjectAction, verifyProjectTarget, type ProjectPin } from '../src/project-store.js';

const doc = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const pin = (document: unknown): ProjectPin => ({ id: 'pin', document: { product: 'word', id: doc },
  revision: 3, text: JSON.stringify({ format: 'barocss-word', version: 1, document }), title: 'Guide' });
const run = { stype: 'inline-text', text: 'Original guide', marks: [{ stype: 'commentRef',
  attrs: { id: 'comment-1' }, range: [0, 8] }] };
const thread = { stype: 'commentThread', attributes: { id: 'comment-1' }, content: [] };
const target = { kind: 'word-comment' as const, id: 'comment-1', quote: 'Original' };

describe('bounded project input', () => {
  it('accepts only human commands with literal source revision evidence', () => {
    for (const action of [{ type: 'metadata', title: 'Windows beta' }, { type: 'pause', workId: doc, paused: false },
      { type: 'comment', resultId: doc, target, body: 'Also update training', source: { documentId: doc, revision: 3, snapshotHash: 'a'.repeat(64) } },
      { type: 'pin-input', resultId: doc, source: { documentId: doc, revision: 3, snapshotHash: 'a'.repeat(64) } }]) {
      expect(() => validateProjectAction(action)).not.toThrow();
    }
  });
  it('rejects forged actors, execution claims, snapshot text, references and coercion', () => {
    for (const action of [{ type: 'applied', state: 'completed' }, { type: 'metadata', title: 'Valid', actor: doc },
      { type: 'pause', workId: doc, paused: 'false' }, { type: 'request', commentId: doc, request: 'Update', state: 'applied' },
      { type: 'pin-input', resultId: doc, source: { documentId: doc, revision: 3, snapshotHash: 'a'.repeat(64), text: 'forged' } },
      { type: 'link-result', name: 'Result', document: { product: 'yorkie', id: doc } },
      { type: 'metadata' }]) expect(() => validateProjectAction(action)).toThrow();
  });
});
describe('canonical native anchor evidence', () => {
  it('accepts an exact single persisted thread and quoted region', () => {
    expect(() => verifyProjectTarget(pin({ stype: 'document', content: [run, { stype: 'resources', content: [thread] }] }), target)).not.toThrow();
  });
  it('refuses missing, ambiguous, stale quotes and runtime identifiers', () => {
    for (const [document, changedTarget] of [
      [{ stype: 'document', content: [run] }, target],
      [{ stype: 'document', content: [run, { stype: 'resources', content: [thread, thread] }] }, target],
      [{ stype: 'document', content: [run, run, { stype: 'resources', content: [thread] }] }, target],
      [{ stype: 'document', content: [run, { stype: 'resources', content: [thread] }] }, { ...target, quote: 'Changed' }],
      [{ stype: 'document', content: [run, { stype: 'resources', content: [thread] }] }, { ...target, id: 'runtime-sid' }],
      [{ stype: 'document', content: [run, thread] }, target],
    ] as const) expect(() => verifyProjectTarget(pin(document), changedTarget)).toThrow('target_conflict');
  });
  it('does not interpret a document locator as a quoted region', () => {
    const documentPin = pin({ stype: 'document', content: [] });
    expect(() => verifyProjectTarget(documentPin, { kind: 'document', id: doc, quote: '' })).not.toThrow();
    expect(() => verifyProjectTarget(documentPin, { kind: 'document', id: doc, quote: 'guess' })).toThrow();
  });
});
