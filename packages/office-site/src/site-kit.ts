/**
 * What can be done on a site.
 *
 * A kit is a product's answer to that question, and this one is the shortest yet — which is the
 * measurement, not a shortcut. A page's blocks are the shared editing kit's blocks: headings,
 * paragraphs, lists, links, images, formatting. What a *site* adds is what a site has that a
 * document does not, and the first slice of it is one command: putting a stack on a page.
 *
 * ## What a site leaves out, and why
 *
 * **Word's pagination, headers, footers, footnotes, revisions, fields.** A page has no sheets to
 * break, no margin to put a running head in, and no reviewer. Every one of those is a product
 * decision about *paper*.
 *
 * **The deck's canvas commands.** A slide places at a coordinate; a page stacks. Dragging a box to
 * a point is the thing this product deliberately does not start with — a site builder that starts
 * with coordinates ends up as a slide editor with a scroll bar (`docs/specs/site-builder.md`).
 *
 * **Tables were here**, with the reason *"a table on a page is a layout decision a stack usually
 * makes better, and offering both on day one would teach a reader the wrong one"*. Half of that was
 * right and the half that was wrong cost more: a **comparison** is tabular — features down the side,
 * plans across the top, a header row a screen reader announces per cell — and a stack faking one is
 * exactly the fault the argument was trying to avoid, drawn by hand and wrong on a phone.
 *
 * So the table is in and the risk is managed the way this product manages every other one: the
 * honest thing is easy and the reason is written down. A table is a **block** on the rail, beside a
 * quote and a rule; the arrangement of a section is still a stack, and nothing offers a table as one.
 */
import {
  ReorderExtension,
  EmojiExtension,
  FontColorExtension,
  FontFamilyExtension,
  FontSizeExtension,
  ImageExtension,
  LinkExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TextFormattingExtension,
  UnderlineExtension,
  SlashCommandExtension,
  TableExtension,
  createBasicExtensions,
  createCoreExtensions
} from '@barocss/extensions';
import { Editor, type EditorOptions, type Extension, type Keybinding } from '@barocss/editor-core';
import { SiteClipboardExtension } from './clipboard-commands';
import { createSchema } from '@barocss/schema';
import { installSiteResolution } from './collection-resolution';
import { getSiteSchemaDefinition } from './site-schema';
import { siteSlashItems } from './toolbar-model';
import { createStackCommands } from './stack-commands';
import { createBlockCommands } from './block-commands';
import { createDataCommands } from './data-commands';
import { createElementCommands } from './element-commands';
import { createLinkCommands } from './link-commands';
import { createPublishCommands } from './publish-commands';
import { createPageCommands } from './page-commands';

/** What the site product itself adds, as one list. */
export function createSiteOwnExtensions(): Extension[] {
  return [
    /*
     * **Not** the canvas layer's layout extension, and the harness is what settled it.
     *
     * It was installed on the argument that a frame *inside a placed box* on a page would need the
     * arrangement pass. Measured: a page draws no placed boxes — every canvas node is in this
     * product's undrawn list — so the pass walks every frame on every content change and can never
     * have anything to do. And its two commands, `setFrameLayout` and `setBoxLayout`, came back from
     * `every-command-can-be-reached` as things a reader cannot run: a page says both with `sizing`
     * and `setBlockFormat`, which know about widths as well.
     *
     * A cost with no benefit and two dead commands. It comes back the day a page can hold a canvas,
     * with a reason.
     */
    createStackCommands(),
    /*
     * Moving a block, copying it, taking it away — the three a builder cannot be without. A reader
     * who can change a section's padding but not move it has a panel rather than a tool.
     */
    createBlockCommands(),
    /*
     * And something to put in a stack. The product could make three kinds of container and nothing
     * to put in them — a reader could arrange an empty page beautifully.
     */
    createElementCommands(),
    /*
     * And the data itself.
     *
     * The view came first and was finished — a list, filtered, sorted, limited, drawn once per row —
     * against datasets that only TypeScript could write. Half a feature, and the half a reader
     * notices is the one where a price cannot be changed.
     */
    createDataCommands(),
    /*
     * And the pages themselves. The same finding as the data, one layer up: five pages drawn at
     * three widths, a rail listing them, a panel that renames one — and nothing anywhere in the
     * product that made one. They exist because `sample-site.ts` wrote them in TypeScript.
     */
    createPageCommands(),
    /*
     * And the one thing five pages with addresses could not do to each other: link. The shared
     * `toggleLink` takes an address, which is the one thing a page must not store — see
     * `link-commands.ts`.
     */
    createLinkCommands(),
    /*
     * And **publishing**, which is the gesture the whole product is for and which had no command at
     * all — `exportSite` was a function on `window`, put there for the console and for tests. A
     * capability that is not a command is invisible to every check this repository has.
     */
    createPublishCommands(),
    /*
     * And **copying a block**, which the shared kit's `copy`/`cut`/`paste` cannot do: those take a
     * range and a reader holding a card has no caret, so all three refused, correctly, every time.
     * Measured from the other end — ⌘D was the only way to get a second copy of anything, and there
     * was no way at all to move a block from one page to another. See `clipboard-commands.ts`.
     */
    new SiteClipboardExtension()
  ];
}

