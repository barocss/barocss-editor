/**
 * Resolving a style reference into an effective format.
 *
 * A word processor keeps formatting in three places, and rendering needs the
 * one value that results from all of them:
 *
 *   1. document defaults   `docDefaults`
 *   2. the style chain     the style's `basedOn` ancestors, root-first
 *   3. direct formatting   attributes set on the node itself
 *
 * Later wins. That order is why "clear direct formatting" is a meaningful
 * command: it removes step 3 and leaves the node looking like its style again.
 *
 * Only known formatting keys take part. A style node also carries `id`, `name`,
 * `basedOn` and friends, and cascading those would put a style's *name* onto
 * every paragraph that uses it.
 */
import {
  characterFormatAttrs,
  pageSetupAttrs,
  paragraphFormatAttrs,
  tableCellFormatAttrs,
  tableFormatAttrs,
  tableRowFormatAttrs
} from './formatting';
import {
  childOfType,
  childrenOf,
  indexResources,
  type DocumentAccess,
  type DocumentNode
} from './document-access';

export type EffectiveFormat = Record<string, unknown>;

/** Keys that participate in the cascade, by what they format. */
const PARAGRAPH_KEYS = new Set(Object.keys(paragraphFormatAttrs()));
const CHARACTER_KEYS = new Set(Object.keys(characterFormatAttrs()));
const TABLE_KEYS = new Set([
  ...Object.keys(tableFormatAttrs()),
  ...Object.keys(tableRowFormatAttrs()),
  ...Object.keys(tableCellFormatAttrs())
]);
/**
 * Page setup is its own scope: it lives on a section, and asking for a
 * section's *paragraph* format would drop every page property on the floor —
 * which is exactly what left rendered pages with no box at all.
 */
const PAGE_KEYS = new Set(Object.keys(pageSetupAttrs()));

/**
 * `styleId` is how a node points at a style; it is not itself a formatting
 * value, so it must not be copied down the cascade.
 */
const NEVER_CASCADE = new Set(['styleId', 'id', 'name', 'type', 'basedOn', 'next', 'link']);

export type FormatScope = 'paragraph' | 'character' | 'table' | 'page';

function keysFor(scope: FormatScope): Set<string> {
  switch (scope) {
    case 'character':
      return CHARACTER_KEYS;
    case 'table':
      return TABLE_KEYS;
    case 'page':
      return PAGE_KEYS;
    default:
      return PARAGRAPH_KEYS;
  }
}

/**
 * Copy the formatting keys of `source` onto `target`.
 *
 * `undefined` is skipped: an unset property means "inherit", not "reset". A
 * style that genuinely wants to switch something off records `false`, which is
 * why toggle properties are tri-state in Word rather than boolean.
 */
function applyLayer(
  target: EffectiveFormat,
  source: Record<string, unknown> | undefined,
  keys: Set<string>
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || NEVER_CASCADE.has(key) || !keys.has(key)) continue;
    target[key] = value;
  }
}

export interface StyleResolver {
  /** The chain of styles behind an id, root ancestor first. */
  chainFor(styleId: string): DocumentNode[];
  /** Effective format for a node, including its own direct formatting. */
  resolveNode(node: DocumentNode, scope?: FormatScope): EffectiveFormat;
  /**
   * The same, with extra layers applied between the style chain and the node's
   * own direct formatting.
   *
   * That is exactly where a table style's conditional formatting belongs: a
   * header row is bold because the style says so, and stops being bold the
   * moment the user says otherwise on the cell.
   */
  resolveNodeWith(
    node: DocumentNode,
    scope: FormatScope,
    layers: Array<Record<string, unknown> | undefined>
  ): EffectiveFormat;
  /**
   * The regions a table style formats, merged along its `basedOn` chain and
   * keyed by region type (`firstRow`, `band1Horz`, ...).
   *
   * Raw attributes rather than a scoped format: one region formats the cell, the
   * row and the text inside it at once, and each caller wants a different part.
   */
  conditionalFormatsFor(styleId: string): Map<string, Record<string, unknown>>;
  /** Effective format for a style id alone, with no direct formatting. */
  resolveStyle(styleId: string, scope?: FormatScope): EffectiveFormat;
  /**
   * Effective character format for a range, layering any `charStyle` mark that
   * covers it over the paragraph's own character formatting.
   */
  resolveTextRun(node: DocumentNode, offset: number): EffectiveFormat;
  /** The style a new paragraph gets after one in `styleId` (Word's `next`). */
  nextStyleAfter(styleId: string): string | undefined;
}

