import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers, watchContent } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import {
  AppBody,
  AppChrome,
  AppMain,
  AppShell,
  ZoomControl,
  useRevision,
  useViewport,
  type Viewport
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  definitionOf,
  editorStateCss,
  enclosing,
  pagesOf,
  type BreakpointId,
  type StateId
} from '@barocss/office-site';
import { Canvas } from './canvas';
import { Inspector } from './inspector';
import { Rail } from './rail';
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
  /**
   * Where the plane is and how large it is drawn — an **offset and a scale**, not a scroll.
   *
   * It was a scroll position and a zoom, and a reader reported the consequence: the top-left corner
   * stayed put and the pointer did not. A scrolling pane can only hold a point still while it has
   * scroll left to give, and a builder opens *fitted*, with the scroll at zero in both axes. See
   * `office-ui`'s `viewport.ts`.
   */
  const [view, setView] = useState<Viewport>({ x: 48, y: 48, zoom: 1 });
  const zoom = view.zoom;
  const pane = useRef<HTMLDivElement>(null);
  const controls = useViewport({ pane, view, onView: setView, min: 0.1, max: 4 });

  /** The plane's unscaled size, reported by the canvas — what 맞춤 and the opening view are computed from. */
  const [plane, setPlane] = useState({ width: 0, height: 0 });
  const measure = useCallback((size: { width: number; height: number }) => setPlane(size), []);
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
  /**
   * The state the panel has opened, held here because it changes what the **boards** draw.
   *
   * The tool's own layer covers the page — that layer is what makes a click mean something on this
   * product — so the page underneath is never the topmost thing under the pointer and its `:hover`
   * never fires. A designer editing a hover would be editing something they cannot see, so the
   * selected blocks are drawn in the state the panel is on.
   */
  const [state, setState] = useState<StateId | undefined>(undefined);

  const editor = instance?.editor ?? null;
  const revision = useRevision((reread) => watchContent(editor, reread), [editor]);
  /*
   * The selection, as a value an effect can depend on. `watchContent` does not fire when only the
   * selection moves, and what the boards preview is *what is selected*.
   */
  const answers = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const chosen = useMemo(
    () => (selectedNodeIds(editor?.selection) ?? []).join(','),
    [editor, answers]
  );
  const pages = useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } })?.dataStore;
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId) return [];
    return pagesOf({ rootId, getNode: (sid: string) => store.getNode(sid) });
  }, [editor, revision]);

  const [current, setCurrent] = useState<string | undefined>(undefined);

  /**
   * The definition being edited, when a reader has opened one.
   *
   * A board takes a `rootId` and draws whatever node it names — which is the same mechanism that
   * draws one page at three widths — so **editing a definition is pointing the boards at its part
   * instead of at a page**. Nothing else in the window changes: the same rail, the same panel, the
   * same selection, because the thing being edited is a stack either way.
   *
   * Held as the durable id rather than as a sid: a definition's sid is this session's, and the id is
   * what a placement names.
   */
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const definition = useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } })?.dataStore;
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId || !editing) return undefined;
    return definitionOf({ rootId, getNode: (sid: string) => store.getNode(sid) }, editing);
  }, [editor, editing, revision]);

  const page = current ?? pages[0]?.sid;
  /**
   * What the boards draw: a page, or the definition's part.
   *
   * Everything downstream — the layer list, the panel, where a new block lands, what `Escape` steps
   * out to — asks "what is the root here", and this is the one place that answers.
   */
  const root = definition?.part ?? page;
  /**
   * What the pointer treats as the outermost thing.
   *
   * The definition itself, so its **part** is an ordinary selectable child rather than the board's
   * unselectable root. Measured: inside a definition the part's own padding, direction and colour
   * could not be reached at all, because a board's root plays the page's role and a page is never
   * selectable.
   */
  const scopeRoot = definition?.sid ?? page;
  // A new page is a new outermost container; nothing that was entered on the last one is on it.
  const inside = scope && scopeRoot ? scope : scopeRoot;

  /**
   * What the boards promise a visitor, as a stylesheet the boards themselves obey.
   *
   * A state is the one value on a page that cannot be folded into a drawing: there is no moment at
   * which a document is *hovered*, because the hovering happens after everything has been drawn. So
   * it leaves the model as a rule — and a designer who cannot see the rule until they publish is a
   * designer guessing, which is what a builder exists to stop.
   *
   * `!important` in it, and only here. The boards are drawn with inline styles by design, and
   * nothing else beats an inline style; the published page has no inline styles left, so its copy of
   * these very declarations needs none (`export-html.ts`). One calculation, two notations.
   */
  useEffect(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } })?.dataStore;
    if (!store || !root) return;

    const sheet = document.createElement('style');
    sheet.dataset.siteStates = 'true';
    sheet.textContent = editorStateCss(
      store as never,
      root,
      state ? { state, sids: chosen.split(',').filter(Boolean) } : undefined
    );
    document.head.append(sheet);
    return () => sheet.remove();
  }, [editor, root, revision, state, chosen]);

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

    /**
     * Whether a key belongs to something else.
     *
     * A panel's own field always wins — `Delete` in a number box is a digit. The **board** is the
     * subtle one: it is `contenteditable` and often holds the focus even in select mode, so asking
     * `isContentEditable` refused every shortcut on the page. Measured exactly that way: nothing
     * could be deleted or duplicated, and `Escape` did nothing either. In select mode the reader is
     * not typing by definition — that is what the mode *is*.
     */
    const elsewhere = () => {
      const at = document.activeElement as HTMLElement | null;
      if (!at) return false;
      if (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA') return true;
      return mode === 'text' && at.isContentEditable;
    };

    const leave = (event: KeyboardEvent) => {
      if (!root || elsewhere()) return;

      /*
       * The two a builder cannot be without, on the keys every tool of this kind uses.
       *
       * Only in select mode and only when nothing is being typed into: `Delete` inside a paragraph is
       * a letter, and a builder that took it would be a builder nobody could write a sentence in.
       */
      if (mode === 'select' && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
          'removeBlocks'
        );
        return;
      }
      if (mode === 'select' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
          'duplicateBlocks'
        );
        return;
      }

      if (event.key !== 'Escape') return;

      if (mode === 'text') {
        setMode('select');
        // Back to the block whose words were being typed, not to nothing: a reader who presses
        // Escape has finished with the text, not with the thing.
        if (entered) select([entered]);
        return;
      }

      const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
      const doc = { getNode: (sid: string) => store?.getNode(sid) };
      const here = scope ?? scopeRoot;
      if (here === scopeRoot) {
        select([]);
        return;
      }
      const up = enclosing(doc, here, scopeRoot) ?? scopeRoot;
      setScope(up === scopeRoot ? undefined : up);
      select([here]);
    };

    document.addEventListener('keydown', leave);
    return () => document.removeEventListener('keydown', leave);
  }, [editor, mode, entered, scope, scopeRoot]);

  /**
   * Fit: as far back as the reader has to stand to see every board at once.
   *
   * Measured from what is drawn rather than computed from the widths, because the gaps, the frame
   * borders and the labels are part of what has to fit and none of them is in the numbers.
   */
  /** Fit: as far back as the reader has to stand to see every board at once. */
  const onFit = useCallback(() => {
    if (plane.width > 0) controls.fitTo(plane, { padding: 40 });
  }, [controls, plane]);

  /**
   * The opening view: the **first** board, as large as it will go and no larger.
   *
   * Once, on the first layout that has a plane to measure — a reader who has moved the view is not
   * asking to be moved back. Never above 1: a page drawn larger than it will be published at is a
   * page whose type a reader cannot judge, which is the one thing these boards are for.
   */
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || plane.width <= 0) return;
    const board = pane.current?.querySelector('.st-frame') as HTMLElement | null;
    if (!board) return;
    settled.current = true;
    controls.fitTo(
      // The first board and the air around it, rather than all three: a reader lands on a page they
      // can read, and presses 맞춤 when they want to compare.
      { width: board.offsetWidth + 128, height: plane.height },
      // Width only. A page is as tall as it turns out, and fitting that height put the boards at
      // **0.19** — a page drawn at a fifth of its size, which is not a page anybody can read.
      { padding: 40, only: 'width' }
    );
  }, [controls, plane]);

  return (
    <AppShell className="st-shell">
      {/*
        Two rows, which is what both other products settled on and for the same reason: **what
        document am I in** and **what can I do to it** are different questions, and a reader who has
        to find the second among the first reads the whole bar every time.

        Row one is the site — its name, its pages, and how far away the reader is standing. Row two
        is the tools.
      */}
      <AppChrome className="st-chrome">
        <div className="st-titlebar">
          <span className="st-brand">Barocss Site</span>

          {/*
            Which page is being edited, said rather than chosen.

            The list of pages moved to the rail, where a site's other lists are — its components and
            its data. What stays here is the one thing a reader needs to *read* rather than press:
            which page they are on, and where it answers.
          */}
          {/*
            Where the reader is: a page and its address, or **a definition and how many places use
            it**. The count is the sentence that has to be said before anybody edits one — *this
            changes five pages* — and it is why the count is read from the document rather than
            remembered.
          */}
          {definition ? (
            <span className="st-where" data-where data-editing-component={definition.id}>
              <button type="button" className="st-back" onClick={() => setEditing(undefined)}>
                ← 페이지로
              </button>
              <span className="st-where-name">{definition.name}</span>
              <span className="st-where-path">{definition.uses}곳에서 사용 중</span>
            </span>
          ) : (
            <span className="st-where" data-where>
              {pages.find((one) => one.sid === page)?.name ?? ''}
              <span className="st-where-path">{pages.find((one) => one.sid === page)?.path ?? ''}</span>
            </span>
          )}

          <div className="st-titlebar-end">
            {/* Typed or pressed, the middle of the view is what stays still — see `viewport.ts`. */}
            <ZoomControl zoom={zoom} onChange={(next) => controls.zoomAt(next)} onFit={onFit} fitLabel="맞춤" />
          </div>
        </div>

        {editor ? (
          <Ribbon
            editor={editor}
            mode={mode}
            onMode={setMode}
            shown={shown}
            onShown={setShown}
          />
        ) : null}
      </AppChrome>

      <AppBody className="st-body">
        {/*
          One rail, several panels — 추가, 구성, 페이지, 컴포넌트, 데이터.

          It was a layer list and nothing else, and the question that found the gap was the plainest
          one a reader can ask: *where do I add a heading?* Nowhere.
        */}
        {editor ? (
          <Rail
            editor={editor}
            page={scopeRoot}
            insertRoot={root}
            pages={pages}
            editing={editing}
            onEdit={setEditing}
            onPage={(sid) => {
              setCurrent(sid);
              setScope(undefined);
              // Leaving the definition, because a page is what the reader asked for.
              setEditing(undefined);
            }}
          />
        ) : null}

        <AppMain className="st-main">
          <Canvas paneRef={pane} view={view} onView={setView} controls={controls} onMeasure={measure}>
            {instance
              ? BREAKPOINTS.filter((one) => shown.includes(one.id)).map((one) => (
                  <PageFrame
                    key={one.id}
                    editor={instance.editor}
                    breakpoint={one.id}
                    label={definition ? `${definition.name} · ${one.label}` : one.label}
                    width={one.width}
                    page={root}
                    scopeRoot={scopeRoot}
                    zoom={zoom}
                    mode={mode}
                    onEnterText={(sid) => {
                      setEntered(sid);
                      setMode('text');
                    }}
                    /*
                     * Double-clicking a placement opens what it draws.
                     *
                     * Which is the gesture every tool of this kind uses, and it costs nothing here:
                     * a placement has no children a reader can select — its parts are resolved — so
                     * the drill has nowhere else to go.
                     */
                    onEditComponent={setEditing}
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

        {editor ? (
          <Inspector
            editor={editor}
            at={at}
            onAt={setAt}
            state={state}
            onState={setState}
            page={definition ? undefined : page}
          />
        ) : null}
      </AppBody>
    </AppShell>
  );
}
