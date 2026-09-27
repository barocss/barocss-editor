import { Document, OpSource } from '@yorkie-js/sdk';
import { decodeYorkieNote, editYorkieNoteText, seedYorkieNote } from '../src/note-yorkie-codec';
import type { SeededNoteNode, YorkieNoteRoot } from '../src/note-yorkie-codec';

const seed: SeededNoteNode = {
  id: 'note-1',
  stype: 'note',
  attributes: { title: 'Shared note' },
  content: [{
    id: 'paragraph-1',
    stype: 'paragraph',
    content: [{ id: 'text-1', stype: 'text', text: 'AB', content: [] }],
  }],
};

const makeDocument = (actor: string) => {
  const doc = new Document<YorkieNoteRoot>('seeded-note');
  doc.setActor(actor);
  return doc;
};

describe('preseeded Note Yorkie codec', () => {
  it('preserves explicit IDs across independent decodes and replicas', () => {
    const first = makeDocument('000000000000000000000001');
    const second = makeDocument('000000000000000000000002');
    first.update(root => seedYorkieNote(root, seed));
    second.applyChanges(first.createChangePack().getChanges(), OpSource.Remote);

    const firstDecode = decodeYorkieNote(first.getRoot());
    const secondDecode = decodeYorkieNote(second.getRoot());
    expect(firstDecode).toEqual(seed);
    expect(secondDecode).toEqual(firstDecode);
    expect(firstDecode.content[0].content[0].id).toBe('text-1');
  });

  it('converges concurrent edits to the same leaf through Yorkie changes', () => {
    const first = makeDocument('000000000000000000000001');
    const second = makeDocument('000000000000000000000002');
    first.update(root => seedYorkieNote(root, seed));
    const initialChanges = first.createChangePack().getChanges();
    second.applyChanges(initialChanges, OpSource.Remote);

    first.update(root => editYorkieNoteText(root, 'text-1', 1, 1, 'X'));
    second.update(root => editYorkieNoteText(root, 'text-1', 1, 1, 'Y'));
    const firstEdit = first.createChangePack().getChanges().slice(initialChanges.length);
    const secondEdit = second.createChangePack().getChanges();
    expect(firstEdit).toHaveLength(1);
    expect(secondEdit).toHaveLength(1);

    first.applyChanges(secondEdit, OpSource.Remote);
    second.applyChanges(firstEdit, OpSource.Remote);

    const a = decodeYorkieNote(first.getRoot());
    const b = decodeYorkieNote(second.getRoot());
    expect(a).toEqual(b);
    expect(a.content[0].content[0].text).toMatch(/^A[XY]{2}B$/);
    expect(a.content[0].content[0].id).toBe('text-1');
  });

  it('rejects duplicate IDs before writing a document', () => {
    const doc = makeDocument('000000000000000000000001');
    const bad = structuredClone(seed);
    bad.content[0].id = bad.id;
    expect(() => doc.update(root => seedYorkieNote(root, bad))).toThrow('unique and nonempty');
  });
});
