import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers, watchContent } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import {
  Icon,
  AppBody,
  AppChrome,
  AppMain,
  AppShell,
  MenuBar,
  IconButton,
  fieldKeeps,
  ZoomControl,
  useRevision,
  useViewport,
  zoomIn,
  zoomOut,
  type Viewport
} from '@barocss/office-ui';
import {
  siteMenusFor,
  widthsOf,
  datasetNamed,
  datasetsOf,
  writerMayRun,
  drawnSidAtElement,
  outermostOf,
  siteKeyFor,
  siteMenuEntry,
  siteMenuId,
  definitionOf,
  editorStateCss,
  revealRules,
  wireframeCss,
  pagesOf,
  previewForRow,
  rowLabelsOf,
  setRowPreview,
  typeRule,
  zipOf,
  type BreakpointId,
  type StateId
} from '@barocss/office-site';
import { Canvas } from './canvas';
import { Inspector, addPicture } from './inspector';
import { SlashSurface } from './slash-surface';
import { TextSurface } from './text-surface';
import { Rail, type Panel as RailPanel } from './rail';
import { Admin, type AdminTab } from './admin';
import { DataTable, RowForm } from './data-editor';
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
  save(`${file || 'index'}.html`, page.html, 'text/html');
}

/**
 * One file, handed to the browser.
 *
 * Named by the caller rather than derived here, which is what let a **sitemap** come out of the same
 * publish: it is XML, it is called `sitemap.xml`, and neither of those is something the page-naming
 * rule above could have produced.
 */
