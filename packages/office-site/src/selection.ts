/**
 * What a reader is pointing at, and what pointing at it should select.
 *
 * ## Why a builder needs this and a word processor does not
 *
 * In a document, clicking puts a caret somewhere. That is the whole answer, and the browser gives it
 * for free. In a **builder** the same click means one of three things — put a caret in this text,
 * select the block this text is in, or select the section that block is part of — and which one it
 * means is a decision the product has to make and be consistent about. Every tool of this kind
 * settles it the same way, and the settlement is worth stating rather than reinventing:
 *
 * - **A click selects the outermost block**, the one directly on the page. That is what a reader is
 *   almost always aiming at, and it is the only rule that makes a click predictable — "the thing I
 *   see the edge of".
 * - **A double-click goes one level in**, to the block under the pointer inside what is selected.
 *   Repeat to keep descending. This is *drilling*, and it is why a click never has to guess depth.
 * - **A double-click on text goes into the text**, which is the caret a document would have given
 *   immediately. `Escape` comes back out to the block. Two modes, one gesture each way.
 * - **Shift adds**, everywhere, because a selection is a set (`ModelSelection.nodeIds`).
 *
 * ## Drawn things that are not document nodes
 *
 * A placement's parts and a list's rows are resolved at draw time and carry synthetic sids —
 * `${owner}~${part}` — and `~` appears in nothing the store hands out. So an element inside a card
 * says which card it belongs to, and clicking a resolved part selects **the placement**, which is
 * the only thing a reader can actually change. That convention is `office-canvas`'s and this reads
 * it rather than restating it.
 */
import { SITE_SURFACE_KIND } from './site-schema';

type Node = Record<string, any>;
type Access = { getNode: (sid: string) => Node | undefined };

/**
 * The stypes a reader may select on a page.
 *
 * A list rather than "anything with a sid", because a run of text and a `componentValue` are not
 * things a reader points at — and a selection that can hold them is a panel that has to say what a
 * run's padding is.
 */
export const SELECTABLE = new Set([
  'frame',
  'collection',
  'instance',
  'picture',
  'heading',
  'paragraph',
  'list',
  'listItem',
  'textFrame',
  'bTable',
  'canvasBlock',
  /*
   * The three the rail grew and this list did not.
   *
   * A quotation, a rule and a code block could be put on a page and then **not selected** — so not
   * moved, not deleted, not given a colour and not typed into. They drew perfectly, which is what
   * made it invisible: the round that added them checked that each appears and never checked that a
   * reader can get hold of one.
   */
  'blockQuote',
  'codeBlock',
  'horizontalRule'
]);

/**
 * The stypes whose double-click means *the caret*, because they hold words.
 *
 * `codeBlock` is **not** one of them, and that is the decision rather than an omission. The caret
 * never enters a code block: it is drawn `contenteditable="false"` with Prism's token spans in it,
 * and a caret mapped through spans nothing in the document owns is the arithmetic this product does
 * not need to do. A double-click on one opens an editor of its own instead — `isCode` below is what
 * the overlay asks.
 */
export const TEXTUAL = new Set(['heading', 'paragraph', 'listItem', 'textFrame']);

/** Whether a double-click on this block means *open the code editor* rather than *put a caret in*. */
export function isCode(doc: Access, sid: string | undefined): boolean {
  return doc.getNode(sid ?? '')?.stype === 'codeBlock';
}

/**
 * The document node a drawn sid belongs to.
 *
 * A resolved part names its placement before the first `~`; a stored node has no `~` at all.
 */
export function documentSidOf(sid: string | null | undefined): string | undefined {
  if (!sid) return undefined;
  const at = sid.indexOf('~');
  return at < 0 ? sid : sid.slice(0, at);
}

/**
 * The node a pointer is over: the nearest drawn element with a sid, from the target upward, stopping
 * at the board.
 *
 * Stops at the board because a click that lands on the canvas around a page is not a click on the
 * page — and without the bound it would walk into the app's own chrome and find whatever sid the
 * host happened to leave on an ancestor.
 */
