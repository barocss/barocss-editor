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
import { createLayoutCommands, installInstanceResolution } from '@barocss/office-canvas';
import { getSiteSchemaDefinition } from './site-schema';
import { createStackCommands } from './stack-commands';

/** What the site product itself adds, as one list. */
export function createSiteOwnExtensions(): Extension[] {
  return [
    /*
     * A stack, and what a stack's child says about its own width.
     *
     * The arrangement itself is the canvas layer's — the same pass that settles a frame's geometry
     * on a slide — and on a page it computes nothing, because a page's children carry no
     * coordinates and the browser lays them out. Installed all the same: a frame *inside* a placed
     * box on a page would need it, and a product that installed the pass only when it turned out to
     * matter would be a product that found out the hard way.
     */
    createLayoutCommands(),
    createStackCommands()
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
   * A **placement draws its definition**, live — which on a site is what a reusable header is.
   *
   * One line, because the deck wrote this first and the second product needing the same three lines
   * is what moved it into the canvas layer. The site adds nothing to it yet: a page has no theme
   * slots and no variable bindings, so there is no second half to ask for.
   */
  installInstanceResolution(editor as never);

  return editor;
}
