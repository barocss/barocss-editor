import { afterEach, describe, expect, it, vi } from 'vitest';
import { addChild, setText } from '@barocss/model';
import { defineOperation } from '../../model/src/operations/define-operation';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { openNoteTree, type NoteSession } from '../src/session';
import { noteRegistry } from '../src/renderers';
import {
  bindNotePrecommit,
  type NotePrecommitOptions,
  type NoteRecoveryIntent,
  type NoteResourceBinding,
} from '../src/collaborative-precommit';

const sessions: NoteSession[] = [];
const note = () => {
  const session = openNoteTree({ sid: 'doc', stype: 'note', content: [{
    sid: 'p', stype: 'paragraph', content: [{ sid: 't', stype: 'inline-text', text: 'before' }],
  }] });
  sessions.push(session);
  return session;
};
const binding = (resourceId = 'node-body'): NoteResourceBinding => ({
  issuer: 'https://issuer.example', subject: 'user-a', tenantId: 'tenant-a',
  workspaceId: 'workspace-a', documentId: 'document-a', resourceId,
  actorId: 'actor-a', sessionId: 'session-a',
});
const install = (session: NoteSession, overrides: Partial<NotePrecommitOptions> = {}) => {
  const intents: NoteRecoveryIntent[] = [];
  const append = vi.fn((intent: Readonly<NoteRecoveryIntent>) => {
    intents.push(structuredClone(intent));
  });
  const dispose = bindNotePrecommit({
    editor: session.editor,
    binding: binding(),
    validate: () => {},
    baseCheckpoint: () => 'checkpoint-7',
    journal: { append },
    ...overrides,
  });
  return { intents, append, dispose };
};
afterEach(() => sessions.splice(0).forEach(session => session.close()));