export function sidAtElement(target: Element | null, board: Element): string | undefined {
  let el: Element | null = target;
  while (el && el !== board) {
    const sid = (el as HTMLElement).dataset?.bcSid ?? el.getAttribute?.('data-bc-sid');
    if (sid) return documentSidOf(sid);
    el = el.parentElement;
  }
  return undefined;
}

/**
 * The same walk, keeping the sid **as it was drawn**.
 *
 * `sidAtElement` collapses `${owner}~${part}` to the owner, which is right for every question about
 * *what a reader can change*: a part of a placement is not a thing anybody edits, and the placement
 * is. It is wrong for the one question that is about the drawing itself — **which row of a list is
 * this** — because the row is the part of the sid that gets collapsed away.
 *
 * Measured: a double-click on the second product opened the card showing the first, because the row
 * number had been thrown away two functions earlier and the fallback was zero.
 */
export function drawnSidAtElement(target: Element | null, board: Element): string | undefined {
  let el: Element | null = target;
  while (el && el !== board) {
    const sid = (el as HTMLElement).dataset?.bcSid ?? el.getAttribute?.('data-bc-sid');
    if (sid) return sid;
    el = el.parentElement;
  }
  return undefined;
}

/**
 * The chain from the page down to this node, the page **excluded**.
 *
 * The page itself is never selectable: it is the board, and a builder that let a reader select it
 * would have a selection whose only meaning is "everything", which is what clicking nothing means.
 */
export function pathFromPage(doc: Access, sid: string | undefined, page: string): string[] {
  const chain: string[] = [];
  let at = sid;
  let depth = 0;
  while (at && at !== page && depth++ < 64) {
    const node = doc.getNode(at);
    if (!node) return [];
    /*
     * A **locked** block is not in the chain, which is the whole of what a lock does.
     *
     * Not "selectable but refused": left out entirely, so a press on a locked background picture
     * finds whatever is behind it rather than stopping there. That is the point of locking one — the
     * only way past a full-width picture today is to find something on top of it and walk up.
     *
     * Its children are still in the chain if they are not locked themselves, because locking a
     * container is a statement about the container: a reader who locks a section to stop nudging it
     * still edits the words in it.
     */
    if (SELECTABLE.has(String(node.stype)) && node.attributes?.locked !== true) chain.unshift(at);
    at = node.parentId as string | undefined;
  }
  // Only a chain that actually reached the page belongs to it; anything else is on another page.
  return at === page ? chain : [];
}

/**
 * The deepest selectable block at this point — what the pointer is *really* over.
 *
 * A pointer over a heading is over a run of text, and a run is not a thing anybody aims at. Every
 * question about "what is under the pointer" means this, and asking it about the raw hit is how a
 * hover badge came to read `inline-text` and a double-click on a heading failed to reach its own
 * text.
 */
export function innermostOf(doc: Access, sid: string | undefined, page: string): string | undefined {
  const chain = pathFromPage(doc, sid, page);
  return chain[chain.length - 1];
}

/** The selectable block sitting directly on the page — what a plain click means. */
export function outermostOf(doc: Access, sid: string | undefined, page: string): string | undefined {
  return pathFromPage(doc, sid, page)[0];
}

/**
 * What a click selects **inside the container the reader has entered**.
 *
 * ## Why a scope, and not "one level below what is selected"
 *
 * The obvious rule — a double-click selects one level deeper than the current selection — cannot
 * work, and the reason is in the event sequence rather than in the idea. A double-click is
 * `pointerdown, click, pointerdown, click, dblclick`, and the **first** press of it is an ordinary
 * click that has already put the selection back to the outermost block. So every double-click drills
 * from the top and the reader can never get past the second level. Measured exactly that way: a
 * heading three levels down could not be reached however many times it was double-clicked.
 *
 * So the state that has to be kept is not "what is selected" but **where the reader is** — which
 * container they have entered. A click selects the child of *that* container under the pointer; a
 * double-click steps the container one level in; `Escape` steps it back out. That is what every tool
 * of this kind actually does, and it is why clicking one card and then its neighbour keeps you
 * inside the row instead of jumping back out to it.
 */