export function createStyleResolver(doc: DocumentAccess): StyleResolver {
  const resources = indexResources(doc);
  const root = doc.getNode(doc.rootId);
  const defaults = childrenOf(doc, childOfType(doc, root, 'resources')).find(
    (r) => r.stype === 'docDefaults'
  );

  const chainCache = new Map<string, DocumentNode[]>();

  const chainFor = (styleId: string): DocumentNode[] => {
    const cached = chainCache.get(styleId);
    if (cached) return cached;

    // Walk up basedOn, then reverse so the root ancestor is applied first.
    // `seen` guards a cycle: a style based on itself, directly or through a
    // chain, would otherwise loop forever — and a malformed .docx can contain one.
    const chain: DocumentNode[] = [];
    const seen = new Set<string>();
    let currentId: string | undefined = styleId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const style = resources.get(currentId);
      if (!style || style.stype !== 'styleDef') break;
      chain.push(style);
      const basedOn = style.attributes?.basedOn;
      currentId = typeof basedOn === 'string' ? basedOn : undefined;
    }
    chain.reverse();
    chainCache.set(styleId, chain);
    return chain;
  };

  const resolveStyle = (styleId: string, scope: FormatScope = 'paragraph'): EffectiveFormat => {
    const keys = keysFor(scope);
    const format: EffectiveFormat = {};
    applyLayer(format, defaults?.attributes, keys);
    for (const style of chainFor(styleId)) applyLayer(format, style.attributes, keys);
    return format;
  };

  const resolveNodeWith = (
    node: DocumentNode,
    scope: FormatScope = 'paragraph',
    layers: Array<Record<string, unknown> | undefined> = []
  ): EffectiveFormat => {
    const keys = keysFor(scope);
    const format: EffectiveFormat = {};
    applyLayer(format, defaults?.attributes, keys);

    const styleId = node.attributes?.styleId;
    if (typeof styleId === 'string') {
      for (const style of chainFor(styleId)) applyLayer(format, style.attributes, keys);
    }

    for (const layer of layers) applyLayer(format, layer, keys);

    // Direct formatting last: it is what the user set on this node, and it wins.
    applyLayer(format, node.attributes, keys);
    return format;
  };

  const resolveNode = (node: DocumentNode, scope: FormatScope = 'paragraph'): EffectiveFormat =>
    resolveNodeWith(node, scope, []);

  const conditionalCache = new Map<string, Map<string, Record<string, unknown>>>();

  const conditionalFormatsFor = (styleId: string): Map<string, Record<string, unknown>> => {
    const cached = conditionalCache.get(styleId);
    if (cached) return cached;

    // Root-first, so a style that is based on another refines its regions
    // rather than replacing them — which is how the built-in table styles are
    // written, each one a variation on the one below it.
    const regions = new Map<string, Record<string, unknown>>();
    for (const style of chainFor(styleId)) {
      for (const child of childrenOf(doc, style)) {
        if (child.stype !== 'styleConditional') continue;
        const type = child.attributes?.type;
        if (typeof type !== 'string' || type.length === 0) continue;
        regions.set(type, { ...regions.get(type), ...child.attributes });
      }
    }

    conditionalCache.set(styleId, regions);
    return regions;
  };

  const resolveTextRun = (node: DocumentNode, offset: number): EffectiveFormat => {
    const format = resolveNode(node, 'character');

    // A character style applies to a range, so it arrives as a mark rather than
    // an attribute. Marks are applied in document order, so a later one wins.
    for (const mark of node.marks ?? []) {
      if (mark.stype !== 'charStyle') continue;
      const [start, end] = mark.range ?? [0, node.text?.length ?? 0];
      if (offset < start || offset >= end) continue;
      const styleId = mark.attrs?.styleId;
      if (typeof styleId !== 'string') continue;
      for (const style of chainFor(styleId)) applyLayer(format, style.attributes, CHARACTER_KEYS);
    }

    return format;
  };

  const nextStyleAfter = (styleId: string): string | undefined => {
    const next = resources.get(styleId)?.attributes?.next;
    // Word treats a missing `next` as "stay in the same style", which is what
    // makes Body Text behave differently from Heading 1 when you press Enter.
    return typeof next === 'string' ? next : styleId;
  };

  return {
    chainFor,
    resolveNode,
    resolveNodeWith,
    conditionalFormatsFor,
    resolveStyle,
    resolveTextRun,
    nextStyleAfter
  };
}
