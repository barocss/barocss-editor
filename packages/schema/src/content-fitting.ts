/**
 * Content fitting — coerce a list of nodes into something a parent will accept.
 *
 * Pasted content comes from foreign documents (Word, Google Docs, another
 * editor) and routinely does not match the target's content model: a table
 * dropped into a list item, a heading inside a paragraph, wrappers that have no
 * equivalent here. Inserting it verbatim produces a document that violates its
 * own schema, which the commit-time check would then reject outright — losing
 * the paste entirely.
 *
 * Fitting takes the middle road, in the order a user would expect:
 *   1. keep a node if the parent accepts it here,
 *   2. otherwise unwrap it and try its children (a foreign wrapper disappears
 *      but its content survives),
 *   3. otherwise drop it.
 *
 * This is intentionally simpler than ProseMirror's fitting, which can also
 * *wrap* a node in missing intermediate parents. Wrapping needs a search over
 * the schema and is only worth adding once a concrete case demands it.
 */
import { ContentMatch, ContentMatchContext, getContentMatch } from './content-match';

export interface FitNode {
  stype: string;
  content?: FitNode[];
  [key: string]: unknown;
}

export interface FitResult {
  /** Nodes that may be inserted into the parent, in order. */
  nodes: FitNode[];
  /** Nodes that could not be placed and were discarded. */
  dropped: FitNode[];
  /** Nodes whose wrapper was discarded but whose children were kept. */
  unwrapped: FitNode[];
}

/** Does the expression accept `candidate` as the next child after `soFar`? */
function accepts(
  match: ContentMatch,
  ctx: ContentMatchContext,
  soFar: string[],
  candidate: string
): boolean {
  // A prefix that cannot complete is still a legal prefix, so ask for a match of
  // the whole sequence and treat "incomplete" as acceptable — only an outright
  // rejection at the new index means the candidate does not belong here.
  const result = match.match([...soFar, candidate], ctx);
  return result.valid || result.incomplete === true;
}

/**
 * Fit `nodes` into `parentType`.
 *
 * Returns the nodes to insert plus what had to be given up, so callers can
 * report or log the loss rather than silently swallowing it.
 */
export function fitContent(
  parentType: string,
  nodes: FitNode[],
  ctx: ContentMatchContext & { contentModelOf(nodeType: string): string | undefined }
): FitResult {
  const model = ctx.contentModelOf(parentType);
  // No content model means "anything goes" — nothing to fit.
  if (!model) return { nodes: [...nodes], dropped: [], unwrapped: [] };

  let match: ContentMatch;
  try {
    match = getContentMatch(model);
  } catch {
    // A malformed expression is a schema bug, not a paste problem: do not
    // silently discard the user's content over it.
    return { nodes: [...nodes], dropped: [], unwrapped: [] };
  }

  const kept: FitNode[] = [];
  const keptTypes: string[] = [];
  const dropped: FitNode[] = [];
  const unwrapped: FitNode[] = [];

  const place = (node: FitNode, depth: number): void => {
    if (!node?.stype) return;

    if (ctx.hasNodeType(node.stype) && accepts(match, ctx, keptTypes, node.stype)) {
      kept.push(node);
      keptTypes.push(node.stype);
      return;
    }

    // Unwrap: the wrapper does not belong here, but its children might.
    // Depth-limited so a pathological tree cannot spin.
    const children = Array.isArray(node.content) ? node.content : [];
    if (children.length > 0 && depth < 10) {
      unwrapped.push(node);
      for (const child of children) place(child, depth + 1);
      return;
    }

    dropped.push(node);
  };

  for (const node of nodes) place(node, 0);

  return { nodes: kept, dropped, unwrapped };
}
