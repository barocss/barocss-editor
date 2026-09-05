/**
 * What the selection currently is, for anything that has to show it back.
 *
 * A toolbar is the obvious caller — is the bold button pressed, what does the
 * style dropdown say — but so are a status bar, a format painter, and whatever
 * a screen reader is told when the caret moves. They all ask the same three
 * questions: which marks apply, what kind of block is this, and what can be run.
 *
 * The answer is three-valued, not two. A selection across text that is partly
 * bold is neither bold nor not bold, and a control that renders that as "off"
 * turns one click into a silent reformat of everything the user selected. Word
 * shows such a button as indeterminate for exactly this reason.
 */
import type { DataStore } from '@barocss/datastore';
import type { ModelSelection } from './types';
import { selectedNodeIds } from './types';

/** Whether something applies to all of the selection, some of it, or none. */
export type MarkState = 'on' | 'mixed' | 'off';

export interface SelectionSummary {
  /** Marks covering every character of the selection. */
  marks: string[];
  /** Marks covering some of it but not all. */
  mixedMarks: string[];
  /**
   * The attributes carried by each mark that covers the whole selection.
   *
   * A mark's name is enough for a toggle and not enough for anything with a
   * value: a size control has to show eleven points, and `fontSize` alone does
   * not say which. Only marks that cover everything appear here — a size that
   * applies to half the selection is not the size of the selection.
   */
  markAttributes: Record<string, Record<string, unknown>>;
  /** The blocks the selection touches, in document order. */
  blocks: { sid: string; stype: string; attributes: Record<string, unknown> }[];
  /** Attribute values every touched block agrees on — a style id, an alignment. */
  blockAttributes: Record<string, unknown>;
  /** Attributes the blocks disagree about. */
  mixedAttributes: string[];
  /** True when the selection is a caret rather than a span. */
  collapsed: boolean;
  /** True when there is no selection at all. */
  empty: boolean;
}

const EMPTY: SelectionSummary = {
  marks: [],
  mixedMarks: [],
  markAttributes: {},
  blocks: [],
  blockAttributes: {},
  mixedAttributes: [],
  collapsed: true,
  empty: true
};

/** A text node and the part of it the selection covers. */
interface CoveredText {
  sid: string;
  text: string;
  from: number;
  to: number;
}

/**
 * The text the selection covers, node by node.
 *
 * A caret covers no characters, and asking which marks cover no characters has
 * no useful answer — so a caret reports the marks at the position just behind
 * it, which is what decides the formatting of the next thing typed. That is the
 * convention every word processor follows: put the caret after a bold word and
 * the bold button lights up.
 */
function coveredText(store: DataStore, selection: ModelSelection): CoveredText[] {
  const textOf = (sid: string): string | undefined => {
    const node = store.getNode(sid) as { text?: unknown } | undefined;
    return typeof node?.text === 'string' ? node.text : undefined;
  };

  if (selection.collapsed || selection.startNodeId === selection.endNodeId) {
    const text = textOf(selection.startNodeId);
    if (text === undefined) return [];

    if (!selection.collapsed) {
      const from = Math.min(selection.startOffset, selection.endOffset);
      const to = Math.max(selection.startOffset, selection.endOffset);
      return from === to ? [] : [{ sid: selection.startNodeId, text, from, to }];
    }

    // The character behind the caret, or ahead of it at the start of a node
    const at = selection.startOffset;
    const from = at > 0 ? at - 1 : 0;
    const to = at > 0 ? at : Math.min(1, text.length);
    return from === to ? [] : [{ sid: selection.startNodeId, text, from, to }];
  }

  const ids = store.getNodesInRange(selection.startNodeId, selection.endNodeId) ?? [];
  const covered: CoveredText[] = [];

  for (const sid of ids) {
    const text = textOf(sid);
    if (text === undefined || text.length === 0) continue;

    const from = sid === selection.startNodeId ? selection.startOffset : 0;
    const to = sid === selection.endNodeId ? selection.endOffset : text.length;
    if (to > from) covered.push({ sid, text, from, to });
  }

  return covered;
}

/** A node that may carry marks. */
type MarkedNode = { marks?: { stype: string; range?: [number, number]; attrs?: Record<string, unknown> }[] };

