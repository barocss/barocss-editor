import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers, watchContent } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import {
  AppBody,
  AppChrome,
  AppMain,
  AppShell,
  MenuBar,
  ZoomControl,
  useRevision,
  useViewport,
  type Viewport
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  SITE_MENUS,
  siteMenuEntry,
  siteMenuId,
  definitionOf,
  editorStateCss,
  revealRules,
  enclosing,
  pagesOf,
  previewForRow,
  rowLabelsOf,
  setRowPreview,
  type BreakpointId,
  type StateId
} from '@barocss/office-site';
import { Canvas } from './canvas';
import { Inspector } from './inspector';
import { Rail } from './rail';
import { CodeEditor, type CodeEdit } from './code-editor';
import { PageFrame } from './page-frame';
import { Ribbon } from './ribbon';
import type { PointerMode } from './overlay';

/**
 * One exported page, handed to the browser as a file.
 *
 * **Here rather than in the package**, and that is the boundary being kept: `office-site` decides
 * what a site *is* — five documents with addresses — and an app decides what a file is. A package
 * that reached for `document.createElement` to start a download would be a model package that only
 * runs in a browser, and the export is already used by tests with no download in them. The day this
 * product grows a deploy target it is a different function behind the same command.
 *
 * The address becomes the filename the way a host would serve it: `/` is `index.html`, `/제품` is
 * `제품.html`. Not a folder tree, because a browser download cannot make one — and a reader who
 * wanted a tree wanted a deploy rather than a download.
 */
