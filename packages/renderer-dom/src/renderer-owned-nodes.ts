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
export function setOwnedTextContent(element: Element, text: string): void {
  element.textContent = text;
  const child = element.firstChild;
  if (child && child.nodeType === Node.TEXT_NODE) {
    markRendererOwned(child as Text);
  }
}
