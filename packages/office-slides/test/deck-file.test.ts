import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema, validateTree } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import {
  DECK_FORMAT,
  DECK_FILE_VERSION,
  deckFileName,
  deckFileText,
  deckTitle,
  forFile,
  readDeckFile
} from '../src/deck-file';
import { slideTimeline } from '../src/timeline';
import { deckSlides, type DeckAccess } from '../src/deck';

/**
 * A deck as a file.
 *
 * The test that matters is the round trip *through an editor*: write a deck that
 * has been edited, read it back into a fresh store, and check that what the
 * document said is still what it says. Everything else here is a refusal.
 */
describe('what a deck file holds', () => {
  it('says what it is, and what version wrote it', () => {
    const file = JSON.parse(deckFileText({ stype: 'document', content: [] }));
    expect(file.format).toBe(DECK_FORMAT);
    expect(file.version).toBe(DECK_FILE_VERSION);
  });

  /**
   * Sids are the session's, not the document's — `session:counter`, handed out at
   * load. A file that kept them would be unloadable in the session that wrote it,
   * because the loader would be asked to mint ids that already exist.
   */
  it('leaves the session’s own bookkeeping out', () => {
    const tree = {
      stype: 'document',
      sid: 'slides:1',
      content: [{ stype: 'surface', sid: 'slides:2', parentId: 'slides:1', content: [] }]
    };

    const written = forFile(tree) as Record<string, any>;
    expect(written.sid).toBeUndefined();
    expect(written.content[0].sid).toBeUndefined();
    expect(written.content[0].parentId).toBeUndefined();
    // And nothing else is touched.
    expect(written.stype).toBe('document');
    expect(written.content[0].stype).toBe('surface');

    expect(JSON.stringify(deckFileText(tree))).not.toContain('slides:');
  });

  it('keeps text, attributes and the tree’s shape', () => {
    const written = deckFileText(createSampleDeck());
    const read = readDeckFile(written);
    expect('document' in read).toBe(true);

    const schema = createSchema('slides', getSlidesSchemaDefinition());
    // What comes back out is still a document this schema accepts, which is the
    // one property a file format has to have.
    expect(validateTree(schema, (read as { document: unknown }).document)).toEqual([]);
  });
});

describe('refusing a file', () => {
  it('says which of the four things is wrong', () => {
    expect(readDeckFile('not json at all')).toEqual({ error: '이 파일은 JSON이 아닙니다.' });
    expect(readDeckFile('[]')).toMatchObject({ error: '이 파일은 슬라이드 파일이 아닙니다.' });
    expect(readDeckFile('{"format":"something-else"}')).toMatchObject({
      error: '이 파일은 Barocss 슬라이드 파일이 아닙니다.'
    });
    expect(
      readDeckFile(JSON.stringify({ format: DECK_FORMAT, version: 99, document: {} }))
    ).toMatchObject({ error: expect.stringContaining('99') });
    expect(readDeckFile(JSON.stringify({ format: DECK_FORMAT, version: 1 }))).toMatchObject({
      error: '이 파일에는 문서가 없습니다.'
    });
  });

  /**
   * An *older* file is read, which is the whole reason the version is a number
   * rather than a checksum: a document written before an attribute existed is
   * still a document, and every attribute is read with a default.
   */
  it('reads a file from an older version', () => {
    const older = JSON.stringify({
      format: DECK_FORMAT,
      version: 0,
      document: { stype: 'document', content: [] }
    });
    expect(readDeckFile(older)).toMatchObject({ version: 0 });
  });
});