function save(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Released on the next turn of the loop: revoking it synchronously races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The whole site, as one file a reader can hand to a host.
 *
 * A folder is the shape a published site has — `index.html`, `제품/index.html`, `assets/로고.png` —
 * and a browser download cannot make one. The bytes are `zipOf`'s; this is the handing over.
 */
function saveArchive(name: string, bytes: Uint8Array): void {
  /*
   * `bytes.slice()` rather than the array itself: a `Uint8Array` over a `SharedArrayBuffer` is not a
   * `BlobPart`, and TypeScript is right to say so — the copy is one array of a few hundred kilobytes
   * and the alternative is a cast that would be wrong on the day it mattered.
   */
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * What the archive is called — the site's own home page, or `site`.
 *
 * A reader who publishes twice should not have two files called `download.zip` in a folder. The home
 * page's name is the closest thing a document has to the site's, which is what a reader would have
 * typed if asked.
 */
function nameOfSite(pages: { path: string; name: string }[]): string {
  const home = pages.find((one) => one.path === '/') ?? pages[0];
  const said = (home?.name ?? '').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return `${said || 'site'}.zip`;
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
/**
 * What kind of block is selected — the second half of the question `writerMayRun` asks.
 *
 * `setBlockFormat` is this product's 24-field command: it writes a heading's level *and* a section's
 * padding, so a list of command names alone cannot say whether a writer may use it. The list carries
 * `setBlockFormat.picture`, and this is what tells it which.
 */
function stypeOf(editor: Editor | null): string | undefined {
  const sid = selectedNodeIds(editor?.selection as never)?.[0];
  if (!editor || !sid) return undefined;
  return String((editor.dataStore as never as { getNode?: (s: string) => any })?.getNode?.(sid)?.stype ?? '');
}

/**
 * **The editor a writer is handed**, which refuses everything the mode does not allow.
 *
 * One gate rather than a rule each surface remembers. The rail, the ribbon, the panel and the board
 * each build their own `run` from the editor they are given — so a mode enforced surface by surface
 * is a mode that leaks the day somebody adds a fifth. `Object.create` keeps the editor exactly as it
 * is and overrides the two methods a command goes through.
 *
 * `canExecuteCommand` as well as `executeCommand`, because a control that lights up and then refuses
 * is worse than one that is greyed: a reader stops believing the rest of the surface.
 */
function forWriter(editor: Editor): Editor {
  const held = editor as never as {
    executeCommand: (name: string, payload?: unknown) => Promise<boolean>;
    canExecuteCommand?: (name: string, payload?: unknown) => boolean;
  };
  const guard = Object.create(editor) as typeof held;
  guard.executeCommand = async (name: string, payload?: unknown) =>
    writerMayRun(name, stypeOf(editor)) ? await held.executeCommand(name, payload) : false;
  guard.canExecuteCommand = (name: string, payload?: unknown) =>
    writerMayRun(name, stypeOf(editor)) && (held.canExecuteCommand?.(name, payload) ?? false);
  return guard as never as Editor;
}

function payloadFor(
  entry: { command?: string; payload?: Record<string, unknown>; needs?: string },
  /**
   * **What the boards are drawing** — a page, or the part of a component being edited.
   *
   * It was the *page* here, and that is what *컴포넌트 편집 화면에서 아무것도 추가 할 수 없음* turned
   * out to be. It was worse than nothing happening: 삽입 and every insert chord were putting blocks
   * on the page **behind** the component, where the reader could not see them arrive and had no
   * reason to look. The rail and the ribbon already took the boards' subject; the menubar and the
   * keys took the page.
   *
   * The one exception is a command that is genuinely *about a page* — publishing it, copying it,
   * deleting it — and those are told apart by name below rather than by hoping.
   */
  root: string | undefined,
  page: string | undefined
): Record<string, unknown> | undefined {
  if (entry.needs === 'page') {
    /*
     * A page command means the page; an insert means wherever the reader is looking. `nodeId` is
     * what the page commands read and `pageId` is what an insert and publishing read — two names for
     * one idea, and the day they are one name this line is where it is fixed.
     */
    const about = ['exportPage', 'duplicatePage', 'removePage'].includes(entry.command ?? '');
    return { ...entry.payload, nodeId: page, pageId: about ? page : (root ?? page) };
  }
  return entry.payload;
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
  /**
   * **Which boards are open**, held by name rather than by which three there are.
   *
   * `undefined` means *all of them*, which is what it has to mean now that the list is the
   * document's: a state initialised with three names would go stale the moment a reader added a
   * fourth, and the fourth board would arrive switched off for a reason nobody could see.
   */
  const [hidden, setHidden] = useState<BreakpointId[]>([]);
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
   * **와이어프레임 보기** — the same page with the finish taken off.
   *
   * Beside `preview` rather than folded into it, because they are opposite views of one document and
   * a reader wants each for a different reason: preview is *what a visitor gets*, and this is *what
   * a visitor is being asked to look at*. Both are views rather than commands — nothing in the site
   * changes, so there is nothing to undo — and both are the boards' state rather than the
   * application's, so a reader with three widths open sees all three in it.
   */
  const [wireframe, setWireframe] = useState(false);
  /**
   * **Which row of which list the pointer last landed in**, and whether its form is open.
   *
   * Held here rather than derived, because the row number lives only in the drawing: a row's sid is
   * `${collection}~${index}` and every other question in this app wants the document node, which is
   * the collection. So the board says it once, on press, and this is where it waits.
   */
  const [rowAt, setRowAt] = useState<{ collection: string; index: number } | undefined>();
  /**
   * And the row the **drawer** is showing, which is a different thing from the one the pointer last
   * saw and had to be separated after it was measured.
   *
   * Choosing *3행 편집* opened row 2: Radix closes its menu on the item's press, the click that
   * follows lands on the board underneath — over some other card — and `rowAt` moved while the
   * drawer was reading it. What is open must not follow the pointer.
   */
  const [rowOpen, setRowOpen] = useState<{ sid: string; row: number; label: string } | undefined>();
  /**
   * **글 고치기** — the mode in which a reader may change the words and nothing else.
   *
   * A mode and **not a permission**, which this product has to be precise about: there are no
   * accounts, so *this person may only write* cannot be enforced and must not be claimed. What a
   * reader gets is a mode they chose — and most of the damage a writer does to a layout is done by
   * accident, so a mode stops all of it. The day there are accounts, this is the shape a permission
   * is expressed in.
   */
  const [writing, setWriting] = useState(false);
  /**
   * **What a reader may add, and where** — one dialog with two ways in.
   *
   * The ribbon's 넣을 것 고르기 opens it, and so does the plus at either end of a selected block. The
   * state is here rather than in the ribbon because two surfaces change it, and the **place** is here
   * because only one of them has one: with nothing said the dialog inserts where it always did.
   */
  const [adding, setAdding] = useState(false);
  const [addAt, setAddAt] = useState<{ parentId: string; at: number } | null>(null);

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
  /**
   * Which of the rail's lists is open — here rather than in the rail, because the **menubar** points
   * at one: the choice a placement needs is a definition, and only that list can offer one.
   */
  const [panel, setPanel] = useState<RailPanel>('add');

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
   * **The dataset being edited**, when a reader has opened one — and the third thing the main area
   * can show.
   *
   * It was a dialog, and the argument for that was *a table needs width the shell cannot give*. True,
   * and the conclusion did not follow: a dialog is what you reach for when width is the only problem,
   * and it kept having to grow. What was actually wrong is the other half — *editing data is a stint*
   * — because a dataset is a **place**: a reader goes back to it, it holds most of what the site
   * says, and the work is the same kind of work as editing a page.
   *
   * So it is `editing`'s sibling, exactly. By **name**, for the same reason a definition is held by
   * its id: a sid is this session's and goes stale after the first edit made in the table.
   */
  const [dataset, setDataset] = useState<string | undefined>(undefined);

  /**
   * **관리가 밖이고 편집이 안** — which of the two the window is showing.
   *
   * Six things this product draws are about the **site** rather than about a page — its pages, its
   * data, its definitions, its publishes, its faults, its files — and they had ended up in three
   * unrelated places: some as rail tabs, two in the rail's *footer*, one in the main area, and the
   * files nowhere at all. All six want width, no canvas and no properties panel, which is a mode
   * rather than a fifth view; moving the dataset table into the main area had already made half of
   * one by accident.
   *
   * It **opens** here, and that is not habit: a document tool cannot decide what a page looks like
   * without opening the page, so opening one is a step *in*. A builder that started in the canvas
   * would have to answer *which page* before the reader had seen the list.
   */
  const [admin, setAdmin] = useState<AdminTab | undefined>('pages');

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
      /* One main area, one thing in it: opening a definition leaves the table. */
      setDataset(undefined);
      setAdmin(undefined);
    },
    []
  );

  /** And the other door into it, which leaves whatever the boards were showing. */
  const openDataset = useCallback((name: string) => {
    setDataset(name);
    setEditing(undefined);
    /* Going in — the admin is what a reader opens *from*, and a dataset is one of the things in it. */
    setAdmin(undefined);
  }, []);

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
   * **The widths this site is designed at**, from the document — three unless it says otherwise.
   *
   * Read here rather than in each place that needs one, because three things need the same answer at
   * the same instant: which boards to draw, what the 보기 menu offers, and what a renderer resolves
   * an override through. Recomputed on the revision, which is when a width can have changed.
   */
  const widths = useMemo(
    /*
     * The **document's** root, not `root` — which is this app's word for the page (or the part of a
     * component) being drawn. The widths box is the document's own child, so asking a page for it
     * finds nothing and falls silently back to the three every site starts with: the panel listed
     * four and the boards went on drawing three, which is exactly how it was found.
     */
    () => widthsOf(editor?.dataStore as never, editor?.getRootId?.()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, revision]
  );
  const shown = useMemo(
    () => widths.filter((one) => !hidden.includes(one.id)),
    [widths, hidden]
  );

  /**
   * The row the panel offers to open, resolved into *which dataset and which row* — the two things a
   * form needs and the board cannot know.
   *
   * The board hands back the **collection's** sid and an index; a dataset is what that collection
   * names in `source`, which is the same indirection every other reference in this document makes.
   * A row whose list has since been deleted, or whose index is past the end, resolves to nothing —
   * so the panel simply does not offer the door rather than opening an empty form.
   */
  const rowIn = useCallback(
    (one: { collection: string; index: number } | undefined) => {
      const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
      const rootId = editor?.getRootId?.();
      if (!store || !rootId || !one) return undefined;

      const list = store.getNode(one.collection);
      if (list?.stype !== 'collection') return undefined;
      const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
      const data = datasetNamed(doc as never, list.attributes?.source);
      if (!data?.sid || one.index >= data.records.length) return undefined;

      return { sid: data.sid, row: one.index, label: data.label ?? data.name };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, revision]
  );

  /** What the **panel** offers a door to: the row the pointer last landed in. */
  const rowShown = useMemo(() => rowIn(rowAt), [rowIn, rowAt]);

  /** The dataset the main area is drawing, as a node — nothing when it is drawing boards. */
  const datasetAt = useMemo(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !dataset) return undefined;
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const one = datasetsOf(doc as never).find((each) => each.name === dataset);
    return one ? { sid: one.sid!, label: one.label ?? one.name } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, revision, dataset]);
  /**
   * And what the **drawer** is showing, captured when it was opened.
   *
   * Already a dataset and a row rather than a list and a row, because there are two doors into it
   * now and only one of them comes through a list: the table in the main area opens a row of the
   * dataset it is *already* showing, and asking it to name a collection would be asking it to
   * invent one.
   */
  const rowForm = rowOpen;

  /*
   * **The bar, built from the document's widths.** One entry per board, so a width a reader adds
   * arrives with its own entry rather than needing one written into the model — and the same list is
   * what `siteMenuEntry` resolves an id against, so the two cannot disagree about what exists.
   */
  const menus = useMemo(() => siteMenusFor(widths), [widths]);

  /**
   * **What the surfaces are handed** — the editor, or the one a writer gets.
   *
   * One gate rather than a rule each surface remembers: the rail, the ribbon, the panel and the
   * board each build their own `run` from the editor they are given, so a mode enforced surface by
   * surface is a mode that leaks the day somebody adds a fifth.
   */
  const given = useMemo(
    () => (editor && writing ? forWriter(editor) : editor),
    [editor, writing]
  );



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
  const bar = useMemo(
    () =>
      menus.map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: siteMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            disabled: item.command
              /*
                * Asked of the editor the **surfaces** are handed, which is the guarded one in 글
                * 고치기 — a menu that greys nothing is a mode a reader gets out of through the menu.
                */
                ? !given?.canExecuteCommand?.(item.command, payloadFor(item, root, page) as never)
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
                  ? shown.some((one) => one.id === item.view!.slice('frames.'.length))
                  : undefined
          }))
        }))
      })),
    // The selection as well as the content: 복제 is possible or not depending on what is chosen, and
    // `watchContent` does not fire when only the selection moves.
    // `given` rather than `editor`: in 글 고치기 the bar greys what the mode refuses.
    [given, editor, revision, answers, page, preview, shown, writing]
  );

  /**
   * What a pick does — a command, or a change to how the reader is looking.
   *
   * The `view` branch is the one `switch` the model's header promises: a menu entry that is not a
   * command has to mean something to *somebody*, and the app is the only layer that knows how many
   * boards are on screen.
   */
  const runEntry = useCallback(
    (entry: { command?: string; view?: string; payload?: Record<string, unknown>; needs?: string }) => {
      /*
       * **Any width the document declares**, matched by name rather than by three cases: the menu is
       * built from the same list, so a fourth width brings its own entry and this answers it.
       */
      /*
       * **A command a writer may not run is not run**, wherever it was pressed from. The mode has to
       * be enforced where the command is dispatched rather than by hiding controls: a greyed toolbar
       * is a mode a reader gets out of through the menubar, and a hidden menu is one they get out of
       * with a chord.
       */
      if (writing && entry.command && !writerMayRun(entry.command, stypeOf(editor))) return;

      if (entry.view?.startsWith('frames.') && entry.view !== 'frames.all') {
        /*
         * A board a reader turns off, and **not the last one**: a builder showing no boards is a
         * builder showing nothing, and the reader who got there has no board left to press.
         */
        const which = entry.view.slice('frames.'.length) as BreakpointId;
        if (hidden.includes(which)) return setHidden(hidden.filter((one) => one !== which));
        if (widths.length - hidden.length <= 1) return;
        return setHidden([...hidden, which]);
      }
      switch (entry.view) {
        case 'frames.all':
          return setHidden([]);
        case 'preview':
          return setPreview((was) => !was);
        case 'wireframe':
          return setWireframe((was) => !was);
        case 'writing':
          return setWriting((was) => !was);
        case 'rail.components':
          return setPanel('components');
        case 'rail.data':
          return setPanel('data');
        /*
         * The zoom is a **scale on the plane**, not a scroll — see `viewport.ts` for why that
         * distinction cost a reader their top-left corner once already. So these go through the same
         * `setView` every other zoom gesture does, rather than being a second idea of what zoom is.
         */
        /*
         * One ladder, shared with the zoom control's own buttons — `office-ui`'s `zoomIn`/`zoomOut`.
         *
         * These were `round(z * 110) / 100` and `round(z * 90) / 100`, which are **not inverses**:
         * measured with the keyboard, ⌘+ five times and ⌘− five times took 70% to 69%, and every
         * round trip a reader makes drifts a little further. `useViewport` clamps the ends, so the
         * `Math.min`/`Math.max` that used to be here were a second opinion about the limits as well.
         */
        case 'zoom.in':
          return controls.zoomAt(zoomIn(view.zoom));
        case 'zoom.out':
          return controls.zoomAt(zoomOut(view.zoom));
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
      const payload = payloadFor(entry, root, page);

      // Publishing hands back what to write; what a *file* is, is the app's question. See `download`.
      if (entry.command === 'exportPage' || entry.command === 'exportSite') {
        void editor?.executeCommand(entry.command, {
          ...payload,
          write: ({
            pages,
            files
          }: {
            pages: { path: string; file: string; name: string; html: string }[];
            files?: { file: string; text?: string; bytes?: string; type: string }[];
          }) => {
            /**
             * **The whole site as one archive**, and one page as one file.
             *
             * Loose downloads were the shape until two things ended it on the same day: a picture is
             * written to `assets/로고.png`, and a browser cannot be handed a folder; and a link
             * resolves to a page's *address* — `/제품` — so the file has to be `제품/index.html` or
             * every link on the published site is broken. Both need a tree, and a zip is the only
             * shape a browser will take one in.
             *
             * `zipOf` does the arithmetic and this does the only part that needs a browser, which is
             * handing the bytes over — the same line `publish` has always drawn about what a file is.
             */
            if (entry.command === 'exportPage') {
              pages.forEach(download);
              return;
            }

            const site = zipOf([
              ...pages.map((one) => ({ file: one.file, text: one.html })),
              ...(files ?? [])
            ]);
            saveArchive(nameOfSite(pages), site);
          }
        } as never);
        return;
      }

      void editor?.executeCommand(entry.command, payload as never);
    },
    [editor, page, controls, view.zoom, plane, shown]
  );

  /**
   * A pick in the menubar, which is `runEntry` with the entry looked up.
   *
   * Two ways to reach one act, one place that performs it — split when the key map started being
   * read, because a chord and a menu entry differ only in how the reader said it. Two handlers for
   * one act is how ⌘F came to open a pane from the menu and do nothing from the keyboard in the
   * product next door.
   */
  const onMenu = useCallback(
    (id: string) => {
      const entry = siteMenuEntry(id, menus);
      if (entry) runEntry(entry);
    },
    [runEntry]
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
   * And the **wireframe**, which is the third sheet the boards obey and the only one of the three
   * that is about the *tool* rather than about the page.
   *
   * Generated from the document for the half that has to be — a form, a data list and a placed
   * component are all a `div` with children as far as a browser is concerned, so what they are
   * called comes from the model. See `wireframe.ts` for the argument, and for what a browser had to
   * settle about labelling a photograph.
   */
  useEffect(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    if (!store || !root || !wireframe) return;

    const sheet = document.createElement('style');
    sheet.dataset.siteWireframe = 'true';
    /*
     * The document's own widths, because the note a block gets is *which of them it is on* — and a
     * reader who added 와이드 would otherwise read 데스크톱·태블릿만 on a block that is on four.
     */
    sheet.textContent = wireframeCss(store as never, root, widths);
    document.head.append(sheet);
    return () => sheet.remove();
  }, [editor, root, revision, wireframe, widths]);

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
   * **What the site is set in**, on the boards.
   *
   * The type a document states is one rule, and a designer changing their site's face has to see it
   * on the page rather than after publishing — the same argument the state switch and the reveal
   * preview both make. `PAGE_CSS` names the properties and never knows what they are, so this is the
   * only place the document's answer meets the stylesheet.
   *
   * **The document's root, not `root`.** `root` here is the page — or the definition — being drawn,
   * which is what every other effect on this screen wants and is exactly wrong for this one: the
   * type is the *site's*, and a page carries none of it. Read from the page, `typeRule` was handed
   * attributes that never held a `scale` and emitted the defaults for ever, so changing the face or
   * the scale changed the **published** page and nothing a designer could see. Nothing said so:
   * every unit test called `typeRule` with the document's own attributes, and the harness's
   * "is this attribute read" was satisfied by the export reading it. Found by opening a browser and
   * watching the heading not move.
   */
  useEffect(() => {
    const store = editor?.dataStore as { getNode: (sid: string) => any } | undefined;
    const documentRoot = editor?.getRootId?.();
    if (!store || !documentRoot) return;

    const sheet = document.createElement('style');
    sheet.dataset.siteType = 'true';
    sheet.textContent = typeRule(store.getNode(documentRoot)?.attributes);
    document.head.append(sheet);
    return () => sheet.remove();
  }, [editor, revision]);

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
    const elsewhere = (event: KeyboardEvent) => {
      const at = document.activeElement as HTMLElement | null;
      if (!at) return false;
      if (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA') {
        /**
         * **A field keeps the keys it has a meaning for, and no others.**
         *
         * It used to keep them all, and the sentence above is why that read as right: `Delete` in a
         * number box is a digit. But it is only true of **bare** keys. Measured by dragging a
         * padding's handle and pressing ⌘Z: focus was in the panel, so the chord went to the field's
         * own text undo — which for a field that commits on blur has nothing to take back — and the
         * document kept the number. A reader had to click the board first to undo what they had just
         * done in the panel, which is not something any reader would work out.
         *
         * So: the clipboard and select-all stay the field's, because a reader copying digits out of
         * a box means the box. Everything else with ⌘ or Ctrl held is the document's, which is what
         * every tool of this kind does — undo, group, duplicate and save all work from a panel.
         */
        return fieldKeeps(event);
      }
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
      if (elsewhere(event)) return;

      /**
       * **A key that something on top is handling is not the board's.**
       *
       * Found by pressing Escape to close the insert dialog: it closed, *and* the board's Escape ran
       * as well and cleared the selection the reader had just been adding next to. One press, two
       * layers, and the second one undoing the reason for the first.
       *
       * Asked of the **target** rather than of the document, which is a timing fact rather than a
       * style one: the dialog closes itself on the same keydown, in the capture phase, so by the time
       * this listener runs there is no dialog left in the DOM to find. The event's target is a
       * reference taken when it was dispatched, and it still points inside the thing that handled it.
       *
       * Asked of the drawing rather than of a flag, because these layers are drawn by three different
       * components and a flag would be a fourth place to keep the truth. An open dialog and an open
       * menu both say so in the DOM, which is what makes them askable at all.
       */
      const inLayer = (event.target as Element | null)?.closest?.(
        '[role="dialog"], [data-context-menu]'
      );
      if (inLayer) return;

      /*
       * **What the key map says**, rather than what this handler used to remember of it.
       *
       * `SITE_KEYS` had `Delete`, `Backspace` and `⌘D` written into it *and* into the two branches
       * that used to be here — and the harness could only see the list, so it reported two commands
       * as reachable while the handler was the thing that made them so. A browser then found the
       * other end of the same split: the menubar printed eleven chords beside its labels and this
       * handler answered none of them.
       *
       * One list now. It is what the app dispatches on and what the menu prints, so a chord cannot
       * be taught without being bound and cannot be bound without being findable.
       */
      const bound = siteKeyFor(event, mode);
      /*
       * **A key whose command refuses is not this app's to swallow** — and the test is part of
       * *whether the binding applies*, not a branch inside it.
       *
       * Written for `Escape`, which now means *select what holds this* and has to keep meaning
       * *clear the selection* at the top of a page, where there is nothing above the block to go to.
       * The first version asked inside the branch and returned, which returns from the whole handler
       * — so at the outermost block `Escape` did nothing at all rather than falling through to the
       * step below. A browser found it in one press; the shape of the fault is that `return` means
       * two different things one indent apart.
       *
       * Asked of every binding rather than of this one, because it is true of every binding: the app
       * can only honestly claim a chord it is about to act on. `canRun` fills the selection in and is
       * the same answer the menubar greys an entry by, so the key and the entry now agree about being
       * dead as well as about being alive.
       */
      const acts = !!bound && (!bound.command || editor.canRun(bound.command, payloadFor(bound, root, page)));
      if (bound && acts) {
        /*
         * **Who wins when both layers bind the same chord**, which a browser had to settle.
         *
         * The board is a real editor: it resolves its own key map on the element and the event
         * bubbles here afterwards, so a chord both layers answer runs **twice**. The damage was
         * exact — a reader typed in a code block, pressed Escape, pressed ⌘Z, and the engine's undo
         * took the code edit back while this handler took the block itself away.
         *
         * The split is `mode`, and it is the same claim `elsewhere()` makes one line up:
         *
         * - **`select`** is the builder's own. The reader is holding blocks and is not typing by
         *   definition, so this app is right and the engine's `editorFocus` is a lie — the board is
         *   `contenteditable` and holds the focus whether or not anybody is writing. `Delete` and
         *   `⌘A` are both bound on both sides and both must mean the builder's thing here.
         * - **`any`** could be anywhere, so a key the engine has already answered is not this app's
         *   to answer again. `defaultPrevented` is the signal, because the view sets it the moment a
         *   binding resolves.
         */
        if (bound.mode === 'any' && event.defaultPrevented) return;
        // A binding that acts on a selection means nothing without one — the same rule a greyed
        // menu entry follows, kept here so the key and the entry agree about when they are dead.
        if (bound.needsSelection && (selectedNodeIds(editor.selection) ?? []).length === 0) return;
        event.preventDefault();
        runEntry(bound);
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

      /*
       * **Let go of everything** — which is all this handler still has to do about `Escape`.
       *
       * It used to walk the **scope** up a level and select what it left, which was this app's whole
       * answer to *go out*. It is not any more: `selectParent` climbs the selection, from a selection
       * made any way at all, and reaching here at all means that command declined — there is nothing
       * above the chosen block, so the reader is at the top of the page.
       *
       * Two mechanisms answering one key is what the browser found: after climbing out with the
       * command, the leftover scope from the drill made the next press *re-select the scope* instead
       * of clearing, so `Escape` stuck one level short of nothing. The scope goes back to the page
       * for the same reason the selection does — a reader who has let go of the block has let go of
       * being inside it, and a click after that should mean the outermost block again.
       */
      setScope(undefined);
      select([]);
    };

    document.addEventListener('keydown', leave);
    return () => document.removeEventListener('keydown', leave);
    // `runEntry` is in here because the key map dispatches through it — see the handler.
  }, [editor, mode, entered, scope, scopeRoot, preview, runEntry]);

  /**
   * **A press outside what is being edited leaves the text**, and selects what was pressed.
   *
   * ## What this was reported as
   *
   * Two things, and they are one thing: *"편집 커서가 있어서 selection 된 대상이 바뀌지 않음"* and
   * *"모바일에서 내가 원하는 편집요소를 클릭 할 수 없음 — 계속 엉뚱한 데 텍스트 커서가 들어가서."*
   *
   * The mode is the **app's**, which is right — there is one reader and one caret — but the overlay
   * that owns the pointer switches itself off in `text`, on **all three boards at once**. So the
   * moment a reader double-clicked a heading on the desktop board, every board became a plain
   * `contenteditable`: a press anywhere on any of them could only put a caret, the block selection
   * could not be changed at all, and the way out was `Escape` — which a reader has no reason to know.
   *
   * ## What every tool of this kind does instead
   *
   * Editing text is scoped to **one object**. A press inside it moves the caret; a press outside it
   * ends the editing and selects whatever was pressed. Figma, Framer and Webflow are identical here,
   * and it is what makes editing text a state a reader is *in* rather than a mode they are stuck in.
   *
   * Caught on `pointerdown` in the **capture** phase, because the caret is placed by the default
   * action and the only way to not place one is to get there first. And only over the plane: a press
   * in the rail, the panel or a menu belongs to that surface.
   */
  useEffect(() => {
    if (!editor) return;

    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const frame = target.closest('.st-frame');
      // The chrome is not the document: a press in a field while editing belongs to that field.
      if (!frame && !target.closest('.st-canvas')) return;

      /*
       * **In select mode, only the grey.** The overlay owns every press on a board and already
       * decides what one means there; what it does not cover is the plane around the boards, so a
       * reader who wanted to let go of a selection had to press Escape — a key they have no reason
       * to know, for the gesture every tool of this kind answers with a click on nothing.
       *
       * Measured and left for two rounds, which is the reason it is written here rather than in the
       * backlog: it was one condition away the whole time.
       */
      if (mode !== 'text') {
        if (frame) return;
        void editor.executeCommand('setNode', { nodeIds: [] });
        return;
      }

      /*
       * Inside the block being edited: an ordinary caret move, which is the whole of what text mode
       * is for. `data-bc-sid` is on the drawn element and a run inside it answers `closest` — and
       * the same block is drawn on three boards, so this is true on whichever one the reader is on.
       */
      if (entered && target.closest(`[data-bc-sid="${CSS.escape(entered)}"]`)) return;

      event.preventDefault();
      event.stopPropagation();
      setMode('select');
      setEntered(undefined);

      // `dataStore` is a public getter; the cast beside it two effects up is one this file still owes.
      const doc = { getNode: (sid: string) => editor.dataStore?.getNode(sid) };
      const board = frame?.querySelector<HTMLElement>('.st-frame-host');
      const hit = board ? drawnSidAtElement(target, board) : undefined;
      /*
       * The **outermost** block, which is what a plain press means everywhere else in this product.
       * A press on the grey around the boards selects nothing, which is what pressing nothing has
       * always meant here.
       */
      const block = hit ? outermostOf(doc as never, hit, scopeRoot) : undefined;
      void editor.executeCommand('setNode', { nodeIds: block ? [block] : [] });
    };

    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [mode, entered, editor, scopeRoot]);

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

  /**
   * **And again when the boards become something else** — which is what entering a component is.
   *
   * Reported as *컴포넌트 편집 모드로 가게 되면 viewport 를 컴포넌트 편집 할 수 있는 곳으로 바로
   * 이동해줘야지. viewport 가 안 움직여서 엄청 헷갈렸잖아.* — and it is the whole of the confusion: a
   * definition's part is a card, not a page, so the boards shrink from 5000 pixels tall to 200 while
   * the plane stays exactly where the reader had scrolled a page to. They are looking at empty studio
   * with their component somewhere off screen, and nothing on the way in said so.
   *
   * The same fit the opening view uses, and deliberately not `settled` — that ref exists so a reader
   * who has moved the view is not moved back, and this is not that: the thing they had moved to is
   * **gone**. Keyed on what the boards are drawing, so it runs on the way in and on the way out.
   */
  const looking = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (plane.width <= 0) return;
    /*
     * **Only on a change**, which means the first pass has to be remembered rather than acted on.
     * Written the other way round first and it fitted on load as well — a second fit racing the
     * opening one, computed against a plane that had not settled, which moved every board a few
     * pixels down. Two browser checks that press a 10-pixel strip at the bottom of the window failed
     * with `elementFromPoint` returning nothing at all: the strip had been pushed off screen.
     */
    if (looking.current === undefined) {
      looking.current = root;
      return;
    }
    if (looking.current === root) return;
    looking.current = root;
    const board = pane.current?.querySelector('.st-frame') as HTMLElement | null;
    if (!board) return;
    controls.fitTo(
      { width: board.offsetWidth + 128, height: plane.height },
      { padding: 40, only: 'width' }
    );
    // `root` is the boards' subject — a page, or the part of a component being edited.
  }, [controls, plane, root]);

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
            menus={bar}
            onPick={onMenu}
          />

          {/*
            **The tools, on the same row as the menu.**

            They were a second row, and counted: six buttons across 1600 pixels, four of them greyed
            with nothing selected. A full-width strip is what a *ribbon* is — Word's carries 69
            controls and needs the width — and this is not one: it is a mode switch and four things
            you can do to what is held, which is Figma's toolbar and belongs where Figma's is.

            42 pixels of canvas back, and the row that is left says what every design tool's top row
            says: who you are, what the document can do, what the pointer is, and how you are looking.
          */}
          {editor ? (
            <Ribbon
              editor={given ?? editor}
              mode={mode}
              onMode={setMode}
              pageId={root}
              adding={adding}
              /* The place goes with the dialog: closing it forgets where the plus pointed. */
              onAdding={(open) => {
                setAdding(open);
                if (!open) setAddAt(null);
              }}
              place={addAt}
            />
          ) : null}

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
          {/*
            **관리로** — the way out, on all three things a reader can be *in*. The admin is the
            outside, so leaving what you opened is one gesture rather than three different ones.
          */}
          {admin ? null : (
            <button
              type="button"
              className="st-back st-to-admin"
              onClick={() => setAdmin('pages')}
              data-to-admin="true"
            >
              <Icon name="back" size={13} />
              관리로
            </button>
          )}
          {datasetAt ? (
            <span className="st-where" data-where data-editing-dataset={dataset}>
              <button
                type="button"
                className="st-back"
                data-to-page="true"
                onClick={() => setDataset(undefined)}
              >
                <Icon name="back" size={13} />
                페이지로
              </button>
              <span className="st-where-name">{datasetAt.label}</span>
              <span className="st-where-path">데이터</span>
            </span>
          ) : definition ? (
            <span className="st-where" data-where data-editing-component={definition.id}>
              {/*
                **페이지로**, which is not 관리로 — they are two different acts and were one class.
                Leaving a definition puts a reader back on the page that placed it; leaving the
                builder puts them back outside. A check pressing `.st-back` found two and refused,
                correctly.
              */}
              <button
                type="button"
                className="st-back"
                data-to-page="true"
                onClick={() => setEditing(undefined)}
              >
                <Icon name="back" size={13} />
                페이지로
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
            {/*
              **와이어프레임 beside 미리보기**, because they are the same kind of thing said two ways:
              what a visitor gets, and what a visitor is being asked to look at. Asked for as *와이어
              프레임 모드도 toolbar 에 있어도 좋겠고* — and this is where it belongs rather than on the
              block strip, which acts on **what is selected**. A view acts on the reader.

              An icon rather than a word, because the strip is short and the two of them side by side
              as words would read as a pair of choices about the document.
            */}
            {/*
              **글 고치기**, beside the other two views — all three change what the reader is doing
              rather than what the site says. A mode and not a permission, which the tooltip says out
              loud: there are no accounts here, so what this buys is *stopping the accidents*, which
              is most of the damage a writer does to a layout.
            */}
            <IconButton
              label={writing ? '모든 편집으로 돌아갑니다' : '글만 고칩니다 — 배치는 잠깁니다'}
              /* `IconButton` passes arbitrary attributes through `data`, not as loose props. */
              data={{ 'writing-toggle': writing ? 'true' : undefined }}
              pressed={writing}
              onClick={() => setWriting((one) => !one)}
            >
              <Icon name="paragraph" />
            </IconButton>
            <IconButton
              label={wireframe ? '색을 되돌립니다' : '색을 빼고 구조만 봅니다'}
              data={{ 'wireframe-toggle': wireframe ? 'true' : undefined }}
              pressed={wireframe}
              onClick={() => setWireframe((one) => !one)}
            >
              <Icon name="outline" />
            </IconButton>
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
      </AppChrome>

      <AppBody className="st-body">
        {/*
          One rail, several panels — 추가, 구성, 페이지, 컴포넌트, 데이터.

          It was a layer list and nothing else, and the question that found the gap was the plainest
          one a reader can ask: *where do I add a heading?* Nowhere.
        */}
        {editor && !admin ? (
          <Rail
            editor={given ?? editor}
            panel={panel}
            onPanel={setPanel}
            page={scopeRoot}
            insertRoot={root}
            pages={pages}
            editing={editing}
            onEdit={setEditing}
            onOpenDataset={openDataset}
            onPage={(sid) => {
              setCurrent(sid);
              setScope(undefined);
              // Leaving the definition, because a page is what the reader asked for.
              setEditing(undefined);
            }}
          />
        ) : null}

        <AppMain className="st-main">
          {/*
            **관리** — the surface a reader opens into, filling the same regions with a different
            answer: the left is the five things a site is made of, the middle is a table, and there
            is no right, because a properties panel is about a block and there are no blocks here.
          */}
          {editor && admin ? (
            <Admin
              editor={editor}
              revision={revision}
              run={(name, payload) => void (editor as never as { executeCommand: (n: string, p?: unknown) => void }).executeCommand(name, payload)}
              can={(name, payload) =>
                (editor as never as { canExecuteCommand: (n: string, p?: unknown) => boolean }).canExecuteCommand(name, payload)
              }
              tab={admin}
              onTab={setAdmin}
              onOpenPage={(sid) => {
                setCurrent(sid);
                setScope(undefined);
                setEditing(undefined);
                setDataset(undefined);
                setAdmin(undefined);
              }}
              onOpenDefinition={openDefinition}
              onOpenDataset={openDataset}
            />
          ) : (
          <>
          {/*
            **The third thing this area can show.** A page, a definition's part, or a dataset —
            and the mechanism is the same one in all three cases: what the main area draws is what
            the reader last asked for, and nothing else in the window changes.
          */}
          {datasetAt ? (
            <DataTable
              editor={editor!}
              run={(name, payload) => void (editor as never as { executeCommand: (n: string, p?: unknown) => void }).executeCommand(name, payload)}
              can={(name, payload) =>
                (editor as never as { canExecuteCommand: (n: string, p?: unknown) => boolean }).canExecuteCommand(
                  name,
                  payload
                )
              }
              revision={revision}
              sid={datasetAt.sid}
              onClose={() => setDataset(undefined)}
              onOpenRow={(one) => setRowOpen({ sid: datasetAt.sid, row: one, label: datasetAt.label })}
            />
          ) : (
          <Canvas
            paneRef={pane}
            view={view}
            onView={setView}
            controls={controls}
            onMeasure={measure}
            /**
             * **A picture dragged onto the page**, which is how anybody who has used a builder puts
             * one there — and which did nothing at all until now: `ReorderExtension` registers one
             * command about reordering blocks and listens for no drop, so a file dropped on the
             * boards was the browser navigating away from the editor.
             *
             * Where it lands is what was dropped **on**. A picture takes the file, which is how a
             * reader replaces one; anything else gets a new picture after it. Both go through the
             * panel's own `addPicture`, so a dropped file is read, sized, named and put in the assets
             * box exactly the way a chosen one is — one errand, one implementation.
             */
            onFiles={(files, at) => {
              const editor = instance?.editor;
              if (!editor) return;
              const under = document
                .elementsFromPoint(at.x, at.y)
                .find((one) => one.hasAttribute('data-bc-sid'));
              const sid = under?.getAttribute('data-bc-sid')?.split('~').pop();
              const node = sid ? editor.dataStore?.getNode(sid) : undefined;

              void (async () => {
                for (const file of files) {
                  if (node?.stype === 'picture') {
                    await addPicture(editor, file, [sid!]);
                    continue;
                  }
                  /*
                   * A new picture **after what it was dropped on**, which is the same place every
                   * other insert here puts a block — and then the file goes into it. Selecting it
                   * first is what tells the insert where; it is also what leaves the reader holding
                   * the thing they just made.
                   */
                  if (sid) await editor.executeCommand('setNode', { nodeIds: [sid] });
                  await editor.executeCommand('insertPicture', {});
                  const made = selectedNodeIds(editor.selection as never)[0];
                  if (made) await addPicture(editor, file, [made]);
                }
              })();
            }}
          >
            {instance
              ? shown.map((one) => (
                  <PageFrame
                    key={one.id}
                    editor={instance.editor}
                    breakpoint={one.id}
                    label={definition ? `${definition.name} · ${one.label}` : one.label}
                    width={one.width}
                    page={root}
                    scopeRoot={scopeRoot}
                    redraw={redraw}
                    /**
                     * **A writer is in text**, always — which is the mode rather than a default.
                     *
                     * `select` is the mode the board's own gestures live in: the handles, the
                     * padding bands, the marquee, the plus. A writer has none of them, so putting
                     * them in `select` and then hiding each one would be four places to forget. The
                     * mode they are already in is the one where a press puts a caret.
                     */
                    mode={writing ? 'text' : mode}
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
                    onRow={setRowAt}
                    onEditRow={(one) => setRowOpen(rowIn(one))}
                    onEditCode={openCode}
                    preview={preview}
                    wireframe={wireframe}
                    widths={widths}
                    onAdd={(place) => {
                      setAddAt(place);
                      setAdding(true);
                    }}
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
          )}

          </>
          )}

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

        {/*
          The toolbar that follows the chosen words — see `text-surface.tsx`.

          Four layers had to exist for this to be four lines: a declaration, a command and its state,
          a themed component in `office-ui`, and *where the selection is on screen*. The last was
          reachable only from inside the decorator system until today, which is why the two floating
          surfaces this suite had were built in a **model** package, drawing their own DOM, and
          installed by nobody.
        */}
        {editor ? <TextSurface editor={editor} mode={mode} /> : null}

        {/* And the `/` menu at the caret — the second one, and it is a list. */}
        {editor ? <SlashSurface editor={editor} mode={mode} /> : null}

        {/*
          **No properties panel in the admin.** A panel is about a block, and the admin has none:
          what it holds is pages, datasets, definitions, publishes and files, each of which is a row
          in a table with its own columns. A panel drawn beside it would be six hundred pixels saying
          *아무것도 선택되지 않았습니다*.
        */}
        {editor && !admin ? (
          <Inspector
            editor={given ?? editor}
            writing={writing}
            at={at}
            onAt={setAt}
            state={state}
            onState={setState}
            page={definition ? undefined : page}
            /*
             * Where the 쓰임 tab's rows go. A list of the pages a variable is on that a reader cannot
             * click is half an answer — the question is *what am I about to change*, and the way to
             * find out is to go and look.
             */
            onPage={(sid) => {
              setCurrent(sid);
              setScope(undefined);
              setEditing(undefined);
            }}
            onEditComponent={openDefinition}
            /*
             * **And the row of data this block is drawn from**, when it is drawn from one.
             *
             * Reported as *페이지에서 Drawer 를 어떻게 열어서 편집해야 할지 모르겠어* — the form existed
             * and the only door was the grid's row number, which is behind a dialog opened from the
             * rail. The panel is where a reader already goes to change what they have selected, so
             * that is where the door belongs.
             */
            row={rowShown}
            onEditRow={() => setRowOpen(rowShown)}
          />
        ) : null}

        {/*
          **한 행을, 폼으로** — opened from the page rather than only from the grid.

          The drawer sits beside the board on purpose: the card being edited stays visible, so a
          summary being typed is a summary the reader watches land in it. That is the whole reason it
          is not a second dialog.
        */}
        {editor && rowForm ? (
          <RowForm
            editor={editor}
            run={(name, payload) => void (editor as never as { executeCommand: (n: string, p?: unknown) => void }).executeCommand(name, payload)}
            revision={revision}
            at={{ sid: rowForm.sid, row: rowForm.row }}
            onClose={() => setRowOpen(undefined)}
          />
        ) : null}
      </AppBody>
    </AppShell>
  );
}
