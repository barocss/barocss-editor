import { Document, OpSource } from '@yorkie-js/sdk';
import { openNoteTree, type NoteSession } from '../src/session';
import { decodeYorkieNote, type YorkieNoteRoot } from '../src/note-yorkie-codec';
import {
  applyRemoteNoteText,
  bindYorkieNote,
  readTextOnlyNote,
  seedYorkieFromNote,
  stageLocalNoteText,
} from '../src/note-yorkie-model-adapter';

const productTree = () => ({
  sid: 'note:root', stype: 'note', attributes: { title: 'Real Note' }, content: [{
    sid: 'note:heading', stype: 'heading', attributes: { level: 2 }, content: [{
      sid: 'note:run', stype: 'inline-text', text: 'AB', marks: [],
    }],
  }],
});
const sessions: NoteSession[] = [];
const open = () => {
  const session = openNoteTree(productTree());
  sessions.push(session);
  return session;
};
const yorkie = (actor: string) => {
  const doc = new Document<YorkieNoteRoot>('real-note');
  doc.setActor(actor);
  return doc;
};
const replace = async (session: NoteSession, text: string) => {
  const before = session.editor.dataStore.getNode('note:run')?.text;
  expect(typeof before).toBe('string');
  expect(await session.editor.executeCommand('replaceText', {
    range: { type: 'range', startNodeId: 'note:run', startOffset: 1,
      endNodeId: 'note:run', endOffset: 1, collapsed: true },
    text,
  })).toBe(true);
};

afterEach(() => { sessions.splice(0).forEach(session => session.close()); });

