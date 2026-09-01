/**
 * Which text nodes this renderer created.
 *
 * Element children can always be matched back to a fiber, so a stale one is easy
 * to spot and remove. Text nodes cannot: those produced for `vnode.text` or for a
 * primitive child have no fiber of their own, so stale-child cleanup used to skip
 * every text node wholesale rather than risk deleting live content.
 *
 * That left anything the *browser* put there untouched — and the browser does put
 * things there: an IME composes straight into the DOM, and contenteditable
 * happily creates bare text nodes in shapes this renderer never produces. Those
 * survived every re-render and then fed back into the MutationObserver diff as if
 * they were content.
 *
 * Marking what we create closes that gap: a text node that is neither referenced
 * by a fiber nor renderer-owned is foreign, and can be removed.
 *
 * A WeakSet is used so a removed node is collectable and no bookkeeping is needed
 * on teardown.
 */
const ownedTextNodes = new WeakSet<Text>();

/** Record a text node as created by this renderer. */
export function markRendererOwned<T extends Text>(node: T): T {
  ownedTextNodes.add(node);
  return node;
}

/** Whether this renderer created the given text node. */
export function isRendererOwned(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && ownedTextNodes.has(node as Text);
}

/**
 * Create a text node and record it as renderer-owned. Use this instead of
 * `document.createTextNode` anywhere the renderer builds content, otherwise the
 * node looks foreign to stale-child cleanup and gets removed.
 */
export function createOwnedTextNode(text: string, doc: Document = document): Text {
  return markRendererOwned(doc.createTextNode(text));
}

/**
 * Set an element's text and record the resulting node as renderer-owned.
 *
 * `element.textContent = x` makes the browser create the text node, so it never
 * passes through createOwnedTextNode and would otherwise look foreign.
 */
/**
 * Write new text into a node **without moving the caret that is in it**.
 *
 * ## The one line this exists for
 *
 * `t.data = next` is, by the DOM specification, `replaceData(0, oldLength, next)` — and `replaceData`
 * says that a live range whose offset falls **inside** the replaced span is moved to the start of it.
 * The whole node is the replaced span, so every caret in it goes to **0**. Not a browser quirk: it is
 * what the standard requires, and it is why this pool reusing the node was not enough on its own.
 *
 * Measured, in the site builder, with a real IME. Press Enter, type 가:
 *
 *     확정 직후   dom "﻿가"@2   model 1     <- both right
 *     80ms 뒤     dom "가"@0     model 0     <- the render wrote `.data` and the caret fell to 0
 *
 * The next syllable then went in front of the last one: 가 → 나가 → 나다가, and the caret appeared to
 * jump to the start of the line on every keystroke. Only in a block a fresh Enter had made, because
 * only there does the text change shape — the empty-block filler is dropped once real text arrives,
 * so that is the one render that rewrites a node the caret is sitting in.
 *
 * ## What it does instead
 *
 * Replaces only the stretch that actually differs. The specification's own rules then move the caret
 * correctly for free: a caret **after** an edit shifts by the length difference, a caret **before** it
 * does not move, and only a caret genuinely inside the changed span is repositioned — which is right,
 * because those characters are gone.
 *
 * The filler case comes out exactly right: "﻿가" to "가" is a one-character delete at 0, so a caret at
 * 2 becomes 1, which is where the reader left it.
 */
export function writeText(node: Text, next: string): void {
  const was = node.data;
  if (was === next) return;

  let start = 0;
  const shortest = Math.min(was.length, next.length);
  while (start < shortest && was.charCodeAt(start) === next.charCodeAt(start)) start += 1;

  let endWas = was.length;
  let endNext = next.length;
  while (endWas > start && endNext > start && was.charCodeAt(endWas - 1) === next.charCodeAt(endNext - 1)) {
    endWas -= 1;
    endNext -= 1;
  }

  node.replaceData(start, endWas - start, next.slice(start, endNext));
}

/**
 * Set an element's text and record the resulting node as renderer-owned.
 *
 * `element.textContent = x` makes the browser create the text node, so it never
 * passes through createOwnedTextNode and would otherwise look foreign.
 *
 * **And it destroys the node that was there**, which is the other half of the caret finding: a
 * caret lives *in a text node*, so replacing the node loses it even more completely than rewriting
 * its data does. When the element already holds exactly one text node, this writes into it — and
 * `writeText` then changes only the stretch that differs, so the caret moves the way the reader
 * would expect and not to the start of the line.
 */
export function setOwnedTextContent(element: Element, text: string): void {
  const only = element.firstChild;
  if (only && only.nodeType === Node.TEXT_NODE && only === element.lastChild) {
    writeText(only as Text, text);
    markRendererOwned(only as Text);
    return;
  }
  element.textContent = text;
  const child = element.firstChild;
  if (child && child.nodeType === Node.TEXT_NODE) {
    markRendererOwned(child as Text);
  }
}