/**
 * The values every occurrence of a mark agrees on.
 *
 * A key that differs between occurrences is left out rather than resolved to
 * one of them: the selection genuinely has no single value for it, and saying
 * otherwise is how a size control changes text it was only reporting on.
 */
function agreedValues(occurrences: Record<string, unknown>[]): Record<string, unknown> {
  if (occurrences.length === 0) return {};

  const agreed: Record<string, unknown> = {};
  const keys = new Set(occurrences.flatMap((attrs) => Object.keys(attrs)));

  for (const key of keys) {
    const values = occurrences.map((attrs) => attrs[key]);
    const first = values[0];
    if (first !== undefined && values.every((value) => value === first)) agreed[key] = first;
  }
  return agreed;
}

/** Whether a mark covers the whole of a stretch of one node. */
function coversAll(
  marks: { stype: string; range?: [number, number] }[] | undefined,
  type: string,
  from: number,
  to: number
): boolean {
  return (marks ?? []).some((mark) => {
    if (mark.stype !== type) return false;
    // A mark with no range covers the node entirely
    if (!mark.range) return true;
    return mark.range[0] <= from && mark.range[1] >= to;
  });
}

/** Whether a mark covers any part of a stretch of one node. */
function coversAny(
  marks: { stype: string; range?: [number, number] }[] | undefined,
  type: string,
  from: number,
  to: number
): boolean {
  return (marks ?? []).some((mark) => {
    if (mark.stype !== type) return false;
    if (!mark.range) return true;
    return mark.range[0] < to && mark.range[1] > from;
  });
}

/** The nearest ancestor that is a block, which is what a style applies to. */
function blockOf(store: DataStore, sid: string): { sid: string; stype: string; attributes: Record<string, unknown> } | null {
  let current: any = store.getNode(sid);
  let depth = 0;

  while (current && depth++ < 64) {
    // A text node is not a block; its parent paragraph is
    /* 이름 조건은 중복이었다 — `typeof text !== 'string'` 이 이미 글자 노드를 뺀다. */
    if (current.stype && typeof current.text !== 'string') {
      return {
        sid: current.sid,
        stype: current.stype,
        attributes: (current.attributes ?? {}) as Record<string, unknown>
      };
    }
    current = current.parentId ? store.getNode(current.parentId) : null;
  }

  return null;
}

/**
 * Read the state of a selection.
 *
 * Pure: it asks the store and answers, so a caller can hold the result, compare
 * it with the last one, and redraw only when it differs — which is what stops a
 * toolbar rebuilding itself on every keystroke.
 */
export function readSelectionSummary(
  store: DataStore | undefined,
  selection: ModelSelection | null | undefined
): SelectionSummary {
  if (!store || !selection) return EMPTY;

  // A selection of whole nodes has no text to inspect, so it reports the blocks
  // it covers and no marks — which is the honest answer for three shapes on a
  // board as much as for two cells in a table.
  const wholeNodes = selectedNodeIds(selection);
  if (wholeNodes.length > 0) {
    const blocks = wholeNodes.map((sid) => blockOf(store, sid)).filter(Boolean) as SelectionSummary['blocks'];
    return {
      ...EMPTY,
      empty: false,
      collapsed: false,
      blocks,
      ...sharedAttributes(blocks)
    };
  }

  const covered = coveredText(store, selection);
  if (covered.length === 0) {
    const block = blockOf(store, selection.startNodeId);
    return {
      ...EMPTY,
      empty: false,
      collapsed: selection.collapsed !== false,
      blocks: block ? [block] : [],
      ...(block ? sharedAttributes([block]) : {})
    };
  }

  // Every mark that appears anywhere in the selection is a candidate; whether it
  // is 'on' or 'mixed' is decided by whether every stretch carries it.
  const candidates = new Set<string>();
  for (const stretch of covered) {
    const node = store.getNode(stretch.sid) as { marks?: { stype: string; range?: [number, number] }[] };
    for (const mark of node?.marks ?? []) {
      if (coversAny(node.marks, mark.stype, stretch.from, stretch.to)) candidates.add(mark.stype);
    }
  }

  const marks: string[] = [];
  const mixedMarks: string[] = [];
  const markAttributes: Record<string, Record<string, unknown>> = {};

  for (const type of candidates) {
    const everywhere = covered.every((stretch) => {
      const node = store.getNode(stretch.sid) as MarkedNode;
      return coversAll(node?.marks, type, stretch.from, stretch.to);
    });

    if (!everywhere) {
      mixedMarks.push(type);
      continue;
    }
    marks.push(type);

    // The values, when every occurrence agrees on them. Two runs at different
    // sizes have no size between them, and a control that showed one of the two
    // would apply it to both on the next change.
    const occurrences: Record<string, unknown>[] = [];
    for (const stretch of covered) {
      const node = store.getNode(stretch.sid) as MarkedNode;
      for (const mark of node?.marks ?? []) {
        if (mark.stype !== type) continue;
        if (!coversAny(node.marks, type, stretch.from, stretch.to)) continue;
        occurrences.push(mark.attrs ?? {});
      }
    }
    markAttributes[type] = agreedValues(occurrences);
  }

  const blocks: SelectionSummary['blocks'] = [];
  for (const stretch of covered) {
    const block = blockOf(store, stretch.sid);
    if (block && !blocks.some((b) => b.sid === block.sid)) blocks.push(block);
  }

  return {
    marks: marks.sort(),
    mixedMarks: mixedMarks.sort(),
    markAttributes,
    blocks,
    ...sharedAttributes(blocks),
    collapsed: selection.collapsed !== false,
    empty: false
  };
}

