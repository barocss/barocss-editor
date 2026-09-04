import { Editor, type Extension } from '@barocss/editor-core';
import {
  createBasicExtensions,
  createCoreExtensions,
  EmojiExtension,
  ImageExtension,
  LinkExtension,
  SlashCommandExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TableExtension,
  TextFormattingExtension,
  UnderlineExtension
} from '@barocss/extensions';
import { createNoteElementCommands } from './element-commands';
import { noteControlsIn } from './toolbar-model';

/**
 * **What a writer can do to a note**, and deliberately not what a designer can do to a page.
 *
 * ## The list is the decision
 *
 * The site builder's kit is nineteen extensions and it is right for a site: a page has a font
 * family, a font size, a colour, a reorder, a clipboard that moves blocks between pages, and its own
 * eleven insert commands. **A body has none of those questions.** The colour of a paragraph in a
 * post is the card's answer when it draws it — *칠·여백·크기는 카드의 것* — so a body that could set
 * its own would be a body that stops following the design it is placed in.
 *
 * So this list is short, and every absence is a sentence:
 *
 * - **no `FontColorExtension`, `FontSizeExtension`, `FontFamilyExtension`** — the design's, not the
 *   writing's. This is the whole styling rule, enforced by not registering the command rather than
 *   by hiding a control.
 * - **no `ReorderExtension`** — z-order is a plane's idea; a body is a sequence.
 * - **no clipboard extension of its own** — a note has no pages to move a block between.
 * - **no `insert*` for a frame, a collection, a chart or a form** — `note-schema.ts` argues it: a
 *   body is written, a page is arranged.
 *
 * What is here is the writing: the marks, a link, a picture, an emoji, a table, and the blocks
 * `createBasicExtensions` brings — headings, paragraphs, lists, quotes.
 *
 * ## And its own `/` menu
 *
 * Rows built from `NOTE_BLOCKS`, so the menu a writer types into cannot offer what the schema would
 * refuse. The site's menu reads the site's toolbar for the same reason, and the two lists never meet
 * — which is the point of the package.
 */
export function createNoteExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),

    // Headings, paragraphs, lists, quotes — the blocks a written thing is made of.
    ...createBasicExtensions(),

    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new SubSuperExtension(),
    new TextFormattingExtension(),
    /**
     * A **link**, which is half the reason a body is nodes rather than characters: a summary with a
     * link and an emphasised word in it is a summary plain text could not hold. The other half is
     * that a link stores a reference and resolves it where it is drawn.
     */
    new LinkExtension(),
    new ImageExtension(),
    new EmojiExtension(),
    new TableExtension(),
    /**
     * **This package's own inserts** — the ten blocks the bar offers.
     *
     * They were `office-site`'s, which worked for as long as the drawer handed the site's editor in:
     * a body's bar was pressing a page builder's buttons. Found the moment the session became the
     * note's own — 93 commands, and every one of the bar's ten missing. Which is what a store of
     * one's own is for: the borrowed parts stop working *visibly*.
     */
    createNoteElementCommands(),
    new SlashCommandExtension({ items: noteSlashItems() })
  ];
}

/**
 * The `/` menu's rows, **from the toolbar** rather than from a second list.
 *
 * A slash menu and a toolbar answer the same question — *what can I put here* — and the only
 * difference is how the reader asked. Two lists is how they come apart, which the site builder has
 * written down at length about its own. So the toolbar is the declaration and this is a reading of
 * it, and the toolbar's block rows are themselves keyed by `NOTE_BLOCKS`: one list, three surfaces.
 */
export function noteSlashItems(): {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  command: string;
  group?: string;
}[] {
  return noteControlsIn('block').map((one) => ({
    id: one.command,
    label: one.label,
    description: one.title,
    icon: one.icon,
    command: one.command,
    group: 'insert'
  }));
}

/**
 * An editor over **one note**, with a store and a history of its own.
 *
 * The whole of what *독립된 에디팅 상태* means, in one function: a second `Editor` means a second
 * selection, so a caret in a body no longer moves the page builder's ribbon, and a second history,
 * so undo in a post does not walk back through a page's padding.
 *
 * The **store** is the caller's, because who owns a note's storage is the caller's question: a site
 * hands one loaded from a cell's value, and a standalone note hands one loaded from a file. What
 * this decides is the schema and the kit.
 */
export function createNoteEditor(options: {
  dataStore: unknown;
  schema: unknown;
  editable?: boolean;
  /** Extra extensions, for a host with a gesture of its own. Rare, and it is not the way in. */
  kit?: Extension[];
}): Editor {
  const { kit, ...rest } = options;
  return new Editor({ ...rest, extensions: kit ?? createNoteExtensions() } as never);
}