export function childOfScope(
  doc: Access,
  sid: string | undefined,
  page: string,
  /** The container the reader is inside. The page is the outermost one there is. */
  scope: string
): string | undefined {
  const chain = pathFromPage(doc, sid, page);
  if (chain.length === 0) return undefined;
  // A scope that is not on this path — the reader clicked outside what they had entered — means the
  // outermost block, which is the same thing as stepping back out to the page.
  const at = scope === page ? -1 : chain.indexOf(scope);
  return chain[Math.min(at + 1, chain.length - 1)];
}

/** What holds this node — where `Escape` goes, and never past the page. */
export function enclosing(doc: Access, sid: string | undefined, page: string): string | undefined {
  const chain = pathFromPage(doc, sid, page);
  return chain.length > 1 ? chain[chain.length - 2] : undefined;
}

/**
 * **Which page a block is on**, which every walk up the tree needs and nothing could ask for.
 *
 * `pathFromPage`, `enclosing`, `childOfScope` and `outermostOf` all take the page as an argument,
 * and the only thing that ever knew it was the app — it holds one in a `scopeRoot` because it draws
 * one board at a time. So a **command** could not use any of them: given a sid and nothing else,
 * there was no way to find the surface it belongs to, which is why going up a level existed as a key
 * handler in the app and not as something a menu could offer.
 *
 * Climbing rather than reading the root, because a site holds several pages and a command is handed
 * a block, not a board.
 */
export function pageOf(doc: Access, sid: string | undefined): string | undefined {
  let at = sid;
  let depth = 0;
  while (at && depth++ < 64) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (node.stype === 'surface') return at;
    at = node.parentId as string | undefined;
  }
  return undefined;
}

/** The stypes that hold other blocks and arrange them — what a drag can be dropped into. */
export const CONTAINERS = new Set(['frame', 'collection']);

/**
 * Which stack a drop at this point means, given what is being carried.
 *
 * ## One rule, and two things it has to survive
 *
 * **A drop lands among the siblings of the block under the pointer.** Dragging a card over another
 * card puts it next to that card; dragging it over a heading inside a card puts it inside the card;
 * dragging a section over another section moves it up or down the page. One sentence, and a reader
 * can predict it from anywhere.
 *
 * Two cases the sentence alone gets wrong, and both were found by writing them down:
 *
 * - **The pointer is over what is being carried.** It always is — the block follows the pointer. The
 *   deepest node *outside* the carried subtree is then the stack the block already lives in, and its
 *   siblings are the wrong answer: the reader would be thrown out of the row they are reordering
 *   inside. So an ancestor of the moving block means **that stack**, not its parent.
 * - **An empty stack.** It has no children to be a sibling of, and it is the one thing on a page with
 *   nothing to aim at, so pointing at it means going in.
 *
 * A pointer "over a block" rather than over its children is not a guess: `elementsFromPoint` returns
 * the deepest element first, so the hit is a container only when nothing of its own is under the
 * pointer — its padding, its gap, its empty part.
 */
export function dropTarget(
  doc: Access,
  hit: string | undefined,
  page: string,
  moving: string
): string | undefined {
  const chain = pathFromPage(doc, hit, page).filter((sid) => !isInside(doc, sid, moving));
  const innermost = chain[chain.length - 1];
  if (!innermost) return page;

  const node = doc.getNode(innermost);
  const container = CONTAINERS.has(String(node?.stype));

  // Where the block already is: stay in it rather than being thrown out to its parent.
  if (isInside(doc, moving, innermost)) return innermost;
  // The one thing on a page with nothing to aim at.
  if (container && blocksIn(doc, innermost).length === 0) return innermost;

  const parent = node?.parentId as string | undefined;
  return parent && !isInside(doc, parent, moving) ? parent : undefined;
}

/** Whether `sid` is `ancestor` or sits inside it. */
export function isInside(doc: Access, sid: string | undefined, ancestor: string): boolean {
  let at = sid;
  let depth = 0;
  while (at && depth++ < 64) {
    if (at === ancestor) return true;
    at = doc.getNode(at)?.parentId as string | undefined;
  }
  return false;
}

