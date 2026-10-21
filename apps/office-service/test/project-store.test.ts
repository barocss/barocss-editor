import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { captureExecutionTarget } from '../src/project-execution-native.js';
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


describe('ordered multi-run project comment coverage', () => {
  const multi = () => {
    const runs = [
      { stype: 'inline-text', text: 'prefix First ', attributes: { id: 'native-plain' }, marks: [{ stype: 'commentRef', attrs: { id: 'comment-1', part: 0 }, range: [7, 13] }] },
      { stype: 'inline-text', text: 'bold ', attributes: { id: 'native-bold' }, marks: [{ stype: 'bold', attrs: {}, range: [0, 5] }, { stype: 'commentRef', attrs: { id: 'comment-1', part: 1 }, range: [0, 5] }] },
      { stype: 'inline-text', text: 'link suffix', attributes: { id: 'native-link' }, marks: [{ stype: 'link', attrs: { href: 'https://fictional.invalid' }, range: [0, 11] }, { stype: 'commentRef', attrs: { id: 'comment-1', part: 2 }, range: [0, 4] }] },
    ];
    const paragraph = { stype: 'paragraph', attributes: {} as Record<string, unknown>, content: runs };
    const record = { stype: 'commentThread', attributes: { id: 'comment-1', resolved: false, coverage: [{ text: 'First ' }, { text: 'bold ' }, { text: 'link' }] }, content: [] };
    return { document: { stype: 'document', attributes: {} as Record<string, unknown>, content: [paragraph, { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'First bold link' }] }, { stype: 'resources', content: [record] }] }, paragraph, runs, record };
  };
  const marked = (f: ReturnType<typeof multi>, index: number) => f.runs[index].marks.find(mark => mark.stype === 'commentRef')!;
  const multiTarget = { ...target, quote: 'First bold link' };
  it('accepts exact indexed native coverage across plain bold and link runs without modifying the document or searching equal quotes', () => {
    const f = multi(), before = JSON.stringify(f.document);
    expect(() => verifyProjectTarget(pin(f.document), multiTarget)).not.toThrow();
    expect(JSON.stringify(f.document)).toBe(before);
    try { captureExecutionTarget(pin(f.document).text, multiTarget); throw new Error('must refuse multi-run execution'); }
    catch (error) { expect(error).toMatchObject({ status: 422, reason: 'unsupported_target' }); }
  });
  const malformed: Array<[string, (f: ReturnType<typeof multi>) => void]> = [
    ['missing part', f => { f.runs[1].marks = f.runs[1].marks.filter(mark => mark.stype !== 'commentRef'); }],
    ['duplicate part', f => { marked(f, 1).attrs.part = 0; }],
    ['out-of-order parts', f => { marked(f, 0).attrs.part = 2; marked(f, 2).attrs.part = 0; }],
    ['changed selected text', f => { f.runs[1].text = 'other'; }],
    ['changed coverage', f => { f.record.attributes.coverage[1].text = 'other'; }],
    ['unselected gap run', f => { f.paragraph.content.splice(1, 0, { stype: 'inline-text', text: 'gap', attributes: { id: 'gap' }, marks: [] }); }],
    ['incomplete first endpoint', f => { marked(f, 0).range[1]--; }],
    ['incomplete last endpoint', f => { marked(f, 2).range[0]++; }],
    ['locked paragraph', f => { f.paragraph.attributes.locked = true; }],
    ['protected ancestor', f => { f.document.attributes.protected = true; }],
    ['content control', f => { f.paragraph.stype = 'contentControl'; }],
    ['non-text anchor', f => { f.runs[1].stype = 'paragraph'; }],
    ['cross paragraph', f => { f.document.content.push({ stype: 'paragraph', attributes: {}, content: [f.paragraph.content.pop()!] }); }],
    ['locked run', f => { Object.assign(f.runs[1].attributes, { locked: true }); }],
    ['empty coverage descriptor', f => { f.record.attributes.coverage[1].text = ''; }],
    ['negative part', f => { marked(f, 1).attrs.part = -1; }],
    ['runtime node identity', f => { Object.assign(f.runs[1], { sid: 'runtime-only' }); }],
    ['forged runtime part metadata', f => { Object.assign(marked(f, 0).attrs, { sid: 'runtime-only' }); }],
    ['forged coverage metadata', f => { Object.assign(f.record.attributes.coverage[0], { sid: 'runtime-only' }); }],
    ['extra marked duplicate', f => { f.paragraph.content.push(structuredClone(f.runs[2])); }],
  ];
  it.each(malformed)('refuses %s instead of rebinding or weakening coverage', (_name, mutate) => {
    const f = multi(); mutate(f);
    expect(() => verifyProjectTarget(pin(f.document), multiTarget)).toThrow('target_conflict');
  });
});

describe('strict Note paragraph request descriptor', () => {
  const target = { kind: 'note-paragraph' as const, id: '11111111-1111-4111-8111-111111111111', quote: 'Selected paragraph',
    selector: { version: 1 as const, pageId: doc, paragraphIndex: 0 } };
  const source = { documentId: doc, revision: 1, snapshotHash: 'a'.repeat(64) };
  const action = () => ({ type: 'comment', resultId: doc, target: structuredClone(target), body: 'Make the request clear', source });
  it('accepts a bounded descriptor and verifies the exact Note source, without inserting a native comment', () => {
    expect(() => validateProjectAction(action())).not.toThrow();
    const original = { stype: 'note', attributes: { title: 'Note', pageId: doc }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: target.quote }] }
    ] };
    const notePin: ProjectPin = { id: 'pin', document: { product: 'note', id: doc }, revision: 1,
      text: JSON.stringify({ format: 'barocss-note', version: 1, document: original }), title: 'Note' };
    const before = structuredClone(notePin);
    expect(() => verifyProjectTarget(notePin, target)).not.toThrow(); expect(notePin).toEqual(before);
    expect(() => verifyProjectTarget({ ...notePin, document: { product: 'word', id: doc } }, target)).toThrow('unsupported_target');
  });
  it.each(['missing-selector', 'extra-field', 'extra-selector', 'negative-index', 'fractional-index', 'version', 'runtime-id', 'empty-quote'])(
    'refuses %s without an execution or storage claim', mode => {
      const one = action();
      if (mode === 'missing-selector') Reflect.deleteProperty(one.target, 'selector');
      if (mode === 'extra-field') Object.assign(one.target, { sid: 'runtime-only' });
      if (mode === 'extra-selector') Object.assign(one.target.selector, { nodeId: 'runtime-only' });
      if (mode === 'negative-index') one.target.selector.paragraphIndex = -1;
      if (mode === 'fractional-index') one.target.selector.paragraphIndex = 0.5;
      if (mode === 'version') Object.assign(one.target.selector, { version: 2 });
      if (mode === 'runtime-id') one.target.id = 'runtime:1';
      if (mode === 'empty-quote') one.target.quote = '';
      expect(() => validateProjectAction(one)).toThrow();
    });
});