function download(page: { path: string; name: string; html: string }): void {
  const file = page.path === '/' ? 'index' : page.path.replace(/^\//, '').replace(/\//g, '-');
  const url = URL.createObjectURL(new Blob([page.html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${file || 'index'}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  // Released on the next turn of the loop: revoking it synchronously races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
/**
 * What a menu entry is given — its own payload, plus the page a reader is on when it asks for one.
 *
 * The `needs: 'page'` half is the app filling a hole the *model* declares rather than the app
 * knowing something the model does not. Which page is open is genuinely the app's: the document has
 * no notion of one being on screen, and every command here that acts on a page names it by sid.
 */
function payloadFor(
  entry: { command?: string; payload?: Record<string, unknown>; needs?: string },
  page: string | undefined
): Record<string, unknown> | undefined {
  if (entry.needs !== 'page') return entry.payload;
  // `nodeId` is what the page commands read and `pageId` is what publishing reads: two names for one
  // idea, and the day they are one name this line is where it is fixed.
  return { ...entry.payload, nodeId: page, pageId: page };
}

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
   * Whether the reader is **looking at** the site rather than building it.
   *
   * The gap this fills is not a nicety. A page has no height of its own — it is as tall as its
   * content — so what a visitor sees is decided by the window they open it in, and a board that
   * draws the whole page at full height on a plane can never show a **sticky header**, a scroll
   * reveal, or a `:hover` that the tool's own layer is not standing on top of. All three are answers
   * to *what the page does*, and until this there was nowhere for the page to do anything.
   */
  const [preview, setPreview] = useState(false);

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

  /**
   * The code block a reader has opened, if any.
   *
   * A code block is drawn `contenteditable="false"` — the caret never enters one — so the gesture
   * that means *the caret* everywhere else opens this instead. It is a layer over the board rather
   * than a widget inside it, which is what makes a real code editor safe here: nothing is nested in
   * the board's editable region, it is gone when the reader is done, the export never sees it, and
   * the document takes **one transaction** when it closes.
   */
  const [codeEdit, setCodeEdit] = useState<CodeEdit | undefined>(undefined);

  const openCode = useCallback(
    (sid: string, box: { left: number; top: number; width: number; height: number }) => {
      const store = editor?.dataStore as { getNode: (one: string) => any } | undefined;
      const block = store?.getNode(sid);
      if (!block) return;

      const runSid = ((block.content ?? []) as unknown[]).find(
        (one): one is string => typeof one === 'string'
      );
      const run = runSid ? store!.getNode(runSid) : undefined;
      setCodeEdit({
        sid,
        runSid,
        code: typeof run?.text === 'string' ? run.text : '',
        language: typeof block.attributes?.language === 'string' ? block.attributes.language : '',
        box
      });
    },
    [editor]
  );
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
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const rootId = editor?.getRootId?.();
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

  /**
   * Which row of which list the definition is being **designed against**.
   *
   * A card opened on its own draws its declared defaults — `상품`, `설명`, `0원` — and a card
   * designed against those is a card designed against nothing: every real title is longer, every
   * real price has a comma in it, and the two-line description that breaks the layout is in the data
   * rather than in the placeholder.
   *
   * Held here and written nowhere, because it is a fact about *this reader, this minute* — the same
   * kind of fact as which width they are editing. A document that carried it would hand the next
   * person a card mysteriously showing the eleventh product.
   */
  const [row, setRow] = useState<{ collection: string; index: number } | undefined>(undefined);

  /**
   * Open a definition, and say what a reader came in through.
   *
   * One door: the rail's list and a double-click on a placement both arrive here with no row, and a
   * double-click on a **list's** row arrives with one.
   */
  const openDefinition = useCallback(
    (componentId: string, from?: { collection: string; index: number }) => {
      setEditing(componentId);
      setRow(from);
    },
    []
  );

  const definition = useMemo(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const rootId = editor?.getRootId?.();
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
   * The menubar, drawn from `SITE_MENUS` — and **greyed against the document**.
   *
   * An entry a reader can press and that then does nothing is worse than one that is not there, and
   * every command in the model already answers `canExecute`. So the model says what exists and the
   * document says what is possible, which is the same split the toolbar has.
   *
   * A `view` entry has no command to ask, so it is never disabled: how many boards are open is
   * always a question a reader may answer.
   */
  const menus = useMemo(
    () =>
      SITE_MENUS.map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: siteMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            disabled: item.command
              ? !editor?.canExecuteCommand?.(item.command, payloadFor(item, page) as never)
              : false,
            /*
             * The settings a reader is **in**, marked. `undefined` for everything that *does*
             * something, which is what makes the mark mean something — a reader scanning 보기 needs
             * to know which of these are states and which are actions.
             */
            checked:
              item.view === 'preview'
                ? preview
                : item.view?.startsWith('frames.') && item.view !== 'frames.all'
                  ? shown.includes(item.view.slice('frames.'.length) as BreakpointId)
                  : undefined
          }))
        }))
      })),
    // The selection as well as the content: 복제 is possible or not depending on what is chosen, and
    // `watchContent` does not fire when only the selection moves.
    [editor, revision, answers, page, preview, shown]
  );

  /**
   * What a pick does — a command, or a change to how the reader is looking.
   *
   * The `view` branch is the one `switch` the model's header promises: a menu entry that is not a
   * command has to mean something to *somebody*, and the app is the only layer that knows how many
   * boards are on screen.
   */
  const onMenu = useCallback(
    (id: string) => {
      const entry = siteMenuEntry(id);
      if (!entry) return;

      switch (entry.view) {
        case 'frames.desktop':
        case 'frames.tablet':
        case 'frames.mobile': {
          /*
           * A board a reader turns off, and **not the last one**: a builder showing no boards is a
           * builder showing nothing, and the reader who got there has no board left to press.
           */
          const which = entry.view.slice('frames.'.length) as BreakpointId;
          if (!shown.includes(which)) return setShown([...shown, which].sort(
            (a, b) => BREAKPOINTS.findIndex((one) => one.id === a) - BREAKPOINTS.findIndex((one) => one.id === b)
          ));
          if (shown.length === 1) return;
          return setShown(shown.filter((one) => one !== which));
        }
        case 'frames.all':
          return setShown(['desktop', 'tablet', 'mobile']);
        case 'preview':
          return setPreview((was) => !was);
        /*
         * The zoom is a **scale on the plane**, not a scroll — see `viewport.ts` for why that
         * distinction cost a reader their top-left corner once already. So these go through the same
         * `setView` every other zoom gesture does, rather than being a second idea of what zoom is.
         */
        case 'zoom.in':
          return controls.zoomAt(Math.min(4, Math.round(view.zoom * 110) / 100));
        case 'zoom.out':
          return controls.zoomAt(Math.max(0.1, Math.round(view.zoom * 90) / 100));
        case 'zoom.reset':
          return controls.zoomAt(1);
        case 'zoom.fit':
          // The plane's own size, not a captured `onFit`: this callback outlives a resize, and a
          // fit computed against a stale plane fits to a board that is no longer that size.
          return void (plane.width > 0 && controls.fitTo(plane, { padding: 40 }));
        default:
          break;
      }

      if (!entry.command) return;
      const payload = payloadFor(entry, page);

      // Publishing hands back what to write; what a *file* is, is the app's question. See `download`.
      if (entry.command === 'exportPage' || entry.command === 'exportSite') {
        void editor?.executeCommand(entry.command, {
          ...payload,
          write: ({ pages }: { pages: { path: string; name: string; html: string }[] }) =>
            pages.forEach(download)
        } as never);
        return;
      }

      void editor?.executeCommand(entry.command, payload as never);
    },
    [editor, page, controls, view.zoom, plane, shown]
  );
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
   * The preview, handed to the drawing — and one redraw, because nothing in the document moved.
   *
   * The boards keep themselves drawn from the store's changes, and this changes no store: what a
   * bound part *says* is resolved rather than stored, so the only way the drawing hears about a new
   * row is being asked to draw again.
   */
  const [redraw, setRedraw] = useState(0);

  /** What the list's rows are called, for the picker — the dataset's first text field. */
  const rows = useMemo(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !row) return [];
    return rowLabelsOf({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, row.collection);
  }, [editor, row, revision]);
  useEffect(() => {
    if (!editor) return;
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const rootId = editor?.getRootId?.();

    const preview =
      store && rootId && editing && row
        ? previewForRow({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, row.collection, row.index)
        : undefined;

    setRowPreview(editor, preview);
    setRedraw((one) => one + 1);
    return () => setRowPreview(editor, undefined);
  }, [editor, editing, row]);

  /*
   * The code blocks used to be painted here after every drawing — ranges over an untouched run,
   * repainted on the revision because a keystroke moved every token after it. Prism tokenizes in the
   * **renderer** now, so the colour arrives with the drawing and there is nothing to do afterwards.
   */

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
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
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
   * And the **arrivals**, which are drawn only while previewing.
   *
   * The other half of the same idea and the one place this product deliberately shows a reader
   * something different from what a visitor gets: every one of these starts at `opacity: 0`, and a
   * builder that hid half a page from the person building it would be unusable. So while editing,
   * every block is simply there.
   *
   * Preview is where it runs, and it runs for real: the frame scrolls, `view()` takes its clock from
   * the nearest scrollport, and what the reader sees is the page arriving exactly as a visitor's
   * will. That is the same argument the state switch makes — a designer who has to publish to see
   * the motion is a designer guessing — with the mode doing the work the switch does there.
   */
  useEffect(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    if (!store || !root || !preview) return;

    const sheet = document.createElement('style');
    sheet.dataset.siteReveals = 'true';
    sheet.textContent = revealRules(store as never, root, () => undefined, 'data-bc-sid');
    document.head.append(sheet);
    return () => sheet.remove();
  }, [editor, root, revision, preview]);

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
      if (!root) return;
      /*
       * Preview first, and without asking whether the reader is typing — in preview they are not,
       * and it is the one state where a reader can be stuck: no overlay, no panel to press, and the
       * boards are not editable. Escape is the way out of everything here, so it is the way out of
       * this too.
       */
      if (preview && event.key === 'Escape') {
        event.preventDefault();
        setPreview(false);
        return;
      }
      if (elsewhere()) return;

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
  }, [editor, mode, entered, scope, scopeRoot, preview]);

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
            The **menubar** — what acts on the document and the application.

            The division is the whole point and it is not a convention being followed: a menubar
            holds what a reader does *occasionally* and needs to **find**, and a toolbar holds what
            they do constantly and need to **reach**. One strip cannot be both without becoming the
            wall of glyphs Word's second row is.

            It arrived carrying the gesture this product is for: `exportSite` rendered every page of
            a site for weeks and was reachable from `window.exportSite` — put there for the console
            and for tests — and from nothing a reader could press.
          */}
          <MenuBar
            className="st-menubar"
            label="사이트 메뉴"
            menus={menus}
            onPick={onMenu}
          />

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
              {/*
                And which row it is being designed against, when the reader came in through a list.

                A picker rather than a label: the row that breaks a card is rarely the first one, and
                a designer who has to go back to the page and double-click a different product to see
                the long title has been handed the editor's bookkeeping.
              */}
              {row && rows.length > 0 ? (
                <label className="st-where-row">
                  <span>데이터</span>
                  <select
                    value={String(row.index)}
                    onChange={(event) =>
                      setRow({ collection: row.collection, index: Number(event.target.value) })
                    }
                  >
                    {rows.map((label, index) => (
                      <option key={index} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </span>
          ) : (
            <span className="st-where" data-where>
              {pages.find((one) => one.sid === page)?.name ?? ''}
              <span className="st-where-path">{pages.find((one) => one.sid === page)?.path ?? ''}</span>
            </span>
          )}

          <div className="st-titlebar-end">
            {/*
              The one control that changes what the boards *are* rather than what they show. Beside
              the zoom because both are about how the reader is looking, not about the document.
            */}
            <button
              type="button"
              className="st-preview-toggle"
              data-preview={preview ? 'true' : undefined}
              aria-pressed={preview}
              title={preview ? '편집으로 돌아갑니다 (Esc)' : '방문자가 보는 대로 봅니다'}
              onClick={() => setPreview((one) => !one)}
            >
              {preview ? '편집' : '미리보기'}
            </button>
            {/* Typed or pressed, the middle of the view is what stays still — see `viewport.ts`. */}
            <ZoomControl zoom={zoom} onChange={(next) => controls.zoomAt(next)} onFit={onFit} fitLabel="맞춤" />
          </div>
        </div>

        {editor ? (
          <Ribbon
            editor={editor}
            mode={mode}
            onMode={setMode}
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
                    redraw={redraw}
                    zoom={zoom}
                    mode={mode}
                    onEnterText={(sid) => {
                      setEntered(sid);
                      setMode('text');
                    }}
                    /*
                     * Double-clicking a placement opens what it draws — and a **list's row** opens
                     * the card the list draws, against that row.
                     *
                     * Which is the gesture every tool of this kind uses, and it costs nothing here:
                     * a placement has no children a reader can select — its parts are resolved — so
                     * the drill has nowhere else to go. A list had the same nowhere and did nothing
                     * at all, which is what *더블클릭 해도 편집모드가 되지 않아* was.
                     */
                    onEditComponent={openDefinition}
                    onEditCode={openCode}
                    preview={preview}
                    onFollow={(path) => {
                      const found = pages.find((one) => one.path === path);
                      if (found) setCurrent(found.sid);
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

        {/*
          The code editor, over the board and outside it.

          A sibling of the studio rather than a child of a board: it is drawn in screen coordinates
          because the plane zooms, and a code editor drawn at 70% is a code editor nobody can read.
        */}
        {codeEdit && editor ? (
          <CodeEditor
            edit={codeEdit}
            onCommit={(code) => {
              /*
               * One transaction for the whole session, whatever happened inside. CodeMirror keeps
               * its own history while it is open and the document never hears about it — so a reader
               * who typed forty characters and pressed Escape has made **one** change to undo.
               */
              const store = editor.dataStore as { getNode: (one: string) => any };
              const run = codeEdit.runSid ? store.getNode(codeEdit.runSid) : undefined;
              if (!run) return;
              void editor.executeCommand('replaceText', {
                range: {
                  type: 'range',
                  startNodeId: codeEdit.runSid,
                  startOffset: 0,
                  endNodeId: codeEdit.runSid,
                  endOffset: String(run.text ?? '').length
                },
                text: code
              });
            }}
            onClose={() => {
              setCodeEdit(undefined);
              /*
               * And the focus goes back to the board. The keys this app answers — undo, delete,
               * duplicate — are listened for on the board's own editable element, so a reader who
               * closed the code editor and pressed Ctrl+Z would have pressed it at nothing.
               */
              requestAnimationFrame(() => {
                document
                  .querySelector<HTMLElement>('[data-frame="desktop"] [data-bc-layer="content"]')
                  ?.focus();
              });
            }}
          />
        ) : null}

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