describe('real Note model to Yorkie text slice', () => {
  it('keeps canonical sids and typed attributes across independent sessions and reopen', () => {
    const first = open();
    const second = open();
    const firstTree = readTextOnlyNote(first);
    const secondTree = readTextOnlyNote(second);
    expect(firstTree).toEqual(secondTree);
    expect(firstTree.content[0].attributes?.level).toBe(2);
    expect(firstTree.content[0].content[0].stype).toBe('inline-text');

    const doc = yorkie('000000000000000000000001');
    seedYorkieFromNote(first, doc);
    expect(decodeYorkieNote(doc.getRoot())).toEqual(firstTree);
    const reopened = openNoteTree(first.editor.exportDocument());
    sessions.push(reopened);
    expect(readTextOnlyNote(reopened)).toEqual(firstTree);
  });

  it('converges same-leaf text through Yorkie and applies remote provenance without echo or local undo', async () => {
    const first = open();
    const second = open();
    const a = yorkie('000000000000000000000001');
    const b = yorkie('000000000000000000000002');
    seedYorkieFromNote(first, a);
    const initialChanges = a.createChangePack().getChanges();
    b.applyChanges(initialChanges, OpSource.Remote);
    bindYorkieNote(second, b);

    await replace(first, 'X');
    await replace(second, 'Y');
    expect(stageLocalNoteText(first, a)).toBe(true);
    expect(stageLocalNoteText(second, b)).toBe(true);
    const aEdit = a.createChangePack().getChanges().slice(initialChanges.length);
    const bEdit = b.createChangePack().getChanges();
    expect(aEdit).toHaveLength(1);
    expect(bEdit).toHaveLength(1);
    a.applyChanges(bEdit, OpSource.Remote);
    b.applyChanges(aEdit, OpSource.Remote);

    const firstSelection = first.editor.selection;
    const secondSelection = second.editor.selection;
    const firstUndo = first.editor.canUndo();
    const secondUndo = second.editor.canUndo();
    expect(await applyRemoteNoteText(first, a,
      { actorId: '000000000000000000000002', sessionId: 'session-b', editId: 'edit-b' },
      { actorId: '000000000000000000000001', sessionId: 'session-a' })).toBe(true);
    expect(await applyRemoteNoteText(second, b,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'edit-a' },
      { actorId: '000000000000000000000002', sessionId: 'session-b' })).toBe(true);

    const merged = decodeYorkieNote(a.getRoot()).content[0].content[0].text;
    expect(merged).toMatch(/^A[XY]{2}B$/);
    expect(second.editor.dataStore.getNode('note:run')?.text).toBe(merged);
    expect(first.editor.dataStore.getNode('note:run')?.text).toBe(merged);
    expect(first.editor.selection).toEqual(firstSelection);
    expect(second.editor.selection).toEqual(secondSelection);
    expect(first.editor.canUndo()).toBe(firstUndo);
    expect(second.editor.canUndo()).toBe(secondUndo);
    expect(await applyRemoteNoteText(first, a,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'self-edit' },
      { actorId: '000000000000000000000001', sessionId: 'session-a' })).toBe(false);
    expect(stageLocalNoteText(first, a)).toBe(false);
  });

  it('refuses rich content, structural changes, and typed attribute changes before Yorkie send', () => {
    const rich = openNoteTree({ ...productTree(), content: [{ ...productTree().content[0], content: [{
      sid: 'note:run', stype: 'inline-text', text: 'AB', marks: [{ stype: 'bold', range: [0, 2] }],
    }] }] });
    sessions.push(rich);
    expect(() => readTextOnlyNote(rich)).toThrow('rich text marks');

    const session = open();
    const doc = yorkie('000000000000000000000001');
    seedYorkieFromNote(session, doc);
    const changes = doc.createChangePack().getChanges().length;
    session.editor.dataStore.updateNode('note:heading', { attributes: { level: 3 } });
    expect(() => stageLocalNoteText(session, doc)).toThrow('attributes changed');
    expect(doc.createChangePack().getChanges()).toHaveLength(changes);

    session.editor.loadDocument({ ...productTree(), content: [
      ...productTree().content,
      { sid: 'note:extra', stype: 'paragraph', content: [
        { sid: 'note:extra-run', stype: 'inline-text', text: 'C', marks: [] },
      ] },
    ] }, session.session);
    expect(() => stageLocalNoteText(session, doc)).toThrow('node structure changed');
    expect(doc.createChangePack().getChanges()).toHaveLength(changes);
  });

  it('refuses an unstaged local deletion when remote text arrives, then never republishes applied remote text', async () => {
    const first = open();
    const second = open();
    const a = yorkie('000000000000000000000001');
    const b = yorkie('000000000000000000000002');
    seedYorkieFromNote(first, a);
    const initialChanges = a.createChangePack().getChanges();
    b.applyChanges(initialChanges, OpSource.Remote);
    bindYorkieNote(second, b);

    await replace(first, 'X');
    expect((await second.editor.executeTransaction({ operations: [
      { type: 'setText', payload: { nodeId: 'note:run', text: 'A' } },
    ] })).committed).toBe(true);
    expect(stageLocalNoteText(first, a)).toBe(true);
    b.applyChanges(a.createChangePack().getChanges().slice(initialChanges.length), OpSource.Remote);
    expect(() => stageLocalNoteText(second, b)).toThrow('remote text arrived before local staging');
    await expect(applyRemoteNoteText(second, b,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'edit-a' },
      { actorId: '000000000000000000000002', sessionId: 'session-b' }))
      .rejects.toThrow('local text is not staged');

    // A clean replica accepts remote text and sees no new local operation to send.
    const clean = open();
    const c = yorkie('000000000000000000000003');
    c.applyChanges(initialChanges, OpSource.Remote);
    bindYorkieNote(clean, c);
    c.applyChanges(a.createChangePack().getChanges().slice(initialChanges.length), OpSource.Remote);
    const pending = c.createChangePack().getChanges().length;
    const undoBefore = clean.editor.canUndo();
    const selectionBefore = clean.editor.selection;
    const origins: unknown[] = [];
    clean.editor.on('editor:content.change', (event: { provenance?: unknown }) => origins.push(event.provenance));
    expect(await applyRemoteNoteText(clean, c,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'edit-a' },
      { actorId: '000000000000000000000003', sessionId: 'session-c' })).toBe(true);
    expect(origins).toContainEqual({ origin: 'remote', actorId: '000000000000000000000001',
      sessionId: 'session-a', editId: 'edit-a' });
    expect(clean.editor.canUndo()).toBe(undoBefore);
    expect(clean.editor.selection).toEqual(selectionBefore);
    expect(stageLocalNoteText(clean, c)).toBe(false);
    expect(c.createChangePack().getChanges()).toHaveLength(pending);
  });

  it('keeps a queued local insertion when remote apply waits for the same transaction lock, then recovers', async () => {
    const first = open();
    const second = open();
    const a = yorkie('000000000000000000000001');
    const b = yorkie('000000000000000000000002');
    seedYorkieFromNote(first, a);
    const initialChanges = a.createChangePack().getChanges();
    b.applyChanges(initialChanges, OpSource.Remote);
    bindYorkieNote(second, b);

    a.update(root => root.note!.content[0].content[0].text!.edit(1, 1, 'X'));
    b.applyChanges(a.createChangePack().getChanges().slice(initialChanges.length), OpSource.Remote);
    expect(decodeYorkieNote(b.getRoot()).content[0].content[0].text).toBe('AXB');

    // Deliberately do not await the local transaction before starting remote apply.
    const local = second.editor.executeTransaction({
      operations: [{ type: 'setText', payload: { nodeId: 'note:run', text: 'ALB' } }],
    });
    const remote = applyRemoteNoteText(second, b,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'edit-x' },
      { actorId: '000000000000000000000002', sessionId: 'session-b' });
    expect((await local).committed).toBe(true);
    await expect(remote).rejects.toThrow('local text is not staged');
    expect(second.editor.dataStore.getNode('note:run')?.text).toBe('ALB');

    expect(stageLocalNoteText(second, b)).toBe(true);
    expect(decodeYorkieNote(b.getRoot()).content[0].content[0].text).toBe('ALXB');
    expect(await applyRemoteNoteText(second, b,
      { actorId: '000000000000000000000001', sessionId: 'session-a', editId: 'edit-x' },
      { actorId: '000000000000000000000002', sessionId: 'session-b' })).toBe(true);
    expect(second.editor.dataStore.getNode('note:run')?.text).toBe('ALXB');
    expect(stageLocalNoteText(second, b)).toBe(false);
  });
});
