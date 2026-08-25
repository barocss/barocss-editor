import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { watchContent } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { AppBody, AppChrome, AppMain, AppShell, Button, useRevision } from '@barocss/office-ui';
import { BREAKPOINTS, enclosing, pagesOf, type BreakpointId } from '@barocss/office-site';
import { Canvas } from './canvas';
import { Inspector } from './inspector';
import { Layers } from './layers';
import { PageFrame } from './page-frame';
import { Ribbon } from './ribbon';
import type { PointerMode } from './overlay';

/**
 * The site builder's window.
 *
 * ## The shape, and why it is this shape
 *
 * Four regions, and every serious tool of this kind has the same four because each answers a
 * different question a reader has at the same time:
 *
 * - **Along the top**, what can be done — and *how far away the reader is standing*.
 * - **On the left**, what the page is made of, which is the only place an empty stack or a block
 *   behind another block can be reached at all.
 * - **In the middle**, a canvas rather than a pane: the page at every width the reader asked for,
 *   side by side, all of them editable, all of them the same document.
 * - **On the right**, what the selected thing is — resolved for the width being edited, and marked
 *   where that width is disagreeing with the page.
 *
 * ## One selection, three drawings
 *
 * The middle is the part that is not like the other two products. There is one document, one editor
 * and one selection; what there are three of is *views*. So selecting a card outlines it at 1280,
 * 834 and 390 at once, typing in one of them types in all of them, and one undo walks back through
 * whichever of them the reader happened to be in.
 */
export function App({ mount }: { mount: (host: HTMLElement) => { editor: Editor; view: EditorViewDOM } }) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM } | null>(null);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    mounted.current = true;
    setInstance(mount(host.current));
  }, [mount]);

  /**
   * Which widths are on screen, how far away the reader is, who owns the pointer, and which width
   * the panel writes to.
   *
   * All four are the app's rather than the document's: how many screens a *reader* is looking at,
   * and how big, is not a fact about their site.
   */
  const [shown, setShown] = useState<BreakpointId[]>(['desktop', 'tablet', 'mobile']);
  const [zoom, setZoom] = useState(0.75);
  const [mode, setMode] = useState<PointerMode>('select');
  /**
   * The container the reader has entered — the page until they double-click into something.
   *
   * One per reader rather than one per board: they are looking at three drawings of one page, so
   * "where I am" is a fact about them and not about which board they used to get there.
   */
  const [scope, setScope] = useState<string | undefined>(undefined);
  /** Whose text the reader is in, so that leaving it selects the block again rather than nothing. */
  const [entered, setEntered] = useState<string | undefined>(undefined);
  const [at, setAt] = useState<BreakpointId>('desktop');

  const editor = instance?.editor ?? null;
  const revision = useRevision((reread) => watchContent(editor, reread), [editor]);
  const pages = useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } })?.dataStore;
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId) return [];
    return pagesOf({ rootId, getNode: (sid: string) => store.getNode(sid) });
  }, [editor, revision]);

  const [current, setCurrent] = useState<string | undefined>(undefined);
  const page = current ?? pages[0]?.sid;
  // A new page is a new outermost container; nothing that was entered on the last one is on it.
  const inside = scope && page ? scope : page;

  /**
   * `Escape`, which is the way **out** of wherever the reader is — and listened for exactly once.
   *
   * Out of the text to the block, out of the block to what holds it, out of everything. One key, one
   * meaning, *go up*, so a reader can always get unstuck without knowing how the modes work.
   *
   * In the app rather than in the overlay, because there are three overlays and one reader: three
   * document listeners meant one press stepped out three levels, which is a bug only a second board
   * could have produced.
   */
  useEffect(() => {
    if (!editor) return;
    const select = (ids: string[]) =>
      (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
        'setNode',
        { nodeIds: ids }
      );

    const leave = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !page) return;

      if (mode === 'text') {
        setMode('select');
        // Back to the block whose words were being typed, not to nothing: a reader who presses
        // Escape has finished with the text, not with the thing.
        if (entered) select([entered]);
        return;
      }

      const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
      const doc = { getNode: (sid: string) => store?.getNode(sid) };
      const here = scope ?? page;
      if (here === page) {
        select([]);
        return;
      }
      const up = enclosing(doc, here, page) ?? page;
      setScope(up === page ? undefined : up);
      select([here]);
    };

    document.addEventListener('keydown', leave);
    return () => document.removeEventListener('keydown', leave);
  }, [editor, mode, entered, scope, page]);

  /**
   * Fit: as far back as the reader has to stand to see every board at once.
   *
   * Measured from what is drawn rather than computed from the widths, because the gaps, the frame
   * borders and the labels are part of what has to fit and none of them is in the numbers.
   */
  const onFit = useCallback(() => {
    const boards = document.querySelector('.st-boards');
    const pane = document.querySelector('.st-canvas');
    if (!boards || !pane) return;
    const room = pane.clientWidth - 64;
    const wide = boards.getBoundingClientRect().width / zoom;
    if (wide > 0) setZoom(Math.max(0.1, Math.min(1, room / wide)));
  }, [zoom]);

  return (
    <AppShell className="st-shell">
      <AppChrome className="st-topbar">
        <span className="st-brand">Barocss Site</span>

        {/* The pages of the site. A site is more than one page, which is the first thing that
            separates it from a document — and the address is what makes each one a page of it. */}
        <nav className="st-pages" data-pages>
          {pages.map((one) => (
            <Button
              key={one.sid}
              data={{ page: one.sid, 'page-current': one.sid === page ? 'true' : undefined }}
              title={one.path}
              onClick={() => {
                setCurrent(one.sid);
                setScope(undefined);
              }}
            >
              {one.name}
            </Button>
          ))}
        </nav>

        {editor ? (
          <Ribbon
            editor={editor}
            mode={mode}
            onMode={setMode}
            shown={shown}
            onShown={setShown}
            zoom={zoom}
            onZoom={setZoom}
            onFit={onFit}
          />
        ) : null}
      </AppChrome>

      <AppBody className="st-body">
        {editor ? <Layers editor={editor} page={page} /> : null}

        <AppMain className="st-main">
          <Canvas zoom={zoom} onZoom={setZoom}>
            {instance
              ? BREAKPOINTS.filter((one) => shown.includes(one.id)).map((one) => (
                  <PageFrame
                    key={one.id}
                    editor={instance.editor}
                    breakpoint={one.id}
                    label={one.label}
                    width={one.width}
                    page={page}
                    zoom={zoom}
                    mode={mode}
                    onEnterText={(sid) => {
                      setEntered(sid);
                      setMode('text');
                    }}
                    scope={inside ?? ''}
                    onScope={setScope}
                  />
                ))
              : null}
          </Canvas>

          {/*
            The first view, which is the one `mountSite` made.

            Kept in the tree and out of sight rather than thrown away: it is what holds the document
            open, and a host that unmounted it would be taking the editor's own view away from it
            while the boards above are still drawing.
          */}
          <div ref={host} id="editor" hidden />
        </AppMain>

        {editor ? <Inspector editor={editor} at={at} onAt={setAt} /> : null}
      </AppBody>
    </AppShell>
  );
}
