import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { tocEntries, type TocEntry } from './toc';
import { Icon } from '@barocss/office-icons';
import { IconButton } from '@barocss/office-ui';

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

/**
 * 개요 칸에게 필요한 것 — 문서, 열려 있는가, 그리고 **문서가 그려진 곳**.
 *
 * `host` 가 prop 인 이유는 그 요소가 이 칸의 것이 아니기 때문이다. 전에는
 * `document.querySelector('#editor …')` 로 찾았는데, `#editor` 는 **호스트가** 붙이는 id 다 —
 * 페이지에 편집기가 둘이면 어느 쪽인지 말할 수 없고, id 를 안 붙인 호스트에서는 클릭이 조용히
 * 아무 데도 안 간다. 개요는 *제목이 그려진 곳* 이 필요하다고만 말한다.
 */
export interface OutlinePaneProps {
  editor: Editor;
  open: boolean;
  onToggle: () => void;
  /** 문서가 그려진 요소. 없으면 줄을 눌러도 갈 곳이 없다. */
  host?: HTMLElement | null;
}

export function OutlinePane({ editor, open, onToggle, host = null }: OutlinePaneProps) {
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
    // 건네받은 곳 안에서만 찾는다 — `OutlinePaneProps.host` 를 보라.
    const heading = host?.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
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
  }, [host]);

  // Closed, it is a strip to open it by. A pane with no way back is a pane a
  // reader closes once.
  if (!open) {
    return (
      <IconButton label="개요 열기" testClass="w-outline-closed"
        /*
         * A closed pane is a *strip*, not a square: the width, the ground and the border
         * are this app's furniture, and the component's own square sizing has to get out
         * of the way for them. `cn` merges at the call site, so saying so here is enough.
         */
        className="h-auto w-auto items-start rounded-none" onClick={onToggle}>
        {/* The ribbon's own outline button draws this; the strip that opens the
            same pane should not draw a different picture of it. */}
        <Icon name="outline" size={15} />
      </IconButton>
    );
  }

  return (
    <nav className="w-outline" aria-label="문서 개요">
      <div className="w-outline-title">
        개요
        <IconButton label="개요 닫기" onClick={onToggle}>
          <Icon name="close" size={14} />
        </IconButton>
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
