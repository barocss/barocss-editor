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
 * **Tables, for now.** They work — a `bTable` is the same node everywhere — but a table on a page
 * is a layout decision a stack usually makes better, and offering both on day one would teach a
 * reader the wrong one.
 */
import {
  DragDropExtension,
  FontColorExtension,
  FontFamilyExtension,
  FontSizeExtension,
  ImageExtension,
  LinkExtension,
  MoveBlockExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TextFormattingExtension,
  UnderlineExtension,
  createBasicExtensions,
  createCoreExtensions
} from '@barocss/extensions';
import { Editor, type EditorOptions, type Extension, type Keybinding } from '@barocss/editor-core';
import { createSchema } from '@barocss/schema';
import { installSiteResolution } from './collection-resolution';
import { getSiteSchemaDefinition } from './site-schema';
import { createStackCommands } from './stack-commands';
import { createBlockCommands } from './block-commands';
import { createDataCommands } from './data-commands';
import { createElementCommands } from './element-commands';

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
    createDataCommands()
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
    new FontColorExtension(),
    new FontSizeExtension(),
    new FontFamilyExtension(),
    new SubSuperExtension(),
    new TextFormattingExtension(),
    new MoveBlockExtension(),
    new DragDropExtension(),

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