/**
 * The nearest thing a reader could actually **select**, walking up from anything at all.
 *
 * Every other function here starts from a page, because every other question about selection starts
 * from a pointer and a pointer is always on a board. This one starts from a *node* — a fault list
 * names the run of text carrying a broken link, and a run is not a thing anybody aims at — and it
 * has to answer inside a definition too, which is not a page.
 *
 * **A lock does not stop it**, which is the one difference from `pathFromPage`. A lock means *do not
 * pick this up while pointing at the canvas*; a reader who has pressed a row in a list of faults has
 * already said which block they mean, and refusing them there would leave a fault nothing can reach.
 * A hidden layer stays in the layer list for exactly the same reason.
 */
export function selectableAt(doc: Access, sid: string | undefined): string | undefined {
  let at = sid;
  let depth = 0;
  while (at && depth++ < 64) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (SELECTABLE.has(String(node.stype))) return at;
    at = node.parentId as string | undefined;
  }
  return undefined;
}

/** Whether a double-click here means a caret rather than another level down. */
export function isTextual(doc: Access, sid: string | undefined): boolean {
  return TEXTUAL.has(String(doc.getNode(sid ?? '')?.stype));
}

/**
 * What a reader calls a **kind** of block — the word, not the thing.
 *
 * Nothing for a type this product has no word for, which is what lets a check see a missing name.
 * `labelOfBlock` would answer for anything, because it falls back to the stype — and a fallback makes
 * a missing name look like a name, which is the failure `every-drawing-can-be-named` is about.
 */
export function kindOfBlock(type: string): string | null {
  switch (type) {
    case 'surface':
      return '페이지';
    case 'frame':
      return '스택';
    case 'collection':
      return '목록';
    case 'instance':
      return '블록';
    case 'picture':
      return '이미지';
    case 'heading':
      return '제목';
    case 'paragraph':
      return '본문';
    case 'list':
      return '목록';
    case 'listItem':
      return '항목';
    case 'bTable':
      return '표';
    case 'inline-text':
      return '텍스트';
    /*
     * The five the rail grew and this switch did not — the same omission, in the same shape, as the
     * one `SELECTABLE` had a round earlier and for the same reason: each was added where it is
     * *drawn* and nowhere it is *named*.
     *
     * A `textFrame` and a `canvasBlock` are the other half: they were selectable from the beginning
     * and have never had a word, because nothing asked. What asked in the end was a panel row that
     * prints the name of the block above the selected one, where a paragraph inside a list reported
     * its holder as `listItem` — the stype, in a reader's panel, in English.
     */
    case 'blockQuote':
      return '인용';
    case 'codeBlock':
      return '코드';
    case 'horizontalRule':
      return '구분선';
    case 'textFrame':
      return '글상자';
    case 'canvasBlock':
      return '그림판';
    default:
      return null;
  }
}

/**
 * What a reader calls this block.
 *
 * Named by what it *does* rather than by its stype, because `frame` is the engine's word and a
 * reader looking at a layer list is looking for the row of cards. A stack says its direction, since
 * that is the one fact that distinguishes two otherwise identical rows in the list.
 */
export function labelOfBlock(doc: Access, sid: string): string {
  const node = doc.getNode(sid);
  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  if (typeof attrs.name === 'string' && attrs.name) return attrs.name;

  switch (node?.stype) {
    case 'frame':
      return attrs.layoutMode === 'row' ? '가로 스택' : attrs.layoutMode === 'grid' ? '그리드' : '세로 스택';
    case 'collection':
      return `목록 · ${typeof attrs.source === 'string' ? attrs.source : '데이터 없음'}`;
    case 'instance':
      return `블록 · ${typeof attrs.componentId === 'string' ? attrs.componentId : '정의 없음'}`;
    case 'picture':
      return '이미지';
    case 'heading':
      return `제목 ${typeof attrs.level === 'number' ? attrs.level : ''}`.trim();
    case 'paragraph':
      return '본문';
    case 'list':
      return '목록';
    case 'bTable':
      return '표';
    /*
     * The rest, from `kindOfBlock`, which is the one list of words this product has.
     *
     * Written as a fallthrough to that rather than as six more cases, because the two functions
     * differ only where a *particular* block says more than its kind does — a stack says its
     * direction, a placement says its definition. A quotation is a quotation.
     */
    default: {
      const word = kindOfBlock(String(node?.stype ?? ''));
      /*
       * And the stype only when there is genuinely no word, which stays visible on purpose: it is
       * what `every-drawing-can-be-named` reports, and a friendlier fallback here would hide the
       * finding rather than fix it.
       */
      return word ?? String(node?.stype ?? '알 수 없음');
    }
  }
}

