import type { DocumentAccess } from './document-access';

/**
 * **What a document is called** — read from `docMeta`, which three of the four products keep.
 *
 * ## Why here
 *
 * `office-schema` declares `docMeta → docTitle? docSubtitle? docAuthor*`, and every product that
 * has a title keeps it there: Word's title bar edits it, the site builder's `<title>` and its
 * Open Graph tags come from it, and a note takes it when it has one. Three readers of one shape.
 *
 * The deck is the exception and stays one: a deck's title **is a slide** — the words on the
 * opening page, which is what a reader would have typed into a save dialog. `deckTitle` reads
 * that and is right to.
 *
 * `office-text` rather than `@barocss/shared` because this is a question about the **office
 * vocabulary** — `docMeta` is a node name, and `shared` deliberately knows no node names. All
 * four products already depend on this package, which is what makes it the floor.
 *
 * ## Why it is not in the schema package
 *
 * `packages/schema` declares what may exist. Reading a tree is a different act, and putting a
 * walker beside a declaration is how a schema starts answering questions about documents rather
 * than about shapes.
 */

/**
 * **이 패키지에 이미 있는 것을 쓴다.**
 *
 * 첫 판은 여기서 `DocumentAccess` 를 새로 선언했고, 그것이 `document-access.ts` 의 같은 이름을
 * 가려 `office-site` 에서 *`getRootNodeId` 가 없다* 는 오류로 나왔다. 이 저장소가 여러 번 겪은
 * 모양이다 — **같은 이름으로 두 질문을 묻는 것.**
 *
 * 다른 점은 `rootId` 뿐이다: 저기서는 필수이고 여기 오는 것들 중에는 `getRootNodeId()` 로만
 * 답하는 스토어가 있다. 그래서 그 하나만 넓혀 받는다.
 */
export type MetaAccess = Omit<DocumentAccess, 'rootId'> & {
  rootId?: string;
  getRootNodeId?(): string | undefined;
};

/** Every character under a node, in document order. */
function textUnder(doc: MetaAccess, sid: string): string {
  const node = doc.getNode(sid);
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return ((node.content ?? []) as string[]).map((child) => textUnder(doc, child)).join('');
}

/** The first child of a node with this `stype`. */
function childOfType(doc: MetaAccess, sid: string, stype: string): string | undefined {
  return ((doc.getNode(sid)?.content ?? []) as string[]).find(
    (child) => doc.getNode(child)?.stype === stype
  );
}

/**
 * One of `docMeta`'s fields as words, or nothing.
 *
 * **Nothing rather than an empty string**, and the difference is load-bearing: a starter document
 * carries an *empty* `docTitle` so that the title bar has a node to edit, and a save before the
 * reader has filled it in must fall back to the product's own word rather than being named after
 * a blank.
 */
export function documentMetaText(doc: MetaAccess, field: string): string | undefined {
  const rootId = doc.getRootNodeId?.() ?? doc.rootId;
  if (!rootId) return undefined;

  const meta = childOfType(doc, rootId, 'docMeta');
  const held = meta ? childOfType(doc, meta, field) : undefined;
  const words = held ? textUnder(doc, held).trim() : '';
  return words || undefined;
}

/**
 * What the document is *about*.
 *
 * Not the first heading: a document may open with 목차 or with nothing, and a reader who typed a
 * title into the title bar has already said what this is called.
 */
export const documentTitle = (doc: MetaAccess): string | undefined =>
  documentMetaText(doc, 'docTitle');

/** The line under the title, when there is one. */
export const documentSubtitle = (doc: MetaAccess): string | undefined =>
  documentMetaText(doc, 'docSubtitle');
