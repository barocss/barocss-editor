import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { MembershipStore } from '../src/membership-store.js';
import { ProjectStore, validateProjectAction, verifyProjectTarget, type ProjectPin } from '../src/project-store.js';

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


describe('project execution current authority boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('retires captured authority on a membership lifetime change even when the event counter and editor role stay the same', async () => {
    const tenantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const actorId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const projectId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    let membershipVersion: string | undefined = '42';
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('project_current_actor')) return { rows: [{ id: actorId, role: 'editor' }] };
      if (sql.includes('project_execution_actor_epoch')) return { rows: [{ epoch: 'editor:0' }] };
      if (sql.includes('xmin::text')) {
        expect(values).toEqual([tenantId, actorId]);
        return { rows: membershipVersion ? [{ version: membershipVersion }] : [] };
      }
      if (sql.includes('FROM wonffice.projects')) return { rows: [{ id: projectId, workspace_id: doc, revision: 1,
        data: { id: projectId, title: 'Project', goal: '', archived: false, results: [], comments: [], works: [], activities: [], drafts: {} } }] };
      throw new Error('Unexpected SQL');
    });
    const client = { query } as unknown as PoolClient;
    vi.spyOn(MembershipStore.prototype, 'withAuthorizedTenant').mockImplementation(async (_principal, _tenant, operation) => operation(client, 'editor'));
    const store = new ProjectStore({} as Pool);
    const principal = { issuer: 'https://fixture.invalid', subject: 'writer' };
    const capture = () => store.withExecutionContext(principal, tenantId, projectId, true, async context => context.authorityEpoch);
    const original = await capture();
    expect(await capture()).toBe(original); // A true no-op does not replace the membership row.
    membershipVersion = '43';
    expect(await capture()).not.toBe(original); // Same current role/event counter, different committed lifetime.
    membershipVersion = undefined;
    const operation = vi.fn(async () => 'must not run');
    await expect(store.withExecutionContext(principal, tenantId, projectId, true, operation)).rejects.toThrow('tenant_access_denied');
    expect(operation).not.toHaveBeenCalled();
  });
});