describe('what the file is called', () => {
  it('is named after the deck', () => {
    expect(deckFileName('One engine, two products')).toBe('One engine, two products.slides.json');
    expect(deckFileName('제목')).toBe('제목.slides.json');
  });

  /**
   * From the words on the opening slide, not from the slide's own name.
   *
   * The sample deck's first slide is *named* "Title", which is the author's label
   * for it and a filename nobody chose. What a reader would have typed into a
   * save dialog is the sentence they can see.
   */
  it('reads the deck’s title from the first slide', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const store = new DataStore(undefined, schema);
    const editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(createSampleDeck() as never, 'slides');

    const doc: DeckAccess = {
      rootId: editor.getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
    expect(deckSlides(doc)[0].name).toBe('Title');
    expect(deckTitle(doc)).toBe('One engine, two products');
    expect(deckFileName(deckTitle(doc))).toBe('One engine, two products.slides.json');
  });

  it('is a name a filesystem will take', () => {
    expect(deckFileName('a/b:c*d?"<>|')).toBe('a b c d.slides.json');
    expect(deckFileName('  ..hidden  ')).toBe('hidden.slides.json');
    expect(deckFileName(undefined)).toBe('슬라이드.slides.json');
    expect(deckFileName('   ')).toBe('슬라이드.slides.json');
    expect(deckFileName('x'.repeat(200)).length).toBeLessThan(80);
  });
});

/**
 * The round trip, through two editors.
 *
 * This is the test the module exists for, and the thing it depends on is a
 * decision made when the first build was written: **a step names its shape by a
 * name the shape carries, not by a sid.** Strip the sids, load into a fresh
 * session with entirely different ones, and the animation still points at the
 * same shape. If a future node points at a sid, this test is where it shows.
 */
describe('a deck that has been edited, saved and opened', () => {
  let editor: Editor;
  let store: DataStore;

  const schema = () => createSchema('slides', getSlidesSchemaDefinition());
  const docOf = (ed: Editor, st: DataStore): DeckAccess => ({
    rootId: (ed as any).getRootId(),
    getNode: (sid: string) => st.getNode(sid) as never
  });

  beforeEach(() => {
    store = new DataStore(undefined, schema());
    editor = createSlidesEditor({ editable: true, schema: schema(), dataStore: store });
    editor.loadDocument(createSampleDeck() as never, 'slides');
  });

  it('keeps the slides, the text and the motion', async () => {
    const slide = deckSlides(docOf(editor, store))[0].sid;
    const box = ((store.getNode(slide) as any).content as string[])[0];

    // A motion with everything a step can hold, including the two newest.
    await editor.executeCommand('addBoxBuild', {
      nodeId: box,
      effect: 'fly',
      direction: 'down',
      amount: 0.15,
      duration: 350,
      easing: 'spring(180, 9)',
      unit: 'letter',
      stagger: 45
    });

    const before = slideTimeline(docOf(editor, store), slide);
    expect(before).toHaveLength(1);

    const text = deckFileText(editor.exportDocument());
    const read = readDeckFile(text) as { document: unknown };

    // A *fresh* session: every sid is handed out again, and the file has none.
    const store2 = new DataStore(undefined, schema());
    const editor2 = createSlidesEditor({ editable: true, schema: schema(), dataStore: store2 });
    editor2.loadDocument(read.document as never, 'reopened');

    // Nothing wrong with what was loaded, which the editor checks for itself.
    expect((editor2 as any).documentFaults).toEqual([]);

    const slides2 = deckSlides(docOf(editor2, store2));
    expect(slides2.map((entry) => entry.name)).toEqual(
      deckSlides(docOf(editor, store)).map((entry) => entry.name)
    );

    const after = slideTimeline(docOf(editor2, store2), slides2[0].sid);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      effect: 'fly',
      direction: 'down',
      amount: 0.15,
      duration: 350,
      easing: 'spring(180, 9)',
      unit: 'letter',
      stagger: 45,
      // The shape it names, found again in a session that shares no sid with the
      // one that wrote the file.
      target: before[0].target,
      label: before[0].label
    });
    expect(after[0].targetSid).toBeTruthy();
    expect(after[0].targetSid).not.toBe(before[0].targetSid);
    // And the pieces are counted from the text that came back, not from a number
    // the file carried.
    expect(after[0].units).toBe(before[0].units);
  });
});
