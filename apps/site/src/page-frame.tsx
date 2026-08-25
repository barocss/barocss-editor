import { useEffect, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { SITE_ENV_KEY, createSiteEnv, type BreakpointId } from '@barocss/office-site';
import { Overlay, type PointerMode } from './overlay';

/**
 * One page, at one width, editable.
 *
 * ## A view, not a picture
 *
 * The deck draws its filmstrip with a plain `DOMRenderer`, because a thumbnail is a picture: it
 * needs no caret, no observer, no input path. This is the opposite case and the deck has that one
 * too — the notes pane is a second `EditorViewDOM` over **the same editor and the same store**:
 *
 * - **One history.** Typing in the mobile frame and typing in the desktop frame are the same
 *   editor's transactions, so one undo walks back through both in the order they happened.
 * - **One selection.** There is one document, so there is one place the reader is.
 * - **No second copy.** `render(tree)` takes any node with a sid, so each frame draws the page's
 *   own subtree rather than a copy of it.
 *
 * ## A view redraws itself, and the host must not
 *
 * This was got wrong twice in a row, in opposite directions, and the reason both times is that the
 * view's own contract was never read:
 *
 * - **Every `EditorViewDOM` already subscribes to `editor:content.change` and re-renders.** Not
 *   only the editor's first view — every one of them. There was never a second view that "was not
 *   listening"; there was a second view redrawing a tree that could not change.
 * - **A bare `render()` reuses the tree it was last given.** So the shape of the fix is: give the
 *   view a tree that is *live*, once, and it keeps itself right from then on.
 *
 * A deep copy is a dead tree. Handing one over pinned the frame to the document as it was at that
 * instant, which is why the app grew a revision counter and re-rendered every frame on every
 * change — and **that** is what lost the caret: a full out-of-band render replaces the DOM under a
 * reader who is typing in it. The view being typed in had already drawn the change correctly by
 * itself; the host then drew it again, worse.
 *
 * The obvious repair — hand it the *live* proxy instead — crashed the tab, and the reason is the
 * fact none of this was written down: **`render(tree)` mutates the tree it is given.**
 * `_sanitizeTreeContent` assigns to `content`, so a proxy over the store gets resolved nodes written
 * back into the document, and the resolver goes round again on what it just wrote.
 *
 * So a view that draws part of a document says so, and asks for nothing: `rootId`. Then it takes the
 * same path the main view takes — no caller tree, nothing sanitised, nothing written back — and it
 * redraws itself on a content change with the caret where the reader left it.
 *
 * Asking the editor is also what reaches the resolvers, where a placement becomes its definition's
 * parts and a list becomes its rows. A tree walked off the raw store skips all of that — a reusable
 * header drew as an empty box, and a data list drew its `componentValue` declarations, which is a
 * node no product has a renderer for.
 */
export function PageFrame({
  editor,
  breakpoint,
  label,
  width,
  page,
  zoom,
  mode,
  onEnterText,
  scope,
  onScope
}: {
  editor: Editor;
  breakpoint: BreakpointId;
  label: string;
  width: number;
  page?: string;
  zoom: number;
  mode: PointerMode;
  onEnterText: (sid: string) => void;
  scope: string;
  onScope: (scope: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorViewDOM | null>(null);

  useEffect(() => {
    if (!host.current || !page) return;

    if (!view.current) {
      const store = (editor as never as { dataStore: { getNode: (sid: string) => unknown } }).dataStore;
      const doc = {
        rootId: (editor as never as { getRootId: () => string }).getRootId(),
        getNode: (sid: string) => store.getNode(sid) as never
      };

      view.current = new EditorViewDOM(editor, {
        container: host.current,
        registry: getGlobalRegistry(),
        // This view draws one page, not the document — and keeps itself drawn.
        rootId: page,
        env: {
          // The text environment, the same one every view of this document has: a page's paragraphs
          // are a document's paragraphs and resolve their formatting the same way.
          [WORD_ENV_KEY]: createTextEnv(doc as never),
          /*
           * And the one thing this view knows that the others do not: **which width it is**.
           *
           * The env is the only per-view channel there is, which is why a breakpoint's overrides
           * are resolved from here rather than in the store's content resolver — that resolver
           * belongs to the store, and every view would get the same answer to a question whose
           * whole point is that the answers differ (`breakpoints.ts`).
           */
          [SITE_ENV_KEY]: createSiteEnv(breakpoint)
        }
      } as never);
    }

    /*
     * Which page, and then one render. Every later redraw is the view's own — see the header.
     *
     * Re-run only when the page or the width changes, which are the two things that make this a
     * different drawing rather than a newer one.
     */
    view.current.setRootId(page);
    view.current.render(undefined, { sync: true });
  }, [editor, page, breakpoint]);

  useEffect(
    () => () => {
      view.current?.destroy?.();
      view.current = null;
    },
    []
  );

  return (
    <section className="st-frame" data-frame={breakpoint} style={{ width: `${width}px` }}>
      {/* The label a reader reads to know which frame they are typing in. */}
      <header className="st-frame-label">
        <span>{label}</span>
        <span className="st-frame-width">{width}px</span>
      </header>
      <div className="st-frame-body">
        <div ref={host} className="st-frame-host" data-frame-host={breakpoint} />
        {/*
          The pointer's owner, drawn over the board rather than styled into it — see `overlay.tsx`.
          One per board, because the outline has to be drawn where the node is drawn, and the same
          node is drawn three times.
        */}
        {page ? (
          <Overlay
            editor={editor}
            host={host}
            page={page}
            zoom={zoom}
            mode={mode}
            onEnterText={onEnterText}
            scope={scope}
            onScope={onScope}
          />
        ) : null}
      </div>
    </section>
  );
}
