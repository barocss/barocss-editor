import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import {
  transitionFrom,
  trackFor,
  transitionOf,
  transitionStepOf
} from '../src/motion';
import { noteTextOf, type DeckAccess } from '../src/deck';

/**
 * Time, beside the document.
 *
 * The decision was written down in `docs/specs/canvas-model.md` §4 long before
 * anything needed it — a track that names what it animates, rather than every
 * node type growing a time field — and this is its first reader. What these
 * check is that the structure is *built as needed and no more*: a deck with no
 * motion holds no track, choosing an effect makes exactly what is missing, and
 * choosing "none" takes it away again rather than storing the word.
 */
describe('what a slide arrives with', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand?.(command, payload);
  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });
  /**
   * What the deck's resources hold. `content ?? []`, because a node with no
   * children carries no `content` at all rather than an empty array — which
   * reads as "cannot be null or undefined" from a length assertion and looks
   * like the walk being wrong.
   */
  const resources = (): string[] => {
    const root = store.getNode((editor as any).getRootId()) as any;
    const node = (root.content as string[])
      .map((sid) => store.getNode(sid) as any)
      .find((child) => child?.stype === 'resources');
    return (node?.content ?? []) as string[];
  };

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  });

  it('is nothing, in a deck nobody has animated', () => {
    expect(trackFor(doc(), slide)).toBeUndefined();
    expect(transitionOf(doc(), slide)).toEqual({ effect: 'none', duration: 400 });
    // And the deck holds no track at all: a document with no motion pays nothing.
    expect(resources()).toHaveLength(0);
  });

  it('makes the track, the step and the binding the first time', async () => {
    expect(await run('setSlideTransition', { slideId: slide, effect: 'fade' })).toBeTruthy();

    const track = trackFor(doc(), slide);
    expect(track).toBeTruthy();
    expect((store.getNode(track!) as any).stype).toBe('motionTrack');
    expect((store.getNode(slide) as any).attributes.trackId).toBeTruthy();
    expect(transitionOf(doc(), slide)).toEqual({ effect: 'fade', duration: 400 });
  });

  it('makes nothing the second time, and changes what is there', async () => {
    await run('setSlideTransition', { slideId: slide, effect: 'fade' });
    const track = trackFor(doc(), slide);

    await run('setSlideTransition', { slideId: slide, effect: 'zoom', duration: 900 });

    // The same track and the same step, with different attributes.
    expect(trackFor(doc(), slide)).toBe(track);
    expect((store.getNode(track!) as any).content).toHaveLength(1);
    expect(transitionOf(doc(), slide)).toEqual({ effect: 'zoom', duration: 900 });
  });

  /**
   * A document that says a slide has no transition and one that says nothing are
   * the same document. Keeping the second shape would mean every reader has to
   * know both.
   */
  it('takes the step away for "none" rather than storing the word', async () => {
    await run('setSlideTransition', { slideId: slide, effect: 'fade' });
    expect(transitionStepOf(doc(), slide)).toBeTruthy();

    await run('setSlideTransition', { slideId: slide, effect: 'none' });

    expect(transitionStepOf(doc(), slide)).toBeUndefined();
    expect(transitionOf(doc(), slide).effect).toBe('none');
  });

  it('undoes the track it had to make, and not half of it', async () => {
    await run('setSlideTransition', { slideId: slide, effect: 'wipe' });
    await (editor as any).undo();

    expect(trackFor(doc(), slide)).toBeUndefined();
    expect((store.getNode(slide) as any).attributes.trackId).toBeUndefined();
    // A resource nobody names is unreachable; a name pointing at nothing
    // resolves to nothing. Neither may be left behind.
    expect(resources()).toHaveLength(0);
  });

  it('refuses an effect it does not have, and one that is not a slide', async () => {
    expect(can('setSlideTransition', { slideId: slide, effect: 'honeycomb' })).toBe(false);
    expect(can('setSlideTransition', { slideId: 'nothing', effect: 'fade' })).toBe(false);
  });

  /**
   * A deck from another tool may name an effect this product does not have.
   * Drawing a fade because the name was unrecognised would be this product
   * inventing what a document means.
   */
  it('reads an effect it does not know as no transition', async () => {
    await run('setSlideTransition', { slideId: slide, effect: 'fade' });
    const step = transitionStepOf(doc(), slide)!;
    (store.getNode(step) as any).attributes.effect = 'honeycomb';

    expect(transitionOf(doc(), slide).effect).toBe('none');
  });
});