/**
 * What the blocks agree on, and what they do not.
 *
 * An attribute only counts as shared when every block has it and every value is
 * the same. One block with a heading style and one without is a disagreement,
 * not a heading — reporting it as a heading is how a dropdown ends up applying
 * one style to a selection that had two.
 */
function sharedAttributes(
  blocks: SelectionSummary['blocks']
): Pick<SelectionSummary, 'blockAttributes' | 'mixedAttributes'> {
  if (blocks.length === 0) return { blockAttributes: {}, mixedAttributes: [] };

  const keys = new Set<string>();
  for (const block of blocks) for (const key of Object.keys(block.attributes)) keys.add(key);

  const blockAttributes: Record<string, unknown> = {};
  const mixedAttributes: string[] = [];

  for (const key of keys) {
    const values = blocks.map((block) => block.attributes[key]);
    const first = values[0];
    if (values.every((value) => value === first) && first !== undefined) {
      blockAttributes[key] = first;
    } else {
      mixedAttributes.push(key);
    }
  }

  // The block type is an attribute in every practical sense: it is what a style
  // dropdown shows when nothing more specific is set.
  const stypes = new Set(blocks.map((block) => block.stype));
  if (stypes.size === 1) blockAttributes.stype = [...stypes][0];
  else mixedAttributes.push('stype');

  return { blockAttributes, mixedAttributes: mixedAttributes.sort() };
}

/** Whether a mark applies to all of the selection, some of it, or none. */
export function markState(state: SelectionSummary, type: string): MarkState {
  if (state.marks.includes(type)) return 'on';
  if (state.mixedMarks.includes(type)) return 'mixed';
  return 'off';
}

/**
 * The value the whole selection agrees on for one of a mark's attributes, or
 * nothing when it does not agree — `fontSize`'s `size`, `fontFamily`'s `family`.
 *
 * Nothing rather than a guess, and this is the important half: showing one of the
 * two fonts in a selection that spans both would apply it to *everything*
 * selected on the reader's next change. A control drawn blank is a control saying
 * "the selection disagrees", which is exactly what has happened.
 *
 * A string, because a control shows and compares text — the document's own type
 * is whatever the mark stores (a font size is a number of half-points) and
 * converting it back for display is the *declaration's* business, not this one's.
 *
 * Here beside `markState` because it is the same kind of question — what does the
 * selection say about this mark — and because it was being asked twice, in two
 * hand-written copies inside one product's toolbar model, one for choices and one
 * for colours.
 */
export function markAttribute(
  state: SelectionSummary,
  type: string,
  attr: string
): string | null {
  // Mixed first: a selection with two different sizes *has* a value under each
  // mark, and reporting either of them is the failure described above.
  if (state.mixedMarks.includes(type)) return null;

  const value = state.markAttributes?.[type]?.[attr];
  return value === undefined || value === null ? null : String(value);
}
