import type { Editor } from '@barocss/editor-core';
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

/** Preview existing TOC labels without rendering the paragraph owned by the IME.
 * Entry membership and pagination settle after composition, in the normal renderer.
 */
export function installTocCompositionPreview(editor: Editor, container: HTMLElement): () => void {
  const doc: DocumentAccess = {
    get rootId() { return editor.getRootId()!; },
    getNode: id => editor.dataStore.getNode(id) as DocumentNode | undefined
  };
  let composing = false;
  const originals = new Map<HTMLElement, string>();
  const textOf = (node: DocumentNode, depth = 0): string => {
    if (depth > 32) return '';
    if (typeof node.text === 'string') return node.text;
    return childrenOf(doc, node).map(child => textOf(child, depth + 1)).join('');
  };
  const restore = () => {
    // Restore the renderer's last output before it compares the next tree.
    // This also handles cancellation back to exactly the original title.
    for (const [label, text] of originals) {
      if (label.isConnected && label.textContent !== text) label.textContent = text;
    }
    originals.clear();
  };
  const start = (event: Event) => {
    if ((event.target as Element | null)?.closest('[data-editor-input-owner]')) return;
    composing = true;
  };
  const refresh = () => {
    if (!composing) return;
    for (const label of container.querySelectorAll<HTMLElement>('.w-toc-entry .w-toc-text')) {
      const id = label.parentElement?.getAttribute('data-toc-target');
      const heading = id ? doc.getNode(id) : undefined;
      if (!heading) continue;
      if (!originals.has(label)) originals.set(label, label.textContent ?? '');
      const text = textOf(heading).trim();
      if (label.textContent !== text) label.textContent = text;
    }
  };
  const end = (event: Event) => {
    if ((event.target as Element | null)?.closest('[data-editor-input-owner]')) return;
    composing = false;
    restore();
  };
  container.addEventListener('compositionstart', start);
  container.addEventListener('compositionend', end);
  editor.on('editor:content.change', refresh);
  const dispose = () => {
    composing = false;
    restore();
    container.removeEventListener('compositionstart', start);
    container.removeEventListener('compositionend', end);
    editor.off('editor:content.change', refresh);
  };
  return dispose;
}
