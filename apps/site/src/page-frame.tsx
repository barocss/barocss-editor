import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { SITE_ENV_KEY, createSiteEnv, type BreakpointId } from '@barocss/office-site';

/**
 * One page, at one width, editable.
 *
 * ## A view, not a picture
 *
 * The deck draws its filmstrip with a plain `DOMRenderer`, because a thumbnail is a picture: it
 * needs no caret, no observer, no input path. This is the opposite case and the deck has that one
 * too — the notes pane is a second `EditorViewDOM` over **the same editor and the same store**, and
 * everything that makes it work makes this work:
 *
 * - **One history.** Typing in the mobile frame and typing in the desktop frame are the same
 *   editor's transactions, so one undo walks back through both in the order they happened.
 * - **One selection.** There is one document, so there is one place the reader is.
 * - **No second copy.** `render(tree)` takes any node with a sid, so each frame draws the page's
 *   own subtree rather than a copy of it.
 *
 * ## The snapshot, which is the trap
 *
 * `getDocumentProxy` hands back a *live* view of the store. The reconciler compares the tree it was
 * given with the tree it drew last time, and when both are the same live object every comparison
 * says nothing changed — measured in the deck, with the model plainly holding one thing and the pane
 * still drawing another. So each render passes a snapshot.
 */
export function PageFrame({
  editor,
  breakpoint,
  label,
  width,
  page
}: {
  editor: Editor;
  breakpoint: BreakpointId;
  label: string;
  width: number;
  page?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorViewDOM | null>(null);

  /**
   * Redrawn when the document changes, which is the half that makes this a *view* rather than a
   * screenshot.
   *
   * Measured the first time three frames were on screen: typing in the mobile frame changed the
   * document and the desktop frame went on showing what it had drawn — one editor, one store, three
   * views, and only the one being typed in was listening. A view that renders once is a picture.
   *
   * The editor's own view redraws itself on a content change; a second one is the host's to keep up
   * to date, which is what the deck's notes pane does with the same event.
   */
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const redraw = () => setRevision((count) => count + 1);
    (editor as never as { on?: (event: string, run: () => void) => void }).on?.(
      'editor:content.change',
      redraw
    );
    return () =>
      (editor as never as { off?: (event: string, run: () => void) => void }).off?.(
        'editor:content.change',
        redraw
      );
  }, [editor]);

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

    const store = (editor as never as { dataStore?: { getNode: (sid: string) => unknown } }).dataStore;
    const node = store?.getNode(page);
    if (!node) return;

    // A snapshot rather than the store's proxy — see the header.
    view.current.render(JSON.parse(JSON.stringify(snapshot(store!, page))) as never, { sync: true });
  }, [editor, page, breakpoint, revision]);

  return (
    <section className="st-frame" data-frame={breakpoint} style={{ width: `${width}px` }}>
      {/* The label a reader reads to know which frame they are typing in. */}
      <header className="st-frame-label">
        <span>{label}</span>
        <span className="st-frame-width">{width}px</span>
      </header>
      <div ref={host} className="st-frame-host" data-frame-host={breakpoint} />
    </section>
  );
}

/**
 * The page as a plain tree.
 *
 * Written here rather than taken from `getDocumentProxy` for the reason in the header: the proxy is
 * live, and a live tree compared with itself reports that nothing has changed. Sids are kept —
 * unlike a copy for the clipboard, this *is* the document, and every mapping from a drawn element
 * back to a node goes through them.
 */
function snapshot(
  store: { getNode: (sid: string) => unknown },
  sid: string,
  depth = 0
): Record<string, unknown> | undefined {
  if (depth > 64) return undefined;
  const node = store.getNode(sid) as Record<string, unknown> | undefined;
  if (!node) return undefined;

  const copy: Record<string, unknown> = { ...node };
  const content = node.content;
  if (Array.isArray(content)) {
    copy.content = content
      .map((child) => (typeof child === 'string' ? snapshot(store, child, depth + 1) : child))
      .filter((child) => child !== undefined);
  }
  return copy;
}
