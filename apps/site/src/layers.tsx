import { Fragment, useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';
import { blocksIn, labelOfBlock } from '@barocss/office-site';

/**
 * The page, as a list of what it holds.
 *
 * ## Why a builder has one and a word processor does not
 *
 * A document's outline is its headings, because a document *is* a sequence of prose and the headings
 * are how a reader finds their place in it. A page is not a sequence — it is boxes inside boxes — and
 * the thing a reader loses is not their place but the **structure**: which stack this card is in,
 * what is behind the thing they can see, what exists at all when it has no height yet.
 *
 * Which is also the answer to the obvious objection, that everything here can be clicked on the
 * canvas. It cannot: an empty stack is invisible, a block behind another block is unreachable, and a
 * card three levels down takes three double-clicks. The list reaches all of them in one press, and
 * it is the only place the page's shape is *stated* rather than inferred from what happens to be
 * drawn.
 *
 * It shows the same selection as the boards, because there is one selection — selecting a row
 * outlines that block at every width at once.
 */
export function Layers({ editor, page }: { editor: Editor; page?: string }) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  const { rows, selected } = useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
    const doc = { getNode: (sid: string) => store?.getNode(sid) };
    const found: { sid: string; depth: number; label: string; stype: string }[] = [];

    /** Depth-first, because that is the shape of the thing being described. */
    const walk = (sid: string, depth: number) => {
      if (depth > 12) return;
      for (const child of blocksIn(doc, sid)) {
        found.push({
          sid: child,
          depth,
          label: labelOfBlock(doc, child),
          stype: String(store?.getNode(child)?.stype)
        });
        walk(child, depth + 1);
      }
    };
    if (page) walk(page, 0);

    return {
      rows: found,
      selected: new Set(selectedNodeIds((editor as never as { selection?: never }).selection) ?? [])
    };
  }, [editor, page, revision]);

  const select = (sid: string, add: boolean) => {
    const now = [...selected];
    const next = add
      ? now.includes(sid)
        ? now.filter((one) => one !== sid)
        : [...now, sid]
      : [sid];
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.('setNode', {
      nodeIds: next
    });
  };

  return (
    <aside className="st-layers" aria-label="구성">
      <h2 className="st-layers-title">구성</h2>
      <div className="st-layers-list" data-layers>
        {rows.length === 0 ? (
          <p className="st-layers-empty">이 페이지에는 아직 아무것도 없습니다.</p>
        ) : (
          rows.map((row) => (
            <Fragment key={row.sid}>
              <button
                type="button"
                className="st-layer"
                data-layer={row.sid}
                data-stype={row.stype}
                data-selected={selected.has(row.sid) ? 'true' : undefined}
                // The indent is the structure, so it is what the row is measured by rather than a
                // decoration: 12px a level, which is the smallest step still readable at a glance.
                style={{ paddingLeft: `${8 + row.depth * 12}px` }}
                onClick={(event) => select(row.sid, event.shiftKey)}
              >
                <span className="st-layer-name">{row.label}</span>
              </button>
            </Fragment>
          ))
        )}
      </div>
    </aside>
  );
}