/**
 * The first run of words inside a block — where a caret goes when a reader enters its text.
 *
 * Needed because entering text mode is a *decision*, not a click: the layer over the board swallowed
 * the double-click that would otherwise have placed the caret, so the caret has to be asked for. A
 * block whose text was entered and has no caret in it is a block a reader types into and nothing
 * happens, which is exactly how this was found.
 */
export function firstRunIn(doc: Access, sid: string | undefined, depth = 0): string | undefined {
  if (!sid || depth > 32) return undefined;
  const node = doc.getNode(sid);
  if (!node) return undefined;
  if (node.stype === 'inline-text') return sid;

  for (const child of (node.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const found = firstRunIn(doc, child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The selectable children of a block, in document order — one level of the layer tree. */
export function blocksIn(doc: Access, sid: string): string[] {
  const node = doc.getNode(sid);
  return ((node?.content ?? []) as unknown[])
    .filter((child): child is string => typeof child === 'string')
    .filter((child) => SELECTABLE.has(String(doc.getNode(child)?.stype)));
}

/**
 * The place in a parent's **content** that "before the Nth block" means.
 *
 * ## Why these are two different numbers
 *
 * `reorderIndexAt` counts the siblings a reader can see, which is the blocks — and a parent may hold
 * things that are not blocks: a page holds its variables, a card holds the values it was given. So
 * "third block" and "third child" are the same number only by luck, and `moveNode` takes the second
 * one. An off-by-one here is a drag that lands one place from where the line was drawn, which is the
 * fault a reader reports as "it does not go where I put it".
 *
 * Counted **without the moving node**, because that is what `moveNode` does: it removes first and
 * inserts into the shortened array.
 */
export function contentIndexFor(
  doc: Access,
  parentId: string,
  moving: string,
  /** The place among the blocks, as `reorderIndexAt` answers it. */
  index: number
): number {
  const content = ((doc.getNode(parentId)?.content ?? []) as unknown[]).filter(
    (sid): sid is string => typeof sid === 'string' && sid !== moving
  );
  const blocks = content.filter((sid) => SELECTABLE.has(String(doc.getNode(sid)?.stype)));

  // Past the last block: the end of the content, so a block dropped at the bottom of a stack lands
  // after everything rather than before whatever non-block happens to be last.
  if (index >= blocks.length) return content.length;
  return Math.max(0, content.indexOf(blocks[index]));
}

/**
 * Every page of the site, in document order — with the **id** a link names it by.
 *
 * The id was added here rather than in a second walk beside it: `page-link.ts` wanted the same list
 * with one more field on it, and two functions that both mean "the pages" is one of them going stale
 * the day a page stops being a direct child of the root.
 */
export function pagesOf(
  doc: Access & { rootId: string }
): { sid: string; id: string; name: string; path: string }[] {
  const root = doc.getNode(doc.rootId);
  return ((root?.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .map((sid) => doc.getNode(sid))
    .filter((node): node is Node => node?.stype === 'surface' && node?.attributes?.kind === SITE_SURFACE_KIND)
    .map((node) => ({
      sid: String(node.sid),
      id: typeof node.attributes?.id === 'string' ? node.attributes.id : '',
      name: typeof node.attributes?.name === 'string' ? node.attributes.name : '이름 없는 페이지',
      path: typeof node.attributes?.path === 'string' ? node.attributes.path : ''
    }));
}