export function createSiteExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),

    // Headings, paragraphs, lists, quotes — a page's prose is a document's prose.
    ...createBasicExtensions(),

    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new LinkExtension(),
    new ImageExtension(),
    /**
     * **An emoji**, which is a character and a name for one.
     *
     * Named here rather than arriving with a bundle, like everything else on this list: a page's
     * vocabulary is a decision, and a product that took whatever the shared kit happened to register
     * would grow surfaces nobody chose. The extension has existed for as long as the node has; what
     * it lacked was a schema that declared one and a product that asked.
     */
    new EmojiExtension(),
    new FontColorExtension(),
    new FontSizeExtension(),
    new FontFamilyExtension(),
    new SubSuperExtension(),
    new TextFormattingExtension(),
    new ReorderExtension(),

    /**
     * The `/` menu, **with this product's own rows**.
     *
     * The shared defaults name `insertCallout`, `insertMathBlock`, `insertComment` and the kit's
     * `setHeading` — none of which this product registers, because a page's inserts are its own
     * (`insertHeading`, `insertBodyText`, `insertQuote`…). The extension filters to what the editor
     * can run, so passing nothing would still be safe; passing the list makes the menu say what a
     * page *offers* rather than what survived a filter.
     *
     * And the list is `siteSlashItems()` — the **toolbar's** insert group, read. Two lists is how a
     * slash menu and an insert toolbar come apart: an insert added to one and not the other is a
     * thing a reader can find by pressing and not by typing.
     */
    new SlashCommandExtension({ items: siteSlashItems() }),

    /**
     * **A table**, which a comparison is and a layout is not — see the header for the half of the
     * old argument that was right.
     *
     * The shared extension whole, because every one of its eight structural commands is the same
     * question wherever it is asked: a row goes above or below *this cell*, and a page has cells the
     * moment it has a table. The renderers were already there — `bTable` draws a real `<table>` with
     * `<th scope>` in it — so this is the commands and the surfaces, not the drawing.
     */
    new TableExtension(),

    ...createSiteOwnExtensions()
  ];
}

export interface SiteEditorOptions extends EditorOptions {
  /** Replace the kit entirely; pass `[]` for a viewer. */
  kit?: Extension[];
  /** Layer bindings over the engine default. */
  keybindings?: Keybinding[];
}

/**
 * Create an editor configured as a site builder.
 *
 * The seam between engine and product, and shorter than the deck's: a schema that is the office
 * schema plus an address and a sizing intent, a kit that is a subset of the shared extensions, and
 * no key map of its own — a page has nothing new to say about Enter or Backspace.
 */
export function createSiteEditor(options: SiteEditorOptions = {}): Editor {
  const { kit, keybindings, extensions = [], ...rest } = options;

  const editor = new Editor({
    ...rest,
    schema: rest.schema ?? createSchema('site', getSiteSchemaDefinition()),
    extensions: [...(kit ?? createSiteExtensions()), ...extensions]
  } as EditorOptions);

  const registry = (editor as never as { keybindings?: { register?: (b: Keybinding) => void } })
    .keybindings;
  for (const binding of keybindings ?? []) registry?.register?.(binding);

  /**
   * A **placement draws its definition**, live — which on a site is a reusable header; and a
   * **collection draws its rows**, which is a product list.
   *
   * The first line is the deck's, unchanged. The second is the product's own half, asked through
   * the hook the shared resolution already had: a list is one placement drawn once per row, so
   * everything about *how* it draws is the canvas layer's and all the site adds is which values
   * each drawing gets.
   */
  installSiteResolution(editor as never);

  return editor;
}
