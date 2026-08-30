/**
 * Whether a node sits inside a region the document says may not be edited.
 *
 * ## Why the engine knows about this at all
 *
 * A locked region is drawn `contenteditable="false"`, and both typing gates already refuse a caret
 * the **DOM** puts inside one. That is not enough, and the gap is the reason the second gate exists:
 * the DOM selection and the model selection disagree while a render is in flight, so a key is let
 * through when *either* can name somewhere for it to go — and `beforeinput` then writes at the
 * **model** selection. Measured in a browser: a paragraph inside a locked content control took every
 * character typed at it, while the element around it said `contenteditable="false"` the whole time.
 *
 * So the model has to be able to answer the same question, and a `closest()` on the DOM cannot when
 * the DOM selection is somewhere else.
 *
 * ## `lockContent`, as a convention rather than a node name
 *
 * Word's content control is what has one today. The engine does not know that node and must not: it
 * asks whether **any ancestor** carries `lockContent: true`, which is a statement any product can
 * make about any node — a locked section, a template's fixed heading, a published block on a page.
 *
 * Deliberately not `locked`, which the canvas nodes carry and means something else: a locked *shape*
 * cannot be moved or resized, and its text is still text.
 */
interface NodeLike {
  parentId?: string;
  attributes?: Record<string, unknown>;
}

interface StoreLike {
  getNode: (sid: string) => NodeLike | undefined;
}

/** How far up to look before deciding the tree is malformed rather than deep. */
const MAX_DEPTH = 64;

export function insideLockedRegion(store: StoreLike | undefined, sid: string | undefined): boolean {
  if (!store?.getNode || !sid) return false;

  let current = store.getNode(sid);
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current.attributes?.lockContent === true) return true;
    if (!current.parentId) return false;
    current = store.getNode(current.parentId);
  }
  return false;
}
