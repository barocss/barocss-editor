import {
  BookmarkExtension,
  CodeMarkExtension,
  DragDropExtension,
  FieldExtension,
  FontColorExtension,
  FontFamilyExtension,
  FontSizeExtension,
  FootnoteExtension,
  HighlightExtension,
  HorizontalRuleExtension,
  ImageExtension,
  LinkExtension,
  MentionExtension,
  MoveBlockExtension,
  PageBreakExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TextFormattingExtension,
  UnderlineExtension,
  createBasicExtensions,
  createCoreExtensions,
  createTableExtension
} from '@barocss/extensions';
import { Editor, type EditorOptions, type Extension, type Keybinding } from '@barocss/editor-core';
import { createWordCommands } from './word-commands';
import { createWordListCommands } from './list-commands';
import { createWordComments, type CommentAuthor } from './comment-commands';
import { createWordRevisions } from './revision-commands';
import { createWordTracking } from './tracking-commands';
import { createWordMath } from './math-commands';
import { createWordTables } from './table-commands';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from './word-schema';
import { WORD_KEYBINDINGS } from './word-keymap';

/**
 * The extensions a Word document needs.
 *
 * A kit is a product's answer to "what can be done in this editor". The engine
 * ships none of its own, so this list is the whole of Word's editing surface —
 * changing it changes the product, not the engine.
 */
/** Someone to attribute comments to when the host has not said who is reading. */
const DEFAULT_AUTHOR: CommentAuthor = {
  name: 'Unknown',
  date: () => new Date().toISOString().slice(0, 10)
};

export function createWordExtensions(author: CommentAuthor = DEFAULT_AUTHOR): Extension[] {
  return [
    ...createCoreExtensions(),

    /**
     * Named one at a time rather than taken as `createRichExtensions()`.
     *
     * That bundle is the whole rich-editor surface — callouts, checklists,
     * details, figures, description lists, embedded media, charts, columns.
     * Word has renderers for about half of it, so taking the bundle registered
     * an insert command for every node in it and drew a good number of them as
     * nothing at all: measured in the running app, `insertCallout` reported
     * success, put a `callout` in the document, and left the reader's text
     * invisible on the page. Ten node types were reachable that way.
     *
     * A kit is a product's answer to "what can be done in this editor", and an
     * answer that includes things the product cannot draw is the wrong answer.
     * So this is the list, and every entry is here because Word draws it.
     */
    ...createBasicExtensions(),
    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new LinkExtension(),
    new ImageExtension(),
    new HorizontalRuleExtension(),
    new MoveBlockExtension(),
    new DragDropExtension(),
    new CodeMarkExtension(),
    new HighlightExtension(),
    new FontColorExtension(),
    new SubSuperExtension(),
    new PageBreakExtension(),
    new FontSizeExtension(),
    new FontFamilyExtension(),
    new TextFormattingExtension(),
    new MentionExtension(),
    new FootnoteExtension(),
    new BookmarkExtension(),
    new FieldExtension(),

    createTableExtension({ defaultRows: 3, defaultCols: 3 }),
    // Word's own. A column break means nothing without sections that have
    // columns, and tracked changes is a word processor's idea of review — so
    // unlike bold or alignment, they do not belong in the shared kit.
    createWordCommands(),
    // After the shared kit on purpose: Word's lists are numbering properties on
    // paragraphs, so the kit's list and indent commands have nothing here to
    // wrap or shift. They reported success and did nothing; these replace them.
    createWordListCommands(),
    // Who is commenting is the host's to say, the same way the instant a date
    // field shows is — an editor that invented a name would be guessing.
    createWordComments(author),
    // Recording a change and drawing it is only half of review: without accept
    // and reject a revised document can never be finished.
    createWordRevisions(),
    // Tab through the slots of an equation, which is how one gets written.
    createWordMath(),
    // The table operations knew this schema all along; nothing called them.
    createWordTables(),
    // Last, so it wraps the delete commands whichever extension registered them.
    // With tracking on, deleting stops deleting — which is a different operation
    // and has to be decided before the original one runs.
    createWordTracking(author)
  ];
}

export interface WordEditorOptions extends EditorOptions {
  /** Replace the kit entirely; pass `[]` for a document with no editing commands. */
  kit?: Extension[];
  /** Replace Word's key map. */
  keybindings?: Keybinding[];
  /**
   * Who is reading, for anything the document records a name against.
   *
   * The host's to say for the same reason the instant a date field shows is:
   * two people in the same document are not the same person, and an editor that
   * read a name from somewhere would be guessing.
   */
  author?: CommentAuthor;
}

/**
 * Create an editor configured as a word processor.
 *
 * This is the seam between engine and product: the schema, the kit and the key
 * map are all supplied here, and none of them are known to the layers below.
 */
export function createWordEditor(options: WordEditorOptions = {}): Editor {
  const { kit, keybindings, author, extensions = [], ...rest } = options;

  const editor = new Editor({
    ...rest,
    schema: rest.schema ?? createSchema('word', getWordSchemaDefinition()),
    extensions: [...(kit ?? createWordExtensions(author)), ...extensions]
  } as EditorOptions);

  // Word's key map layers *over* the engine default rather than replacing it.
  //
  // It used to clear the registry first, to stop two commands competing for
  // Tab. That threw out the baseline with the conflict: Enter, Backspace,
  // Delete and the arrow keys are engine defaults, and Word's map does not
  // restate them — a word processor has nothing new to say about Backspace.
  // Deleting them left the document editable only by whatever the browser did
  // natively, so Backspace could not merge a block and no key resolved to a
  // command at all.
  //
  // Nothing needs clearing: the registry already resolves a conflict by source,
  // and a product's bindings outrank the engine's. Tab goes to Word.
  const registry = (editor as any).keybindings;
  for (const binding of keybindings ?? WORD_KEYBINDINGS) {
    registry?.register?.(binding);
  }

  return editor;
}
