/**
 * Everything wrong with a document, in one walk.
 *
 * ## Why this exists at the third check rather than the first
 *
 * Three functions in this package answer "what is wrong with this": `overrideFaults` for a width
 * that says something the node cannot hold, `linkFaults` for a link naming a page that is not there,
 * and now `stateFaults` for a state that would move the block out from under the pointer. Each was
 * written with a unit test beside it, and **nothing ran any of them over a real document**.
 *
 * That is worse than not having them. A check nobody runs reads, to the next person, exactly like a
 * check that passes — which is the failure this repository has already written down twice about
 * itself. Two was a coincidence; three is the thing nobody wrote, so here it is.
 *
 * ## What it is not
 *
 * Not validation. Nothing here refuses an edit or blocks a save: a document that arrives holding a
 * fault is a document a reader still has to be able to open and fix, and a builder that would not
 * open it has turned a wrong colour into a lost afternoon. It **reports**, in the words a reader
 * would use, against the node they would click.
 */
import { collectionFaults } from './data';
import { linkFaults } from './page-link';
import { overrideFaults } from './responsive';
import { stateFaults } from './states';

/** What a walk needs of a document: where it starts, and how to get a node. */
type Access = { rootId: string; getNode: (sid: string) => any };

export interface Fault {
  /** The node a reader would click to fix it. */
  sid: string;
  /** Which question found it, so a panel can group them. */
  kind: 'width' | 'state' | 'link' | 'data';
  /** What is wrong, in the words a reader would use. */
  said: string;
}

/**
 * What a node **declares**, which both attribute checks need and neither can get on its own.
 *
 * A caller with a schema passes one in. Without it the two checks fall back to their empty-set
 * behaviour — every name is accepted — which is the right default here rather than a guess: a check
 * that invented the list would report a correct document as faulty, and a report that cries wolf is
 * one nobody reads twice.
 */
export type Declares = (node: { stype?: unknown }) => Iterable<string>;

export function documentFaults(
  doc: Access,
  options?: { declares?: Declares }
): Fault[] {
  const found: Fault[] = [];
  const declares = options?.declares ?? (() => []);

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid) as { stype?: unknown; attributes?: Record<string, unknown>; content?: unknown[] } | undefined;
    if (!node) return;

    const attrs = node.attributes ?? {};
    const declared = declares(node);
    for (const said of overrideFaults(attrs, declared)) found.push({ sid, kind: 'width', said });
    for (const said of stateFaults(attrs, declared)) found.push({ sid, kind: 'state', said });

    if (node.stype === 'collection') {
      /*
       * The template is the collection's first child — the thing drawn once per row. Asked of the
       * document rather than assumed, because a collection whose template has been deleted is one of
       * the two faults `collectionFaults` exists to name.
       */
      const first = (node.content ?? []).find((child) => typeof child === 'string') as string | undefined;
      const template = first ? doc.getNode(first) : undefined;
      for (const said of collectionFaults(doc, node as never, template as never)) {
        found.push({ sid, kind: 'data', said });
      }
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(doc.rootId);

  for (const fault of linkFaults(doc)) {
    found.push({ sid: fault.sid, kind: 'link', said: `이 링크가 가리키는 페이지가 없습니다 (${fault.missing})` });
  }

  return found;
}
