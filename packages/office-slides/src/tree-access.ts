import type { DeckAccess, DeckNode } from './deck';

/**
 * A deck **read straight out of a file**, without loading it into an editor.
 *
 * ## Why this exists
 *
 * Everything that reads a deck here takes a `DeckAccess` — `rootId` and `getNode(sid)` — because
 * that is the shape a loaded document has: children are sids, and the store answers by sid. A deck
 * that has just been parsed out of a file is the other shape: children are **nested nodes**, and
 * there are no sids at all (`forFile` strips them; *they are the store's, not the document's*).
 *
 * So asking anything about another deck used to mean loading it, which means replacing the deck on
 * screen. That is fine for opening one and useless for the two questions a library asks: *what
 * does the brand kit define*, and *has it moved on since I copied this?*
 *
 * ## What it does, and the one rule it follows
 *
 * Walks the tree once, hands out an id per node, and answers like a store. The ids are **this
 * reader's, for this walk** — `tree:0`, `tree:1` — and nothing may be written down anywhere,
 * exactly as a session's sids may not: a signature computed over a tree deliberately leaves
 * identity out (`partSignature`), which is what lets a copy be compared with its original at all.
 */
export function accessOfTree(tree: DeckNode | undefined): DeckAccess {
  const nodes = new Map<string, DeckNode>();
  let next = 0;

  const walk = (node: DeckNode | undefined, parentId?: string): string | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    const sid = `tree:${next++}`;
    const children = Array.isArray((node as { content?: unknown }).content)
      ? ((node as { content: unknown[] }).content as DeckNode[])
      : [];

    // Recorded before the children, so a child's `parentId` is answerable while it is being walked.
    nodes.set(sid, { ...node, sid, parentId, content: [] } as never);
    const kids = children
      .map((child) => walk(child, sid))
      .filter((one): one is string => one !== undefined);
    nodes.set(sid, { ...node, sid, parentId, content: kids } as never);
    return sid;
  };

  const rootId = walk(tree) ?? 'tree:none';
  return { rootId, getNode: (sid: string) => nodes.get(sid) };
}