/**
 * What the browser is told to draw.
 *
 * A transform and an opacity, which are the two things a browser animates
 * without laying anything out again — a slide is a fixed surface with absolutely
 * placed boxes on it, and animating anything else would re-layout every one of
 * them sixty times a second.
 */
describe('the state a slide arrives from', () => {
  it('is nothing for no transition, so nothing is written to the element', () => {
    expect(transitionFrom({ effect: 'none', duration: 400 })).toBeUndefined();
  });

  it('fades from transparent', () => {
    expect(transitionFrom({ effect: 'fade', duration: 250 })).toEqual({
      opacity: '0',
      duration: 250
    });
  });

  /**
   * The classic transition bug: "slide left" is the new slide *moving* left,
   * which means it starts on the right.
   */
  it('slides in from the side it is named for, not towards it', () => {
    expect(transitionFrom({ effect: 'slideLeft', duration: 400 })?.transform).toBe(
      'translateX(100%)'
    );
    expect(transitionFrom({ effect: 'slideRight', duration: 400 })?.transform).toBe(
      'translateX(-100%)'
    );
  });

  it('carries the deck’s own duration, whatever it is', () => {
    expect(transitionFrom({ effect: 'zoom', duration: 1200 })).toEqual({
      transform: 'scale(0.85)',
      opacity: '0',
      duration: 1200
    });
  });
});

/**
 * The presenter's note, as words rather than as a document.
 *
 * The notes *pane* draws the subtree with the renderers, because it is editable
 * there. A presenter's screen wants the words at a size a person reads standing
 * up, with no caret in them — and a paragraph per line, because joining them
 * would run a list of three points into one sentence, which is the one thing
 * notes are used for.
 */
describe('a note, read for the presenter', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;

  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

  const load = (note?: { stype: string; attributes: unknown; content: unknown }[]) => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          { stype: 'surface', attributes: { kind: 'slide', noteId: 'note-1' }, content: [] },
          {
            stype: 'resources',
            attributes: {},
            content: note
              ? [{ stype: 'surfaceNote', attributes: { id: 'note-1' }, content: note }]
              : []
          }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
  };

  const paragraph = (text: string) => ({
    stype: 'paragraph',
    attributes: {},
    content: [{ stype: 'inline-text', text }]
  });

  it('is nothing at all for a slide with no note', () => {
    load();
    expect(noteTextOf(doc(), slide)).toEqual([]);
  });

  it('is a line per paragraph, in order', () => {
    load([paragraph('첫 번째'), paragraph('두 번째'), paragraph('세 번째')] as never);
    expect(noteTextOf(doc(), slide)).toEqual(['첫 번째', '두 번째', '세 번째']);
  });

  it('joins the runs inside a paragraph, which a mark splits into several', () => {
    load([
      {
        stype: 'paragraph',
        attributes: {},
        content: [
          { stype: 'inline-text', text: '굵은 ' },
          { stype: 'inline-text', text: '글씨' }
        ]
      }
    ] as never);
    expect(noteTextOf(doc(), slide)).toEqual(['굵은 글씨']);
  });

  /** A trailing blank line is what a note looks like while it is being written. */
  it('drops the empty paragraphs at the end', () => {
    load([paragraph('본문'), paragraph(''), paragraph('   ')] as never);
    expect(noteTextOf(doc(), slide)).toEqual(['본문']);
  });
});
