import { useEffect, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { SITE_ENV_KEY, createSiteEnv, type BreakpointId, type SiteWidth } from '@barocss/office-site';
import { viewportOf, deviceNamed, deviceMatches } from '@barocss/office-site';
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
  scopeRoot,
  mode,
  preview,
  wireframe,
  widths,
  onAdd,
  onEnterText,
  onEditComponent,
  onRow,
  onEditRow,
  onEditCode,
  onFollow,
  redraw,
  scope,
  onScope
}: {
  editor: Editor;
  breakpoint: BreakpointId;
  /** Whether this board is drawing the page with its finish taken off — see `wireframe.ts`. */
  wireframe?: boolean;
  /** A plus at the end of a block's flow was pressed — the app opens the one dialog. */
  onAdd?: (place: { parentId: string; at: number }) => void;
  /**
   * The widths this **document** is designed at, so this view resolves overrides through its own list.
   *
   * Passed rather than read here: the app has already asked the document once, and three boards each
   * asking again would be three answers that can differ for one frame after a change.
   */
  widths?: SiteWidth[];
  label: string;
  width: number;
  page?: string;
  /**
   * What the **pointer** treats as the outermost thing, when that is not what is drawn.
   *
   * They are the same on a page. Inside a definition they are not: the board draws the definition's
   * *part*, and a board's root is never selectable — it plays the page's role — so the part's own
   * padding, direction and colour were unreachable. Walking from the `component` one level above it
   * makes the part an ordinary child, and costs nothing: this is only ever the walk's stopping
   * point, never the thing rendered.
   */
  scopeRoot?: string;
  mode: PointerMode;
  /**
   * Whether the board is being **looked at** rather than built.
   *
   * The one thing a builder cannot otherwise show: a page has no height of its own, so what a
   * visitor sees is decided by the window they open it in. In preview the board becomes a window —
   * a typical one for this width — and the page scrolls inside it. Which is also the only way a
   * sticky header, a scroll reveal or a real `:hover` can ever be judged: all three are answers to
   * *what the page does*, and until now there was nowhere for the page to do anything.
   */
  preview?: boolean;
  onEnterText: (sid: string) => void;
  onEditComponent?: (componentId: string, from?: { collection: string; index: number }) => void;
  /** Which row of which list the last press landed in — see `Overlay`. */
  onRow?: (at: { collection: string; index: number } | undefined) => void;
  /** Open that row as a form, with the row the request was made about. */
  onEditRow?: (at: { collection: string; index: number }) => void;
  /** A code block a reader asked to edit, and where it is on screen. */
  onEditCode?: (sid: string, box: { left: number; top: number; width: number; height: number }) => void;
  /** A link followed in preview: the page it names, by address, rather than the browser's own. */
  onFollow?: (path: string) => void;
  /**
   * A number that changes when the drawing must be rebuilt although the **document** did not.
   *
   * There is exactly one such thing so far and it is worth naming rather than hiding in a key: a
   * definition drawn against a row of data resolves what its bound parts *say*, and resolution is
   * not storage — so nothing in the store moves and the view, which keeps itself drawn from the
   * store, hears nothing.
   */
  redraw?: number;
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
          /*
           * The document's **own** widths, so the order an override resolves through is this site's
           * rather than the three every site starts with — see `widthsOf`.
           */
          [SITE_ENV_KEY]: createSiteEnv(breakpoint, false, widths)
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
  }, [editor, page, breakpoint, redraw]);

  useEffect(
    () => () => {
      view.current?.destroy?.();
      view.current = null;
    },
    []
  );

  /**
   * In preview the board is not typable, and that is what makes its links work.
   *
   * A `contenteditable` element swallows a click on an `<a>` — the browser puts a caret in it rather
   * than following it, which is right while a reader is writing and is the whole of what is wrong
   * while they are looking. Turned off here rather than on the editor, because the editor is one and
   * the boards are three: the document is still perfectly editable, this board just is not.
   *
   * Re-applied whenever the drawing is rebuilt, since the view writes the attribute itself.
   */
  useEffect(() => {
    const board = host.current;
    if (!board) return;
    const content = board.querySelector<HTMLElement>('[contenteditable]');
    if (!content) return;
    const was = content.getAttribute('contenteditable');
    content.setAttribute('contenteditable', preview ? 'false' : was ?? 'true');
    return () => {
      if (was !== null) content.setAttribute('contenteditable', was);
    };
  }, [preview, page, redraw]);

  /*
   * The device this width is a window onto, and only while previewing: a bezel around a board a
   * reader is editing would be 20 pixels of nothing between them and their page.
   */
  const device = preview
    ? (() => {
        const here = (widths ?? []).find((one) => one.id === breakpoint);
        const found = deviceNamed(here?.device);
        return found && found.bezel > 0 && deviceMatches(here) ? found : undefined;
      })()
    : undefined;

  return (
    <section
      className="st-frame"
      data-frame={breakpoint}
      data-preview={preview ? 'true' : undefined}
      /* Read by the sheet `wireframeCss` generates — the board's state, not the application's. */
      data-wireframe={wireframe ? 'true' : undefined}
      /*
       * **Which device this board is a window onto**, when the width says so and its numbers still
       * match — a width that says 휴대폰 and is 500 wide is not one, and drawing a phone around it
       * would be the tool claiming a shape the page is not drawn at (`deviceMatches`).
       */
      data-device={device?.name}
      style={{
        width: `${width}px`,
        ['--st-viewport' as never]: `${viewportOf(breakpoint, widths)}px`,
        ...(device
          ? {
              ['--st-bezel' as never]: `${device.bezel}px`,
              ['--st-bezel-radius' as never]: `${device.radius}px`
            }
          : {})
      }}
    >
      {/* The label a reader reads to know which frame they are typing in. */}
      <header className="st-frame-label">
        <span>{label}</span>
        <span className="st-frame-width">{width}px</span>
      </header>
      <div
        className="st-frame-body"
        /*
         * A link in preview goes to **this site's** page rather than out of the app. The address is
         * what the mark resolved to at draw time, and the app knows which page answers it — a
         * builder whose preview navigated the browser away from itself would be a builder a reader
         * only previews once.
         */
        onClick={(event) => {
          if (!preview) return;
          const link = (event.target as HTMLElement)?.closest?.('a[href]');
          const href = link?.getAttribute('href');
          if (!href) return;
          event.preventDefault();
          if (href.startsWith('/')) onFollow?.(href);
        }}
      >
        <div ref={host} className="st-frame-host" data-frame-host={breakpoint} />
        {/*
          The pointer's owner, drawn over the board rather than styled into it — see `overlay.tsx`.
          One per board, because the outline has to be drawn where the node is drawn, and the same
          node is drawn three times.
        */}
        {page && !preview ? (
          <Overlay
            editor={editor}
            host={host}
            page={scopeRoot ?? page}
            breakpoint={breakpoint}
            mode={mode}
            onEnterText={onEnterText}
            onEditComponent={onEditComponent}
            onRow={onRow}
            onEditRow={onEditRow}
            onEditCode={onEditCode}
            onAdd={onAdd}
            scope={scope}
            onScope={onScope}
          />
        ) : null}
      </div>
    </section>
  );
}
