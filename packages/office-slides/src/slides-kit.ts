import {
  ReorderExtension,
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
import { Editor, type Extension, type ProductEditorOptions } from '@barocss/editor-core';
import { createSchema } from '@barocss/schema';
import { getSlidesSchemaDefinition } from './slides-schema';
import { createSlideCommands } from './slide-commands';
import { createBoxCommands } from './box-commands';
import { createArrangeCommands } from './arrange-commands';
import { createComponentCommands } from './component-commands';
import { createVariableCommands } from './variable-commands';
import {
  boundAttrs,
  boundText,
  contentWithWords,
  installInstanceResolution
} from '@barocss/office-canvas';
import { resolveVarAttrs } from './named-values';
import { createConnectorCommands } from './connector-commands';
import { createClipboardCommands } from './clipboard-commands';
import { createLayoutCommands } from '@barocss/office-canvas';
/* 표는 글의 낱말이다 — 전에는 `@barocss/office-word` 였고, 제품이 제품을 의존했다. */
import { createWordTables } from '@barocss/office-text';


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
/**
 * The extensions this product *adds* — what a deck is answerable for.
 *
 * Named here rather than in the conformance test, and that is the point. The
 * check that asks "can a reader reach this command" measures the product's own
 * commands as the difference between an editor built with these and one built
 * with none, and it used to be handed a list written out in the test: four of
 * them, while the kit installed six. The two that were missing — the table
 * commands and the layout commands — were invisible to it, so a reader could
 * select a block of cells on a slide, have no button anywhere that merges them,
 * and the check reported nothing.
 *
 * The check's own note says a list "would be a fourth place to forget the thing
 * the check exists to catch". It was. One list, in the source that installs it,
 * is the fix.
 */
export function createSlidesOwnExtensions(): Extension[] {
  return [
    /**
     * Word's table commands, which a deck needs for the same reason Word does:
     * the shared kit's were written for a schema without the header/body group
     * between a table and its rows, and both products store tables with it. They
     * also read a `cell` selection, which is what makes dragging across the cells
     * of a table on a slide worth anything — merging needs two cells, and the
     * caret can only ever be in one.
     */
    createWordTables({
      /**
       * The structure only. A deck's chrome is a properties panel, not a ribbon:
       * it has no table-style gallery and no row-height field, so registering
       * `setTableStyle`, `setRowHeight`, `setCellVerticalAlign`,
       * `setCellTextDirection`, `toggleTableLook` and `setCellShading` here would
       * be six commands that work and no reader can reach. Logged in
       * docs/BACKLOG.md as the properties panel's next piece of work.
       */
      formatting: false
    }),

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
    createLayoutCommands(),

    /**
     * A line that remembers what it joins, and follows the shapes it holds.
     *
     * The reaction is the half that makes it a connector rather than a line: every
     * document change resolves every connector's ends. `connector` was declared in the
     * office schema, named in the shared vocabulary and exempted in the conformance
     * report as "a deck has no arrows yet" — that exemption is deleted, which is the
     * harness doing its job.
     */
    createConnectorCommands(),

    /**
     * A card made once and placed on twenty slides, and the way its changes reach them.
     *
     * `component` and `instance` were in the office schema from the start, named in the shared
     * vocabulary, exempted in both conformance reports as "no components yet" — the fifth time
     * this repository found a whole feature declared and unreachable. The definitions, the
     * variables and apply are all a reader can press now.
     */
    createComponentCommands(),

    /**
     * The document's own named values, which is the other half of what "a variable" means here.
     *
     * A card's variable is a question that card asks, answered per placement; a **document**
     * variable is one value for the whole deck — the company name, the quarter, the accent that is
     * not one of the theme's twelve slots. Asked for explicitly, and the distinction is written in
     * `canvas-variable.ts` because it was conflated twice while being designed.
     */
    createVariableCommands()
  ];
}

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
    new ReorderExtension(),

    // A table on a slide is Word's table in a placed box; see the sample deck.
    createTableExtension({ defaultRows: 3, defaultCols: 3 }),

    // Everything above is the shared editing kit; everything the deck itself
    // adds is one list, in `createSlidesOwnExtensions`.
    ...createSlidesOwnExtensions()
  ];
}

export type SlidesEditorOptions = ProductEditorOptions;

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
  } as ProductEditorOptions);

  const registry = (editor as any).keybindings;
  for (const binding of keybindings ?? []) registry?.register?.(binding);

  /**
   * A **placement draws its definition**, live.
   *
   * Registered here because this is where a deck's editor is assembled, and because the store must
   * not know what a component is: it takes a function and asks it what a node's children are for a
   * reader (`setContentResolver`).
   *
   * Why the store and not a renderer: a renderer that built the parts' elements itself evaluated
   * every one of them against the *placement*, so two parts came out with the placement's box and
   * the placement's sid. Resolved where children are read, each part arrives as itself.
   *
   * And the save is untouched — it walks the stored nodes — so a file says what a reader has: a
   * placement, and the values it was given.
   */
  /*
   * The placement half is the canvas layer's now (`installInstanceResolution`), because the site
   * builder needed the same three lines on its first day and two products answering "what does a
   * placement draw" is one of them being wrong. What stays here is what only a *deck* resolves: a
   * shape's variable bindings and what its references mean in scope.
   */
  installInstanceResolution(editor as never, (node: any, getNode: (sid: string) => any, doc: any) => {
    /**
     * And a shape that takes something from a **variable** (`varBinds`, §10h-2).
     *
     * Here for the reason the same question was asked of the renderers and answered no: `attrsOf` is
     * read in 62 places inside them and has no document to look a variable up in, so a bound corner
     * radius would have reached the paint and not the border radius. Children are resolved in one
     * place, and a parent's resolution is the one place that can hand back a child *as it is drawn*.
     *
     * Two halves, and both are declarations rather than references in typed attributes:
     *
     * - a child's **attributes**, with its bindings written in (`boundAttrs`), because a number and
     *   a state cannot be written as `var:` and be validated;
     * - this node's own **words** (`boundText`), because characters are content and not an attribute
     *   at all — the same reason a card's binding may say `text`.
     *
     * Answers `undefined` unless something is actually bound, so a deck with no bindings copies
     * nothing and pays one array check per node.
     */
    const words = boundText(doc, node as never);
    if (words !== undefined) return contentWithWords(doc, node as never, words) as never;

    const kids = Array.isArray(node?.content) ? (node.content as unknown[]) : [];
    if (kids.length === 0) return undefined;

    const resolved = kids.map((child) => {
      const held = typeof child === 'string' ? getNode(child) : (child as any);
      if (!held) return held;

      /*
       * Two things about a child's attributes are settled here, and both need to know *which* node
       * it is — which is why they are here and not in a renderer:
       *
       * - what its **bindings** decide (`boundAttrs`), because a number cannot be written as `var:`
       *   and be validated;
       * - what its **references** mean in scope (`resolveVarAttrs`), because a page may declare a
       *   name the document also declares and the page's wins.
       */
      const bound = boundAttrs(doc, held as never);
      const attrs = resolveVarAttrs(doc, held.sid, (bound ?? held.attributes) as never);
      return attrs !== held.attributes ? { ...held, attributes: attrs } : held;
    });

    return resolved.some((child, at) => child !== (typeof kids[at] === 'string' ? getNode(kids[at] as string) : kids[at]))
      ? (resolved as never)
      : undefined;
  });

  return editor;
}
