import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { tocEntries, type TocEntry } from '@barocss/office-word';

/**
 * The document's headings, down the side.
 *
 * Word calls it the navigation pane and it answers a question a scrollbar
 * cannot: not how far through the document you are, but *where* — which part,
 * under which heading. A long document is a shape, and this is the only place
 * the shape is visible.
 *
 * It needed no new reading of the document. `tocEntries` already answers exactly
 * this — every heading at its level, and every paragraph naming an
 * `outlineLevel`, which is how a document puts a figure caption or a part title
 * in its contents without making either look like a heading. The contents page
 * and this pane are two drawings of one answer, which is why a line here and a
 * line there agree by construction rather than by care.
 */

/** Every section's entries, in document order. */
function outlineOf(editor: Editor): TocEntry[] {
  const store = (editor as any).dataStore;
  const rootId = store?.getRootNodeId?.();
  const root = rootId ? store.getNode(rootId) : null;
  if (!root) return [];

  const doc = { getNode: (id: string) => store.getNode(id), rootId };
  const entries: TocEntry[] = [];

  const visit = (sid: string, depth: number): void => {
    if (depth > 8) return;
    const node = store.getNode(sid);
    if (!node) return;
    if (node.stype === 'surface') {
      // Every level, not the contents page's usual 1–3: a pane that hides the
      // deeper headings is a pane that disagrees with the document it is a map
      // of.
      entries.push(...tocEntries({ doc, surface: node, levels: '1-9' }));
      return;
    }
    for (const child of ((node.content ?? []) as string[])) visit(child, depth + 1);
  };
  visit(rootId, 0);
  return entries;
}

export function OutlinePane({
  editor,
  open,
  onToggle
}: {
  editor: Editor;
  open: boolean;
  onToggle: () => void;
}) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [here, setHere] = useState<string | null>(null);

  // Follow the document, and the caret: which heading the reader is under is
  // what makes this a map rather than a list.
  useEffect(() => {
    if (!open) return;
    const refresh = () => setEntries(outlineOf(editor));
    const follow = () => {
      const store = (editor as any).dataStore;
      const selection = (editor as any).selection;
      if (!store || !selection?.startNodeId) return;
      // The nearest entry at or above the caret, which is the section it is in.
      const order = outlineOf(editor).map((entry) => entry.sid);
      let node = store.getNode(selection.startNodeId);
      for (let depth = 0; node && depth < 64; depth += 1) {
        const at = order.indexOf(node.sid);
        if (at >= 0) {
          setHere(node.sid);
          return;
        }
        node = node.parentId ? store.getNode(node.parentId) : null;
      }
    };

    refresh();
    (editor as any).on?.('editor:content.change', refresh);
    (editor as any).on?.('editor:selection.model', follow);
    return () => {
      (editor as any).off?.('editor:content.change', refresh);
      (editor as any).off?.('editor:selection.model', follow);
    };
  }, [editor, open]);

  /**
   * Take the reader there, and the caret with them.
   *
   * The same thing a click on a contents line does — see `main.tsx`, where that
   * one lives because the entries are drawn by the renderer and there is no
   * React around them.
   */
  const goTo = useCallback((sid: string) => {
    const heading = document.querySelector(`#editor [data-bc-sid="${CSS.escape(sid)}"]`);
    if (!heading) return;
    heading.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const text = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) return;
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setHere(sid);
  }, []);

  // Closed, it is a strip to open it by. A pane with no way back is a pane a
  // reader closes once.
  if (!open) {
    return (
      <button type="button" className="w-outline-closed" onClick={onToggle} title="개요 열기">
        <span aria-hidden="true">☰</span>
      </button>
    );
  }

  return (
    <nav className="w-outline" aria-label="문서 개요">
      <div className="w-outline-title">
        개요
        <button type="button" onClick={onToggle} title="개요 닫기" aria-label="개요 닫기">
          ×
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="w-outline-empty">제목이 없습니다.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.sid}>
              <button
                type="button"
                className={entry.sid === here ? 'is-here' : undefined}
                // Indented by its level, which is the whole of what a tree is
                style={{ paddingLeft: 8 + (entry.level - 1) * 12 }}
                data-outline-sid={entry.sid}
                data-outline-level={entry.level}
                onClick={() => goTo(entry.sid)}
                title={entry.text}
              >
                {entry.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