describe('Note collaborative pre-commit journal', () => {
  it('records a direct transaction before its model, history, or notifications commit', async () => {
    const session = note();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const append = vi.fn((intent: Readonly<NoteRecoveryIntent>) => {
      if (intent.phase === 'prepared') { entered(); return gate; }
    });
    const event = vi.fn();
    const exportedAtEvent: string[] = [];
    session.editor.on('editor:content.change', (payload: unknown) => {
      event(payload);
      exportedAtEvent.push(session.editor.exportDocument().content[0].content[0].text);
    });
    install(session, { journal: { append } });

    const edit = session.editor.executeTransaction({ operations: [setText('t', 'after')] });
    await waiting;
    // getNode reads the transaction overlay while the lock is held; getNodes
    // is the committed map that the editor has not published yet.
    expect(session.editor.dataStore.getNodes().get('t')?.text).toBe('before');
    expect(session.editor.historyManager.getHistory()).toHaveLength(0);
    expect(event).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0]).toMatchObject({
      version: 1, phase: 'prepared', editId: expect.any(String), origin: 'local',
      baseCheckpoint: 'checkpoint-7', candidateRootId: 'doc',
      binding: { resourceId: 'node-body', actorId: 'actor-a' },
      operations: [{ type: 'setText', payload: { nodeId: 't', text: 'after' } }],
    });
    release();
    expect(await edit).toMatchObject({ success: true, committed: true });
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[1][0]).toMatchObject({ phase: 'executed',
      editId: append.mock.calls[0][0].editId });
    expect(session.editor.dataStore.getNode('t')?.text).toBe('after');
    expect(session.editor.historyManager.getHistory()).toHaveLength(1);
    expect(event).toHaveBeenCalledOnce();
    expect(exportedAtEvent).toEqual(['after']);
  });

  it('refuses a menu command and a structural operation when durable storage fails', async () => {
    const session = note();
    const before = JSON.stringify([...session.editor.dataStore.getNodes()]);
    const changed = vi.fn();
    session.editor.on('editor:content.change', changed);
    install(session, { journal: { append: () => { throw new Error('quota exhausted'); } } });

    expect(await session.editor.executeCommand('replaceText', {
      range: { type: 'range', startNodeId: 't', endNodeId: 't',
        startOffset: 1, endOffset: 1, collapsed: true }, text: 'X',
    })).toBe(false);
    const structural = await session.editor.executeTransaction({ operations: [
      addChild('doc', { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'new' }] }),
    ] });
    expect(structural).toMatchObject({ success: false, committed: false,
      errors: [expect.stringContaining('quota exhausted')] });
    expect(JSON.stringify([...session.editor.dataStore.getNodes()])).toBe(before);
    expect(session.editor.historyManager.getHistory()).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it('journals undo and redo as separate actor intents before moving history', async () => {
    const session = note();
    const { intents } = install(session);
    expect((await session.editor.executeTransaction({ operations: [setText('t', 'after')] })).committed).toBe(true);
    expect(await session.editor.undo()).toBe(true);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
    expect(await session.editor.redo()).toBe(true);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('after');
    expect(intents.map(intent => [intent.origin, intent.phase])).toEqual([
      ['local', 'prepared'], ['local', 'executed'],
      ['history', 'prepared'], ['history', 'executed'],
      ['history', 'prepared'], ['history', 'executed'],
    ]);
    expect(new Set(intents.map(intent => intent.editId)).size).toBe(3);
    expect(intents.every(intent => intent.binding.actorId === 'actor-a')).toBe(true);
  });

  it('restores the history cursor when an undo intent cannot be stored', async () => {
    const session = note();
    let fail = false;
    const { intents } = install(session, { journal: { append: intent => {
      if (fail) throw new Error('storage unavailable');
      intents.push(structuredClone(intent));
    } } });
    expect((await session.editor.executeTransaction({ operations: [setText('t', 'after')] })).committed).toBe(true);
    const before = session.editor.historyManager.getStats();
    fail = true;
    expect(await session.editor.undo()).toBe(false);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('after');
    expect(session.editor.historyManager.getStats()).toEqual(before);
    expect(intents).toHaveLength(2);
  });

  it('gives the policy an isolated actual Note candidate, including schema functions', async () => {
    const session = note();
    const before = session.editor.dataStore.getNode('p')?.content;
    const { append } = install(session, { validate: ({ candidate }) => {
      const node = candidate.getNode('p')!;
      expect(node.content).toEqual(before);
      node.content!.push('fake-child');
      return 'blocked after candidate inspection';
    } });
    const result = await session.editor.executeTransaction({ operations: [setText('t', 'after')] });
    expect(result).toMatchObject({ success: false, committed: false });
    expect(session.editor.dataStore.getNode('p')?.content).toEqual(before);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0].phase).toBe('prepared');
  });

  it('does not journal remote transactions and rejects unsupported local work before history', async () => {
    const session = note();
    const validate = vi.fn(({ provenance }) =>
      provenance.origin === 'local' ? 'unsupported provider mapping' : undefined);
    const { append } = install(session, { validate });
    const denied = await session.editor.executeTransaction({ operations: [setText('t', 'local')] });
    expect(denied).toMatchObject({ success: false, committed: false,
      errors: ['unsupported provider mapping'] });
    const remote = await session.editor.executeTransaction({
      operations: [setText('t', 'remote')],
      options: { provenance: { origin: 'remote', editId: 'remote-1', actorId: 'actor-b', sessionId: 'session-b' } },
    });
    expect(remote).toMatchObject({ success: true, committed: true });
    expect(session.editor.dataStore.getNode('t')?.text).toBe('remote');
    expect(session.editor.historyManager.getHistory()).toHaveLength(0);
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0].phase).toBe('prepared');
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('binds a nested item body to its stable parent and refuses an unrecordable operation', async () => {
    const parent = note();
    const child = note();
    const { intents: parentIntents } = install(parent);
    const { intents: childIntents } = install(child, {
      binding: { ...binding('body-node-9'), parentResourceId: 'database-row-4' },
    });
    expect((await parent.editor.executeTransaction({ operations: [setText('t', 'parent')] })).committed).toBe(true);
    expect((await child.editor.executeTransaction({ operations: [setText('t', 'child')] })).committed).toBe(true);
    expect(parentIntents[0].binding.resourceId).toBe('node-body');
    expect(childIntents[0].binding).toMatchObject({
      resourceId: 'body-node-9', parentResourceId: 'database-row-4', documentId: 'document-a',
    });
    const before = child.editor.dataStore.getNode('t')?.text;
    const opaque = await child.editor.executeTransaction({ operations: [{
      type: 'op-function', execute: (context: { dataStore: { updateNode: (id: string, value: unknown) => void } }) => {
        context.dataStore.updateNode('t', { text: 'opaque' });
      },
    }] });
    expect(opaque).toMatchObject({ success: false, committed: false,
      errors: ['Note edit has no recoverable operation descriptor'] });
    expect(child.editor.dataStore.getNode('t')?.text).toBe(before);
    expect(childIntents).toHaveLength(2);
  });

  it('rejects a mixed opaque mutation without recording only its visible sibling', async () => {
    const session = note();
    const { intents } = install(session);
    const result = await session.editor.executeTransaction({ operations: [
      setText('t', 'recordable'),
      { type: 'op-function', execute: (context: { dataStore: { updateNode: (id: string, value: unknown) => void } }) => {
        context.dataStore.updateNode('t', { text: 'unrecorded' });
      } },
    ] });
    expect(result.committed).toBe(false);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
    expect(intents).toHaveLength(0);
  });

  it('does not expose an inherited getter or a mutable function attribute to the policy', async () => {
    const inherited = note();
    const shared = { label: 'original' };
    const proto = { get inherited() { return shared; } };
    (inherited.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).probe = Object.create(proto);
    install(inherited, { validate: ({ candidate }) => {
      const probe = (candidate.getNode('p')!.attributes as Record<string, unknown>).probe as {
        inherited: { label: string };
      };
      probe.inherited.label = 'LEAKED';
      return 'denied';
    } });
    expect((await inherited.editor.executeTransaction({ operations: [setText('t', 'after')] })).committed).toBe(false);
    expect(shared.label).toBe('original');

    const functionNode = note();
    const fn = Object.assign(() => true, { state: { label: 'original' } });
    (functionNode.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).probe = fn;
    install(functionNode, { validate: ({ candidate }) => {
      const probe = (candidate.getNode('p')!.attributes as Record<string, unknown>).probe as {
        state: { label: string };
      };
      probe.state.label = 'LEAKED';
      return 'denied';
    } });
    expect((await functionNode.editor.executeTransaction({ operations: [setText('t', 'after')] })).committed).toBe(false);
    expect(fn.state.label).toBe('original');
  });

  it('keeps public export committed while prepared storage waits and refuses failed storage before begin', async () => {
    const session = note();
    let entered!: () => void;
    let fail!: (reason: Error) => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>((_resolve, reject) => { fail = reject; });
    install(session, { journal: { append: intent => {
      if (intent.phase === 'prepared') { entered(); return gate; }
    } } });
    const edit = session.editor.executeTransaction({ operations: [setText('t', 'UNCONFIRMED')] });
    await waiting;
    expect(session.editor.dataStore.isTransactionActive()).toBe(false);
    expect(session.editor.exportDocument().content[0].content[0].text).toBe('before');
    fail(new Error('storage failed'));
    expect(await edit).toMatchObject({ success: false, committed: false,
      errors: ['storage failed'] });
    expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
    expect(session.editor.historyManager.getHistory()).toHaveLength(0);
  });

  it('retains prepared intent if an operation fails after durable preparation', async () => {
    const session = note();
    const { intents } = install(session);
    const result = await session.editor.executeTransaction({ operations: [setText('missing', 'attempt')] });
    expect(result.committed).toBe(false);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ phase: 'prepared', operations: [{ type: 'setText' }] });
    expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
  });

  it('refuses an asynchronous executed record while retaining the prepared copy', async () => {
    const session = note();
    const phases: string[] = [];
    install(session, { journal: { append: intent => {
      phases.push(intent.phase);
      if (intent.phase === 'executed') return Promise.resolve();
    } } });
    const result = await session.editor.executeTransaction({ operations: [setText('t', 'after')] });
    expect(result).toMatchObject({ success: false, committed: false,
      errors: ['Executed Note intent must be stored synchronously'] });
    expect(phases).toEqual(['prepared', 'executed']);
    expect(session.editor.exportDocument().content[0].content[0].text).toBe('before');
    expect(session.editor.historyManager.getHistory()).toHaveLength(0);
  });

  it('keeps the rendered Note and public document committed while a rejected operation awaits', async () => {
    const session = note();
    const host = document.createElement('div');
    document.body.append(host);
    const view = new EditorViewDOM(session.editor, {
      container: host, registry: noteRegistry(), rootId: 'doc',
      env: { [WORD_ENV_KEY]: createTextEnv({
        rootId: 'doc', getNode: (id: string) => session.editor.dataStore.getNode(id),
      } as never) },
    } as never);
    view.render(undefined, { sync: true });
    expect(host.textContent).toContain('before');

    let entered!: () => void;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    defineOperation('noteAwaitRejectedOperation', async () => {
      entered();
      await gate;
      return { ok: true };
    });
    const { intents } = install(session, { validate: () => 'denied' });
    try {
      const edit = session.editor.executeTransaction({ operations: [
        setText('t', 'REJECTED-TEXT'), { type: 'noteAwaitRejectedOperation', payload: {} },
      ] });
      await waiting;
      view.render(undefined, { sync: true });
      expect(intents.map(intent => intent.phase)).toEqual(['prepared']);
      expect(host.textContent).toContain('before');
      expect(host.textContent).not.toContain('REJECTED-TEXT');
      expect(JSON.stringify(session.editor.document)).not.toContain('REJECTED-TEXT');
      expect(session.editor.dataStore.getNode('t')?.text).toBe('before');
      expect(session.editor.exportDocument().content[0].content[0].text).toBe('before');
      release();
      expect(await edit).toMatchObject({ success: false, committed: false, errors: ['denied'] });
    } finally {
      release();
      view.destroy();
      host.remove();
    }
  });

  it('publishes accepted structure, text, and marks together after the durable executed record', async () => {
    const session = note();
    const store = session.editor.dataStore;
    const cached = session.editor.getDocumentProxy('doc');
    const rootBefore = store.getRootNodeId();
    const revisionBefore = store.getEditRevision();
    const epochBefore = store.getDocumentEpoch();
    const events: Array<{ type: string; visibleText: unknown; childCount: number }> = [];
    store.onOperation(operation => events.push({
      type: operation.type,
      visibleText: store.getNode('t')?.text,
      childCount: store.getNode('doc')?.content?.length ?? 0,
    }));
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const intents: NoteRecoveryIntent[] = [];
    install(session, { journal: { append: intent => {
      intents.push(structuredClone(intent));
      if (intent.phase === 'prepared') { entered(); return gate; }
    } } });
    const edit = session.editor.executeTransaction({ operations: [
      setText('t', 'after'),
      { type: 'setMarks', payload: { nodeId: 't', marks: [{ stype: 'bold', range: [0, 5] }] } },
      addChild('doc', { sid: 'p2', stype: 'paragraph', content: [
        { sid: 't2', stype: 'inline-text', text: 'nested' },
      ] }),
    ] });
    await waiting;
    expect(store.getNode('t')?.text).toBe('before');
    expect(store.getNode('doc')?.content).toHaveLength(1);
    expect(cached.content?.[0]?.content?.[0]?.text).toBe('before');
    expect(events).toHaveLength(0);
    release();
    expect(await edit).toMatchObject({ success: true, committed: true });
    expect(intents.map(intent => intent.phase)).toEqual(['prepared', 'executed']);
    expect(store.getRootNodeId()).toBe(rootBefore);
    expect(store.getDocumentEpoch()).toBe(epochBefore);
    expect(store.getEditRevision()).toBeGreaterThan(revisionBefore);
    expect(store.getNode('t')?.text).toBe('after');
    expect(store.getNode('t')?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
    expect(store.getNode('doc')?.content).toEqual(['p', 'p2']);
    expect(store.getNode('p2')?.content).toEqual(['t2']);
    expect(store.getNode('t2')?.text).toBe('nested');
    expect(session.editor.exportDocument().content[1].content[0].text).toBe('nested');
    expect(cached.content?.[0]?.content?.[0]?.text).toBe('after');
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event => event.visibleText === 'after' && event.childCount === 2)).toBe(true);
  });

  it('keeps a queued edit off the public tree until the first guarded edit finishes', async () => {
    const session = note();
    const store = session.editor.dataStore;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { intents } = install(session, { journal: { append: intent => {
      intents.push(structuredClone(intent));
      if (intent.phase === 'prepared' && intents.filter(item => item.phase === 'prepared').length === 1) {
        entered();
        return gate;
      }
    } } });
    const first = session.editor.executeTransaction({ operations: [setText('t', 'first')] });
    await waiting;
    const second = session.editor.executeTransaction({ operations: [setText('t', 'second')] });
    expect(store.getNode('t')?.text).toBe('before');
    expect(intents.map(intent => intent.phase)).toEqual(['prepared']);
    release();
    expect(await first).toMatchObject({ committed: true });
    expect(await second).toMatchObject({ committed: true });
    expect(store.getNode('t')?.text).toBe('second');
    expect(intents.map(intent => intent.phase)).toEqual([
      'prepared', 'executed', 'prepared', 'executed',
    ]);
    // Consecutive typing may coalesce into one undo entry.
    expect(session.editor.historyManager.getHistory().length).toBeGreaterThan(0);
  });

  it('keeps rejected generated IDs out of the tree and does not reuse them on acceptance', async () => {
    const session = note();
    const store = session.editor.dataStore;
    const originalRoot = store.getRootNodeId();
    const originalEpoch = store.getDocumentEpoch();
    const originalRevision = store.getEditRevision();
    const seenIds: string[] = [];
    let reject = true;
    const observed = vi.fn();
    store.onOperation(observed);
    install(session, { validate: ({ candidate }) => {
      const children = candidate.getNode('doc')?.content as string[];
      seenIds.push(children.at(-1)!);
      return reject ? 'refused' : undefined;
    } });
    const create = () => session.editor.executeTransaction({ operations: [
      addChild('doc', { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'generated' }] }),
    ] });
    expect(await create()).toMatchObject({ success: false, committed: false, errors: ['refused'] });
    expect(store.getNode('doc')?.content).toEqual(['p']);
    expect(store.getNode(seenIds[0])).toBeUndefined();
    expect(store.getRootNodeId()).toBe(originalRoot);
    expect(store.getDocumentEpoch()).toBe(originalEpoch);
    expect(store.getEditRevision()).toBeGreaterThan(originalRevision);
    expect(observed).not.toHaveBeenCalled();

    reject = false;
    expect(await create()).toMatchObject({ success: true, committed: true });
    expect(seenIds[1]).not.toBe(seenIds[0]);
    expect(store.getNode('doc')?.content).toEqual(['p', seenIds[1]]);
    expect(store.getNode(seenIds[1])?.stype).toBe('paragraph');
    expect(store.getRootNodeId()).toBe(originalRoot);
    expect(observed).toHaveBeenCalled();
  });

  it('does not expose a committed function attribute to a rejected draft operation', async () => {
    const session = note();
    const functionAttribute = Object.assign(() => true, { state: { label: 'original' } });
    (session.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).probe = functionAttribute;
    install(session, { validate: () => 'denied' });
    defineOperation('noteMutateDraftFunctionAlias', async (_operation, context) => {
      const probe = (context.dataStore.getNode('p')!.attributes as Record<string, typeof functionAttribute>).probe;
      probe.state.label = 'LEAKED';
      return { ok: true };
    });
    const result = await session.editor.executeTransaction({ operations: [
      { type: 'noteMutateDraftFunctionAlias', payload: {} },
    ] });
    expect(result.committed).toBe(false);
    expect(functionAttribute.state.label).toBe('original');
  });

  it('retains a schema-bearing function after an accepted ordinary Note edit', async () => {
    const session = note();
    const schemaFunction = () => true;
    (session.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).schemaFunction = schemaFunction;
    install(session);
    expect(await session.editor.executeTransaction({ operations: [setText('t', 'after')] }))
      .toMatchObject({ success: true, committed: true });
    expect((session.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).schemaFunction)
      .toBe(schemaFunction);
    expect(session.editor.dataStore.getNode('t')?.text).toBe('after');
  });

  it('does not expose a shared-memory view to a rejected draft operation', async () => {
    const session = note();
    const sharedView = new Uint8Array(new SharedArrayBuffer(1));
    sharedView[0] = 1;
    (session.editor.dataStore.getNode('p')!.attributes as Record<string, unknown>).probe = sharedView;
    install(session, { validate: () => 'denied' });
    defineOperation('noteMutateDraftSharedView', async (_operation, context) => {
      const probe = (context.dataStore.getNode('p')!.attributes as Record<string, Uint8Array>).probe;
      probe[0] = 9;
      return { ok: true };
    });
    const result = await session.editor.executeTransaction({ operations: [
      { type: 'noteMutateDraftSharedView', payload: {} },
    ] });
    expect(result.committed).toBe(false);
    expect(sharedView[0]).toBe(1);
  });
});
