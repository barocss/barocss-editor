import {
  DragDropExtension,
  FontColorExtension,
  FontFamilyExtension,
  FontSizeExtension,
  HighlightExtension,
  ImageExtension,
  LinkExtension,
  MoveBlockExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TextFormattingExtension,
  UnderlineExtension,
  createBasicExtensions,
  createCoreExtensions,
  createTableExtension
} from '@barocss/extensions';
import { Editor, type EditorOptions, type Extension, type Keybinding } from '@barocss/editor-core';
import { createSchema } from '@barocss/schema';
import { getSlidesSchemaDefinition } from './slides-schema';
import { createSlideCommands } from './slide-commands';
import { createBoxCommands } from './box-commands';
import { createArrangeCommands } from './arrange-commands';
import { createClipboardCommands } from './clipboard-commands';
import { createLayoutCommands } from './layout-commands';

/**
 * What can be done in a deck.
 *
 * A kit is a product's answer to that question, and the answer is smaller than
 * Word's on purpose. Named one at a time rather than taken as
 * `createRichExtensions()` for the reason Word learned the hard way: that
 * bundle registers an insert command for every node in it, including ones the
 * product cannot draw, and a command that reports success and draws nothing is
 * worse than a missing command. Every entry here is here because Slides draws
 * it, and the conformance check holds this list to that.
 *
 * ## What a deck leaves out, and why
 *
 * **Word's list commands.** Word replaces the kit's `list` with numbering
 * properties on paragraphs, because that is what a `.docx` list is. A deck's
 * bullets are a `list` node holding `listItem`s — the standard schema's shape,
 * the kit's commands, and Word's renderers draw both. This is the first place
 * the two products genuinely disagree about a node rather than about a pixel.
 *
 * **Footnotes, comments, revisions, tracked changes, fields, bookmarks.** A
 * word processor's review apparatus. A deck has presenter notes instead, and
 * `surfaceNote` is a resource bound by `surfaceId` rather than anything the
 * text commands touch.
 *
 * **Page and column breaks.** There is nothing to break: a slide places.
 */
export function createSlidesExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),

    // Bold, italic, headings, lists, quotes — and unlike Word, the list
    // commands here are the ones that stay.
    ...createBasicExtensions(),

    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new LinkExtension(),
    new ImageExtension(),
    new HighlightExtension(),
    new FontColorExtension(),
    new FontSizeExtension(),
    new FontFamilyExtension(),
    new SubSuperExtension(),
    new TextFormattingExtension(),
    new MoveBlockExtension(),
    new DragDropExtension(),

    // A table on a slide is Word's table in a placed box; see the sample deck.
    createTableExtension({ defaultRows: 3, defaultCols: 3 }),

    // A deck's own: a page is a consequence of how much text there is, and a
    // slide is a thing the author makes.
    createSlideCommands(),

    // Putting something on a slide. Without these a deck could hold shapes,
    // draw them and report their properties, and nothing could make one.
    createBoxCommands(),

    // What is in front, and what lines up with what — the commands a document
    // has no use for, because its blocks are in one order and at one place.
    createArrangeCommands(),
    createClipboardCommands(),

    // A frame that arranges what is in it — `layoutMode`, read at last.
    createLayoutCommands()
  ];
}

export interface SlidesEditorOptions extends EditorOptions {
  /** Replace the kit entirely; pass `[]` for a deck with no editing commands. */
  kit?: Extension[];
  /** Layer bindings over the engine default, as Word's key map does. */
  keybindings?: Keybinding[];
}

/**
 * Create an editor configured as a presentation editor.
 *
 * The seam between engine and product, and the shortest one yet: a schema that
 * is the office schema plus two attributes, a kit that is a subset of the
 * shared extensions, and no key map of its own — a deck has nothing new to say
 * about Enter or Backspace, so it takes the engine's.
 */
export function createSlidesEditor(options: SlidesEditorOptions = {}): Editor {
  const { kit, keybindings, extensions = [], ...rest } = options;

  const editor = new Editor({
    ...rest,
    schema: rest.schema ?? createSchema('slides', getSlidesSchemaDefinition()),
    extensions: [...(kit ?? createSlidesExtensions()), ...extensions]
  } as EditorOptions);

  const registry = (editor as any).keybindings;
  for (const binding of keybindings ?? []) registry?.register?.(binding);

  return editor;
}
