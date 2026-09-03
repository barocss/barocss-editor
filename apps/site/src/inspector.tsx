import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { isVarRef, varNameOf, varRef, varRefAt, varWeightOf } from '@barocss/office-canvas';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  Icon,
  Button,
  PropertyChoice,
  PropertyNumber,
  PropertyEmpty,
  PropertyGroup,
  PropertyLink,
  onApple,
  PropertyPanel,
  PropertySheet,
  PropertyTabs,
  TextField,
  Dialog,
  DialogButton,
  useRevision,
  type ThemeSwatch
} from '@barocss/office-ui';
import {
  ASSET_PREFIX,
  assetsOf,
  RENDITIONS,
  BASE_BREAKPOINT,
  BREAKPOINTS,
  widthsOf,
  DEVICES,
  deviceMatches,
  iconForWidth,
  writerMaySet,
  type SiteWidth,
  FIELD_PREFIX,
  fieldNameOf,
  stateableIn,
  STATES,
  attrsInState,
  blocksIn,
  boundVarOf,
  definitionAt,
  definitionOf,
  definitionsOf,
  holderOf,
  kindOfBlock,
  SITE_KEYS,
  VALUE_FORMATS,
  enclosing,
  isAssetRef,
  labelOfBlock,
  overriddenAt,
  pageOf,
  pagesOf,
  servicesOf,
  SITE_PANEL,
  sitePanelGroups,
  statedIn,
  namesIn,
  statesOf,
  templateOf,
  whereUsed,
  PAGE_PREFIX,
  addressFor,
  type BreakpointId,
  type SitePanelRow,
  type SitePanelTab,
  type StateId,
  columnNames,
  fieldsFrom
} from '@barocss/office-site';
import { chordFor, keyLabel } from '@barocss/office-controls';

/** 15 twips to the CSS pixel: the document keeps twips and a reader is shown pixels. */
const PX = 15;

/**
 * **Reading a file off the reader's machine**, which is the app's job and nobody else's.
 *
 * The model package runs in a test with no `FileReader` in it, which is the same line publishing
 * draws about *writing* one: a package that reached for a browser API to add a picture would be a
 * package that only runs in a browser.
 *
 * What crosses into the document is base64, a media type, and **the file's own width and height** —
 * the last of which is the reason this waits for the image to decode rather than committing as soon
 * as the bytes are read. An `<img>` with no intrinsic size is a hole of zero height until it loads,
 * so every word under it jumps down when it arrives, and a builder that stores only a URL cannot fix
 * that because it has never seen the file.
 *
 * One command and one undo: the picture is pointed at the new file in the same gesture that adds it,
 * because a reader who chose a file has not asked for a document with a file in it.
 */
/**
 * Exported because a **drop** needs it too.
 *
 * Reading a file, sizing it, putting it in the assets box and pointing something at it is one errand
 * whichever gesture starts it — the panel's 파일 고르기 or a picture dragged onto the board. Two
 * copies of it would be two places that decide what `image/png` means and how a name is made.
 */
export async function addPicture(
  editor: Editor,
  file: File,
  ids: string[],
  /** Which command points at it afterwards — a block's `src`, or the site's tab picture. */
  command = 'setBlockFormat',
  attr = 'src'
): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    // `readAsDataURL` rather than `readAsArrayBuffer` plus a manual encode: the browser's base64 is
    // the one that is right about padding, and the prefix is a `split` away.
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
  if (!data) return;

  const decoded = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    // A file the browser cannot decode still becomes an asset — an SVG it dislikes, a format it does
    // not know — because a picture a reader can see is worth more than a size a layout would like.
    image.onerror = () => resolve(undefined);
    image.onload = () => resolve(image);
    image.src = `data:${file.type};base64,${data}`;
  });
  const size = decoded ? { width: decoded.naturalWidth, height: decoded.naturalHeight } : {};

  /**
   * And **the same picture, smaller** — the renditions a browser chooses from.
   *
   * The single largest cost of a page anybody builds with a tool like this is a photograph taken at
   * 4000 pixels and sent, whole, to a phone that is 390 wide. It is most of what such a page weighs,
   * and no amount of CSS makes the download shorter.
   *
   * Made **here**, because resizing needs a canvas and a canvas is a browser's — the same line this
   * file already draws about reading the file at all. A width the file is already narrower than is
   * skipped: making a picture bigger is a larger download of a blurrier image, which is the one thing
   * worse than sending the original.
   *
   * **An SVG is left alone**, and that is not an oversight: it is already every size at once, and a
   * canvas would turn a few kilobytes of vector into a large picture of it.
   */
  const sizes: { width: number; data: string }[] = [];
  if (decoded && file.type !== 'image/svg+xml') {
    for (const width of RENDITIONS) {
      /*
       * **Meaningfully smaller, or not at all.** A 2000-wide file makes a 1920 rendition that is four
       * per cent narrower: another file in the folder, another entry in the `srcset`, and a download
       * a visitor will not notice. Measured, in the browser, on the first picture this was tried on.
       *
       * Four fifths is the line — a rendition earns its place when it is at most 80% of the original.
       */
      if (decoded.naturalWidth * 0.8 < width) continue;
      const height = Math.round((decoded.naturalHeight * width) / decoded.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) break;
      context.drawImage(decoded, 0, 0, width, height);
      /*
       * Kept in the file's own format — a PNG stays a PNG. Re-encoding a photograph as JPEG would be
       * smaller and would also be this product deciding, silently, that a reader's transparent PNG no
       * longer has a transparent background.
       */
      const said = canvas.toDataURL(file.type).split(',')[1];
      if (said) sizes.push({ width, data: said });
    }
  }

  const before = new Set(
    assetsOf({
      rootId: editor.getRootId?.() ?? '',
      getNode: (sid: string) => editor.dataStore?.getNode(sid)
    } as never).map((one) => one.name)
  );

  await editor.executeCommand('insertAsset', {
    label: file.name,
    type: file.type || 'image/png',
    data,
    ...size,
    ...(sizes.length > 0 ? { sizes } : {})
  });

  const added = assetsOf({
    rootId: editor.getRootId?.() ?? '',
    getNode: (sid: string) => editor.dataStore?.getNode(sid)
  } as never).find((one) => !before.has(one.name));
  if (added) {
    await editor.executeCommand(command, {
      nodeIds: ids,
      [attr]: `${ASSET_PREFIX}${added.name}`
    });
  }
}

/**
 * What the selected blocks are, and everything a reader can change about them.
 *
 * ## It is drawn from a declaration, and that is the whole design
 *
 * This file used to *be* the panel: thirty-one rows written out in JSX, each one a control and a
 * label and a command. It looked fine and it was the last place in the product the conformance
 * harness could not see. `toolbar-model.ts` says why a ribbon cannot declare its own commands in
 * JSX — *"a declaration nothing can read"* — and the site's own conformance test admitted the same
 * about this file in as many words, then exempted eleven commands with sentences describing rows.
 *
 * So the rows moved to `panel-model.ts` and this maps over them, the way `ribbon.tsx` maps over
 * `siteControlsIn()`. Two things fall out, and the second is the one worth the rewrite:
 *
 * - the harness can ask what the panel offers instead of being told;
 * - **the declaration cannot drift**, because there is nothing to drift *from*. A model this file
 *   merely agreed with would have been one more claim to go and check.
 *
 * What stays here is everything that needs React or the document: which control draws which kind,
 * what the site's colours are, which datasets exist, and what a placement's definition asks.
 *
 * ## Two things it says that a document's panel does not
 *
 * **Which width it is talking about.** Every value is resolved for the width being edited and every
 * value this width *overrides* is marked, because the commonest complaint about responsive builders
 * is that a reader changes something and cannot tell whether it applied everywhere.
 *
 * **What a colour is following.** A site's `fill` may hold `var:강조` rather than a hex — a design
 * token — and `ColorField` is the deck's own control for exactly that distinction: two blocks the
 * same blue are a coincidence, two blocks on `var:강조` are a decision.
 */
export function Inspector({
  editor,
  at,
  onAt,
  writing,
  state,
  onState,
  page,
  onPage,
  onEditComponent,
  row,
  onEditRow
}: {
  editor: Editor;
  /** The width being edited. The widest is the page itself; the others say only what differs. */
  at: BreakpointId;
  onAt: (at: BreakpointId) => void;
  /** Whether the reader is in 글 고치기, where only the words are theirs — see `writing.ts`. */
  writing?: boolean;
  /**
   * The state being edited, held by the **app** rather than here.
   *
   * Because opening one changes what the *boards* draw, not only what this panel shows: the tool's
   * own layer covers the page, so a page's `:hover` never fires under a reader's pointer and a
   * designer editing a hover would be editing something they cannot see. The app draws the selected
   * blocks in the state the panel has opened, which is what every tool of this kind does.
   */
  state?: StateId;
  onState: (state: StateId | undefined) => void;
  /** The page on screen, so the panel has something to say when nothing is selected. */
  page?: string;
  /** Going to a page, and opening a definition — what the 쓰임 tab's rows do when pressed. */
  onPage?: (sid: string) => void;
  onEditComponent?: (componentId: string) => void;
  /**
   * **The row of data the selected block is drawn from**, when it is drawn from one.
   *
   * Handed in rather than looked up, because it cannot be looked up here: a row's number lives only
   * in the **drawing** (`${collection}~${index}`) and the selection carries document ids, which for
   * every row of a list is the same collection. The board reads it at the moment of the press.
   */
  row?: { sid: string; row: number; label: string };
  /** Open that row as a form — see `RowForm`. */
  onEditRow?: () => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const [tab, setTab] = useState<SitePanelTab>('block');
  /**
   * **Which sections of the panel are put away.**
   *
   * The panel measured **959 pixels** in five open sections, so a reader who wanted a shadow scrolled
   * past a whole arrangement and a whole size to reach it. Every inspector in this class folds and
   * this one had no way to.
   *
   * Kept here rather than in the document, and it is the same argument the row preview makes: which
   * sections a person has put away is a fact about *this reader, this minute* — the same kind of
   * fact as which width they are editing — and a document that carried it would hand the next person
   * a panel with three sections mysteriously shut.
   *
   * By **label**, so 그림자 stays folded as the selection moves from a card to a section. A fold is
   * about the kind of thing a reader is not currently interested in, and re-opening it on every
   * click would be the panel forgetting on their behalf.
   */
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  /**
   * What the reader is looking for in the panel, and it is **cleared when the tab changes**.
   *
   * A filter carried from one tab to another is a panel that looks empty for a reason nothing on
   * screen explains — the box is at the top of a list that no longer has anything in it.
   */
  const [find, setFind] = useState('');


  const store = editor.dataStore;
  const node = (sid: string | undefined) => (sid ? store?.getNode(sid) : undefined);
  /** What the document's schema says a node type has — see `Groups`. */
  const schema = (store as never as { getActiveSchema?: () => any })?.getActiveSchema?.();

  /**
   * **The words**, when a range is what is selected — the other thing a reader can hold.
   *
   * `shown` answers about *nodes*, and a range selects none, so the panel fell through to its "page,
   * because nothing is selected" branch: it showed the page's background and shadow under a sentence
   * asking the reader to select a block, at the moment they had selected the most specific thing in
   * the document.
   *
   * Read from the **start** of the range, which is the same simplification `shown` makes about a
   * multiple selection and has the same answer: what a mixed range should show per field is a slice
   * of its own, and what matters first is that selecting words and typing a size changes them.
   */
  const words = useMemo(() => {
    const selection = editor.selection as
      | { type?: string; collapsed?: boolean; startNodeId?: string }
      | undefined;
    if (!selection || selection.type !== 'range' || selection.collapsed) return null;
    const at = selection.startNodeId ? store?.getNode(selection.startNodeId) : undefined;
    if (!at) return null;

    // Marks carry their values in `attributes`; a run with none is a run that says nothing.
    const marks = ((at as Record<string, any>).marks ?? []) as Record<string, any>[];
    const valueOf = (type: string, key: string) =>
      marks.find((mark) => mark?.type === type)?.attributes?.[key];

    /*
     * A whole `Shown`, not a partial one dressed as one.
     *
     * The first version passed `{ attrs }` with `as never` on it, and the panel drew **nothing at
     * all** — a white window, every board gone. `PropertySheet` asks `shown.overridden.has(...)` for
     * every row, and an undefined `Set` throws during render, which React answers by unmounting the
     * tree. `as never` is what let that compile: a cast is a promise, and this one was false.
     */
    return {
      // A range selects no nodes, which is the whole reason this branch exists.
      ids: [],
      count: 1,
      stype: 'inline-text',
      label: '글자',
      /** `size` and `color` are what the commands take; the row names the **mark**. */
      attrs: {
        fontSize: valueOf('fontSize', 'size'),
        fontColor: valueOf('fontColor', 'color')
      } as Record<string, any>,
      // A mark colour can follow a token, so raw and resolved are the same read here.
      raw: {
        fontSize: valueOf('fontSize', 'size'),
        fontColor: valueOf('fontColor', 'color')
      } as Record<string, any>,
      // Nothing here is overridden at a width: a mark is on the run, and a run has one of it.
      overridden: new Set<string>(),
      values: [] as { sid: string; name: string; value: string }[]
    };
    // The revision is what makes this re-read after a mark is applied.
  }, [editor, revision, store]);

  const shown = useMemo(() => {
    const ids = selectedNodeIds(editor.selection) ?? [];
    const nodes = ids.map((sid) => store?.getNode(sid)).filter(Boolean);
    if (nodes.length === 0) return null;

    const doc = { getNode: (sid: string) => store?.getNode(sid) };
    /*
     * The first of them decides what is shown, and every change is applied to all of them. A mixed
     * state per field is what a mature inspector has and is a slice of its own; what matters first
     * is that selecting three cards and typing one number changes three cards.
     */
    const first = nodes[0] as Record<string, any>;
    const rootId = editor.getRootId?.();
    return {
      ids,
      count: nodes.length,
      stype: String(first.stype),
      label: labelOfBlock(doc, ids[0]),
      /**
       * **What holds it**, so the panel can say where a decision that is not here is made.
       *
       * The first of the selection, like every other field: two cards in a row have one parent
       * between them, and a panel that showed *3개 선택됨* above a single parent name is saying
       * something true. Undefined at the top of a page, which is where the row disappears rather
       * than greying — there is nothing above it and a disabled control invites a press.
       */
      holder: (() => {
        const page = pageOf(doc, ids[0]);
        const up = page ? enclosing(doc, ids[0], page) : undefined;
        return up ? { sid: up, label: labelOfBlock(doc, up) } : undefined;
      })(),
      /** Resolved for the width **and the state** being edited — what the reader is looking at. */
      attrs: attrsInState(first.attributes ?? {}, at, state),
      /**
       * And unresolved, because a colour that *follows a token* must not be shown as a hex.
       *
       * The state's own statements over the node's, for the same reason: a hover that follows
       * `var:강조진함` has to show the token, not the green it currently resolves to.
       */
      raw: {
        ...((first.attributes ?? {}) as Record<string, any>),
        ...(state ? (statesOf(first.attributes ?? {})[state] ?? {}) : {})
      },
      /*
       * What is marked. In a state that is what the state changes; at rest it is what this width
       * changes. One mark, two questions, and in both of them it means *the value in front of you is
       * not the page's own*.
       */
      overridden: new Set(
        state ? statedIn(first.attributes ?? {}, state) : overriddenAt(first.attributes ?? {}, at)
      ),
      /**
       * And, for a **list**, the card's questions and where each one currently comes from.
       *
       * Read here rather than in the declaration because both halves are facts about the document:
       * which definition the list's template places, and which of its variables that template has
       * already answered. The answers live on the template — which nothing selects, and which is why
       * this was unreachable before there was a row for it.
       */
      card:
        first.stype === 'collection'
          ? (() => {
              const doc = { rootId: rootId ?? '', getNode: (sid: string) => store?.getNode(sid) };
              const template = templateOf(doc as never, first as never);
              const definition = definitionOf(
                doc as never,
                (template?.attributes as Record<string, unknown> | undefined)?.componentId
              );
              if (!template || !definition) return undefined;

              const answered = new Map<string, string>();
              for (const sid of (template.content ?? []) as unknown[]) {
                if (typeof sid !== 'string') continue;
                const child = store?.getNode(sid);
                if (child?.stype === 'componentValue') {
                  answered.set(String(child.attributes?.name), String(child.attributes?.value ?? ''));
                }
              }
              return {
                template: String(template.sid),
                name: definition.name,
                asks: definition.asks.map((one) => ({ name: one, value: answered.get(one) ?? '' }))
              };
            })()
          : undefined,
      /** And, for a part of a card, which of the card's questions its words come from. */
      part: (() => {
        const doc = { rootId: rootId ?? '', getNode: (sid: string) => store?.getNode(sid) };
        const inside = definitionAt(doc as never, String(first.sid));
        if (!inside) return undefined;
        const bound = boundVarOf(
          { getNode: (sid: string) => store?.getNode(sid) } as never,
          String(first.sid)
        );
        /*
         * And **what the variable it is bound to actually declares** — the kind and the format.
         *
         * Read here rather than in the row, because it is a fact about the document: the declaration
         * lives on the definition, and the part only names it. Without it the two rows about how a
         * value reads would be drawing whatever they were last told rather than what is written.
         */
        const declared = ((store?.getNode(inside.sid)?.content ?? []) as unknown[])
          .filter((sid): sid is string => typeof sid === 'string')
          .map((sid) => store?.getNode(sid))
          .find((one: any) => one?.stype === 'componentVar' && one.attributes?.name === bound);

        return {
          asks: inside.asks,
          uses: inside.uses,
          bound,
          kind: String((declared?.attributes as any)?.kind ?? 'text'),
          format: String((declared?.attributes as any)?.format ?? '')
        };
      })(),
      values: ((first.content ?? []) as unknown[])
        .filter((sid): sid is string => typeof sid === 'string')
        .map((sid) => store?.getNode(sid))
        .filter((child: any) => child?.stype === 'componentValue')
        .map((child: any) => ({
          sid: String(child.sid),
          name: String(child.attributes?.name),
          value: String(child.attributes?.value ?? '')
        }))
    };
  }, [editor, at, state, revision, store]);

  /**
   * The site's own colours, offered as swatches.
   *
   * The deck offers a theme's twelve slots; a site offers what its author named — the same control
   * and a different list. Choosing one writes `var:강조`, a reference rather than a colour, so
   * changing the token later changes every block that follows it.
   */
  const tokens = useMemo((): ThemeSwatch[] => {
    const rootId = editor.getRootId();
    const root = rootId ? store?.getNode(rootId) : undefined;
    const holder = ((root?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .find((child: any) => child?.stype === 'variables');

    return ((holder?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .filter((one: any) => one?.stype === 'variable' && one?.attributes?.kind === 'color')
      .map((one: any) => ({
        value: `var:${one.attributes.name}`,
        colour: String(one.attributes.value ?? '#000000'),
        label: String(one.attributes.label ?? one.attributes.name)
      }));
  }, [editor, revision, store]);

  /**
   * The datasets this document holds, and the columns of the one a list is drawing.
   *
   * Two of the panel's control kinds are lists only the document can supply — which is why they are
   * kinds rather than `options` in the declaration. A reader **picks** a column rather than typing
   * one, and that is the reason `dataset.fields` is declared rather than inferred from the first
   * row: a panel has to offer the fields before there is a row on screen.
   */
  const data = useMemo(() => {
    const rootId = editor.getRootId();
    const root = rootId ? store?.getNode(rootId) : undefined;
    const resources = ((root?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .find((child: any) => child?.stype === 'resources');

    const datasets = ((resources?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .filter((one: any) => one?.stype === 'dataset')
      .map((one: any) => ({
        name: String(one.attributes.name),
        label: String(one.attributes.label ?? one.attributes.name),
        /*
         * **Through `fieldsFrom`**, because a column is a declaration now — `{ name, kind }` — and
         * not a name. Read as `string[]` it put objects where labels belonged, and React answered by
         * unmounting the panel: the whole 데이터 tab went white the moment a list was selected.
         *
         * A cast is a promise, and this one had been true for as long as a column was a string.
         */
        fields: columnNames(fieldsFrom(one.attributes.fields)),
        rows: ((one.attributes.records ?? []) as unknown[]).length
      }));

    const chosen = datasets.find((one) => one.name === shown?.attrs.source);

    /**
     * And the blocks this one could **open** — the third list only the document can supply.
     *
     * Scoped to the page or the component definition the selected block is in, and that scoping is
     * the feature rather than a tidiness: a hamburger inside a navigation bar must open a block of
     * that same definition, because every placement resolves the name to its own copy. Offering a
     * block of some other page would write a document where two placements open one menu, or where
     * pressing opens nothing at all.
     *
     * Itself excluded, and 자기 자신 offered as its own entry instead: a block that opens itself is
     * a real design — a box with a header that expands it — and it is a different sentence from
     * naming a sid, so it is a different choice.
     */
    const doc = { rootId, getNode: (sid: string) => store?.getNode(sid) };
    const openable = (() => {
      const me = shown?.ids?.[0];
      if (!me) return [] as { id: string; label: string }[];
      const held = holderOf(doc as never, me);
      const from =
        held?.kind === 'component'
          ? definitionsOf(doc as never).find((one) => one.id === held.sid)?.part
          : held?.sid;
      if (!from) return [] as { id: string; label: string }[];

      const found: { id: string; label: string }[] = [];
      const walk = (sid: string, depth = 0) => {
        if (depth > 24) return;
        for (const child of blocksIn(doc as never, sid)) {
          if (child !== me) found.push({ id: child, label: labelOfBlock(doc as never, child) });
          walk(child, depth + 1);
        }
      };
      walk(from);
      return [
        { id: '', label: '없음' },
        { id: 'self', label: '자기 자신' },
        ...found
      ];
    })();

    /**
     * And the **connections** answers go through, with how many forms share each.
     *
     * The count is not decoration: editing a connection's address from one form's panel changes every
     * form that names it, and a named reference is worth having *because* one edit reaches every
     * use — so a reader has to be told when they are about to make one. It is the same sentence the
     * component list makes with 5곳.
     */
    const services = servicesOf(doc as never).map((one) => {
      let uses = 0;
      const count = (sid: string, depth = 0) => {
        if (depth > 40) return;
        const node = store?.getNode(sid) as any;
        if (node?.stype === 'form' && node.attributes?.sends === one.name) uses += 1;
        for (const child of (node?.content ?? []) as unknown[]) {
          if (typeof child === 'string') count(child, depth + 1);
        }
      };
      if (rootId) count(rootId);
      return { ...one, uses };
    });

    return {
      /** The files the document holds, for a picture to be pointed at one. */
      assets: assetsOf(doc as never).map((one) => ({ name: one.name, label: one.label })),
      /** And the pages, for a form to say where a visitor lands after sending. */
      pages: pagesOf(doc as never).map((one: any) => ({ id: String(one.id), name: String(one.name) })),
      /**
       * And the **widths this site is designed at**, which only the document can list.
       *
       * Read here rather than in the control, because the panel already has the document open and a
       * control that fetched its own would be a second answer to a question with one.
       */
      widths: widthsOf(store as never, rootId),
      /*
       * The definitions, for the template row. The same list the rail's 컴포넌트 panel draws — one
       * source, because a page drawn through a definition and a placement of one name the same thing.
       */
      templates: definitionsOf({ rootId: rootId ?? '', getNode: (sid: string) => store?.getNode(sid) } as never).map(
        (one: { id: string; name: string }) => ({ id: one.id, label: one.name })
      ),
      datasets: datasets.map((one) => ({ id: one.name, label: `${one.label} (${one.rows})` })),
      columns: [{ id: '', label: '없음' }, ...(chosen?.fields ?? []).map((f) => ({ id: f, label: f }))],
      openable,
      services
    };
  }, [editor, revision, store, shown?.attrs.source, shown?.ids]);

  const run = (name: string, payload: Record<string, unknown>) => void editor.executeCommand(name, payload);

  /**
   * What a row does when it is changed.
   *
   * One place, and it reads the row's own `command` rather than assuming `setBlockFormat` — which is
   * what lets 페이지 › 주소 and 값 be ordinary rows instead of two hand-written groups.
   */
  /**
   * **A `<select>`'s value is always a string, and some attributes are numbers.**
   *
   * 제목 단계 offered 제목 1 … 제목 6, sent `'4'`, and the schema declares `level` as a number — so
   * the validator threw the whole transaction away and the control did nothing at all. Silent from
   * every direction: the row existed, the command accepted the field, and the value was refused one
   * layer further down.
   *
   * Asked of the **schema** rather than listed here, because a list is a second place to remember
   * every numeric attribute and it would be wrong the first time one was added. The panel already
   * asks the schema which attributes a node type declares; this is the same question about kind.
   *
   * Only a string that is entirely a number becomes one — a `type` of `'1'` on a list is a choice of
   * numbering style and stays a string if the schema says so, and a half-typed `'4a'` is nothing.
   */
  const kinded = (row: SitePanelRow, value: unknown): unknown => {
    if (typeof value !== 'string' || value === '') return value;
    const stype = shown?.stype ?? (node(page) ? 'surface' : undefined);
    const declared = stype ? schema?.getNodeType?.(stype)?.attrs?.[row.attr] : undefined;
    const kind = (declared as { type?: unknown } | undefined)?.type;
    if (kind !== 'number') return value;
    const said = Number(value);
    return Number.isFinite(said) ? said : value;
  };

  const write = (row: SitePanelRow, value: unknown) => {
    if (!row.command) return;
    /**
     * **Taking a block out of the flow freezes the size it had** — the same thing ⌘-dragging one out
     * does, and for the reason that gesture found: `fill` takes whatever the stack gives, so a block
     * left stretching after it is placed has a width handle that writes a `maxWidth` it never
     * reaches, and every alignment reads it as a point rather than as a box.
     *
     * Here rather than in the command, because the command has no measurements: a document holds
     * what a reader stated and the browser holds what it made of it. Which is the same division
     * `alignBlocks` documents — it lines up **stated** sizes, so a block that has never said how big
     * it is lines up by its corner.
     */
    if (row.attr === 'position' && value === 'absolute' && shown?.ids.length) {
      const board = document.querySelector('[data-frame="desktop"]');
      for (const sid of shown.ids) {
        const el = board?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`);
        if (!el) continue;
        const held = (editor.dataStore?.getNode(sid)?.attributes ?? {}) as Record<string, unknown>;
        if (typeof held.maxWidth === 'number' && typeof held.minHeight === 'number') continue;
        run('setBlockFormat', {
          nodeIds: [sid],
          sizing: 'fixed',
          maxWidth: Math.round(el.offsetWidth * PX),
          minWidth: Math.round(el.offsetWidth * PX),
          minHeight: Math.round(el.offsetHeight * PX)
        });
      }
    }
    if (row.command === 'setPageInfo') run('setPageInfo', { nodeId: page, [row.attr]: value });
    /*
     * Naming a question the card does not ask **declares** it, so the field that types a name and
     * the picker that chooses one run the same command. One sentence — *this text comes from the
     * card's data, and the question is called 할인* — which is why there is one command and not two.
     */
    else if (row.command === 'bindPartText') {
      run('bindPartText', { nodeId: shown?.ids[0], var: value || undefined });
    }
    /*
     * A **mark**, which takes the selection rather than a node and names its value its own way.
     *
     * The row is declared by the mark it reads — `fontSize`, `fontColor` — because that is what has
     * to be found on the run to show the current value. What the command takes is `size` and
     * `color`, and translating here is the same shape as `bindPartText` above: a row whose payload
     * key is not its attr, said once, where the panel already knows about such rows.
     *
     * An empty value **removes** the mark rather than writing an empty one. A `fontSize` of `''` is
     * a mark on the run that says nothing, which survives a copy and confuses every later read;
     * clearing is what the × on the control means and `removeFont*` is what does it.
     */
    else if (row.command === 'setFontSize' || row.command === 'setFontColor') {
      const said = typeof value === 'number' ? `${value}px` : String(value ?? '');
      if (!said) run(row.command === 'setFontSize' ? 'removeFontSize' : 'removeFontColor', {});
      else run(row.command, row.attr === 'fontSize' ? { size: said } : { color: said });
    }
    else {
      /*
       * A shorthand answers for its four sides as well as for itself.
       *
       * Otherwise typing 24 into 안쪽 여백 on a box whose top says 96 writes a shorthand that four
       * stated sides go on overriding, and the reader watches a number they typed do nothing.
       * Clearing the sides is the honest reading of "make it this all the way round".
       */
      const sides = Object.fromEntries((SHORTHAND[row.attr] ?? []).map((side) => [side, undefined]));
      /**
       * An **emptied field at a narrower width says *nothing here*, not *the same as the page*.**
       *
       * The two are different documents and a reader means the first far more often: a sidebar that
       * is 340 wide beside the words and the whole column under them, a card whose maximum width a
       * phone should ignore. Until `null` existed the second was all this could say, and the
       * workaround was a number large enough to mean nothing — a lie in the document.
       *
       * The way to say *the same as the page* is the mark beside the label, which is where a reader
       * looks for it because the mark is what told them the width owns the value.
       */
      const cleared = value === undefined || value === null || value === '';
      const said = cleared && at !== BASE_BREAKPOINT && !state ? null : value;
      run(row.command, { nodeIds: shown?.ids, at, state, ...sides, [row.attr]: kinded(row, said) });
    }
  };

  const tabs: { id: SitePanelTab; label: string }[] = [
    { id: 'block', label: '블록' },
    { id: 'style', label: '모양' },
    ...(shown?.stype === 'collection' ? ([{ id: 'data', label: '데이터' }] as const) : []),
    ...(shown?.stype === 'instance' ? ([{ id: 'values', label: '값' }] as const) : []),
    /*
     * **What this block leans on, and what leans on it** — the tab that holds no properties.
     *
     * Six things in this document model are referred to **by name**: a component, a dataset, a file,
     * a connection, a variable, a page. A name means *somewhere else*, and nothing in the editor has
     * ever said where — so a reader renaming a colour or editing a card has been changing things they
     * could not see. It is offered only with something selected, because with nothing selected the
     * question has no subject.
     */
    ...(shown ? ([{ id: 'uses', label: '쓰임' }] as const) : [])
  ];

  return (
    <PropertyPanel
      title="속성"
      action={
        <div className="st-at" data-editing-at={at}>
          {BREAKPOINTS.map((one) => (
            <button
              key={one.id}
              type="button"
              data-at={one.id}
              data-current={one.id === at ? 'true' : undefined}
              title={`${one.label}에서 편집`}
              aria-label={`${one.label}에서 편집`}
              onClick={() => onAt(one.id)}
            >
              {/*
                The picture, because the word did not fit and the truncation was 데 / 태 / 모.

                A one-syllable Korean truncation is not an abbreviation — it carries no meaning at
                all — and these three are exactly what a glyph says instantly. Which glyph means
                *tablet* is declared with the breakpoint (`breakpoints.ts`), not here.
              */}
              <Icon name={one.icon ?? iconForWidth(one.width)} size={14} />
            </button>
          ))}
        </div>
      }
    >
      {words ? (
        /*
         * **The words**, when a range is what is selected — and before the page, because a range is
         * the more specific answer to *what is selected* and the panel showed the less specific one.
         *
         * A pane rather than a tab: there is nothing else to say about a run of text, and a tab strip
         * with one tab in it is a control that teaches a reader there is somewhere else to look.
         */
        <Groups
          folded={folded}
          onFold={(label, next) => setFolded((was) => ({ ...was, [label]: next }))}
          find={find}
          onFind={setFind}
          stype="inline-text"
          tab="text"
          shown={words}
          at={at}
          tokens={tokens}
          data={data}
          schema={schema}
          write={write}
          run={run}
          editor={editor}
          onAt={onAt}
          writing={writing}
        />
      ) : !shown ? (
        /*
         * The page, when nothing is selected — where every builder of this kind puts it, and the
         * only place a page's **address** can be edited at all: a page is the board rather than a
         * block, so it is never in a selection (`SELECTABLE` leaves it out on purpose).
         */
        <Groups
          folded={folded}
          onFold={(label, next) => setFolded((was) => ({ ...was, [label]: next }))}
          find={find}
          onFind={setFind}
          stype={node(page) ? 'surface' : undefined}
          tab="page"
          shown={null}
          at={at}
          page={node(page)}
          tokens={tokens}
          data={data}
          schema={schema}
          write={write}
          run={run}
          editor={editor}
          onAt={onAt}
          writing={writing}
          empty="페이지에서 블록을 선택하세요. 한 번 누르면 바깥쪽 블록, 두 번 누르면 그 안쪽입니다."
          after="블록을 선택하면 그 블록의 속성이 여기에 나옵니다."
        />
      ) : (
        <>
          <PropertyTabs
            tabs={tabs}
            active={tab}
            onChange={(id) => {
              setTab(id as SitePanelTab);
              setFind('');
              // Only 모양 can hold a state, so leaving it puts the panel back on the resting page.
              if (id !== 'style') onState(undefined);
            }}
          />
          {tab === 'style' ? (
            <StateSwitch state={state} onState={onState} />
          ) : null}
          {tab === 'uses' ? (
            <Uses editor={editor} sid={shown.ids[0]} onPage={onPage} onEdit={onEditComponent} />
          ) : null}
          <Groups
          folded={folded}
          onFold={(label, next) => setFolded((was) => ({ ...was, [label]: next }))}
          find={find}
          onFind={setFind}
            stype={shown.stype}
            tab={tab}
            shown={shown}
            at={at}
            state={state}
            tokens={tokens}
            data={data}
            schema={schema}
            write={write}
            run={run}
            editor={editor}
            onAt={onAt}
            writing={writing}
            row={row}
            onEditRow={onEditRow}
          />
          {/*
            **담는 곳** — the way out, and the only thing some blocks have to say.

            ## What the panel looked like without it

            Measured by selecting a paragraph on the sample: the whole panel held one row, `종류 ·
            본문`, restating what the reader had just clicked, over six hundred pixels of nothing.
            That is not a bug in the panel — the schema deliberately keeps width off text blocks,
            because the renderer that would read it is `office-text`'s and a site does not own it,
            and the recorded reason is right: "a schema that offers a reader something nothing draws
            is worse than one that offers less."

            But the reasoning has a second half nobody had written down. The schema's own note says
            where the decision *does* live — "text sizing is the stack's question, asked one level
            up" — and until now the panel knew that and did not say it. This row is that sentence
            made pressable: the name of the stack, and the key that goes there.

            ## Why it is on 블록 rather than everywhere

            Because it is a fact about where the block *is*, which is what the 블록 pane is for; 모양
            answers what it looks like. And it stays on a frame that already has 28 rows, rather than
            appearing only when the panel is empty — an affordance that comes and going teaches a
            reader nothing, and going up is the same gesture whether or not the panel is full.
          */}
          {tab === 'block' && shown.holder ? (
            <PropertyGroup label="담는 곳">
              <PropertyLink
                label="위"
                value={shown.holder.label}
                shortcut={keyLabel(chordFor(SITE_KEYS, { command: 'selectParent' }), onApple())}
                onPress={() => run('selectParent', { nodeIds: shown.ids })}
              />
            </PropertyGroup>
          ) : null}
        </>
      )}
    </PropertyPanel>
  );
}

type Shown = {
  ids: string[];
  count: number;
  stype: string;
  label: string;
  attrs: Record<string, any>;
  raw: Record<string, any>;
  overridden: Set<string>;
  values: { sid: string; name: string; value: string }[];
  /** For a list: which card it draws, what that card asks, and what it is currently given. */
  card?: { template: string; name: string; asks: { name: string; value: string }[] };
  /**
   * For a **part of a definition**: what the card asks, and which question this part's words are.
   *
   * `undefined` for anything not inside a definition — a heading on a page is nobody's part, and the
   * row is not drawn for it. That is a fact about where the node *is*, which no declaration can
   * carry and only the document can answer.
   */
  part?: {
    asks: string[];
    bound?: string;
    /** What the variable it is bound to declares — see where it is read for why the panel needs it. */
    kind?: string;
    format?: string;
    /**
     * How many placements of this definition there are, which is what makes a removal sayable.
     *
     * A reader about to take a variable away is about to change every one of them at once, and the
     * only honest way to tell them so is the number. The panel has no other use for it.
     */
    uses: number;
  };
};

/**
 * The declaration, drawn — by the **suite's** panel, not this app's.
 *
 * `PropertySheet` draws the five kinds every editor's panel has (a name, a number with a unit, a
 * colour, a list of values, a switch) and hands back anything it does not know. What is left here is
 * the four kinds that are a *page's*: which dataset, which column, a placement's answers, and the
 * sentence that says which width is being edited.
 *
 * That split is the point of the shared sheet. The deck's panel and this one drew the same five
 * controls twice over, and every editor after them would have drawn them a third time.
 */
/**
 * **What this block leans on, and what leans on it.**
 *
 * The tab that holds no properties, and the one this document model needs most: six things are
 * referred to **by name** — a component, a dataset, a file, a connection, a variable, a page — and a
 * name means *somewhere else*. Nothing in the editor had ever said where, so a reader renaming a
 * colour or editing a card was changing pages they could not see.
 *
 * Two directions, and they are different questions:
 *
 * - **쓰는 것** — what this block would need in order to draw anywhere else. `namesIn`'s answer, the
 *   same walk a copy uses to decide what travels with a paste.
 * - **여기를 쓰는 곳** — for a placement or a list, which other pages and definitions point at the
 *   same thing. `whereUsed`, per page and per definition, because that is where a reader would go.
 *
 * Every row goes somewhere. A list of pages a reader cannot open is half an answer: the question is
 * *what am I about to change*, and the way to find out is to look.
 */
function Uses({
  editor,
  sid,
  onPage,
  onEdit
}: {
  editor: Editor;
  sid: string | undefined;
  onPage?: (sid: string) => void;
  onEdit?: (componentId: string) => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const store = editor.dataStore;
  const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();

  const said = useMemo(() => {
    if (!store || !rootId || !sid) return undefined;
    const doc = {
      rootId,
      getNode: (one: string) => store.getNode(one),
      treeAt: (one: string) => (editor as never as { exportDocument?: (s: string) => unknown }).exportDocument?.(one)
    };
    const tree = doc.treeAt(sid);
    if (!tree) return undefined;

    const leans = namesIn(tree);
    const attrs = (store.getNode(sid)?.attributes ?? {}) as Record<string, unknown>;
    /*
     * And **what points back**, asked only where it means something: a placement and a list are the
     * two blocks that *are* a reference, so their own answer is the interesting one. A frame is not
     * referred to by anything, and asking would be a section headed with nothing under it.
     */
    const mine =
      typeof attrs.componentId === 'string' && attrs.componentId
        ? { kind: 'components' as const, name: attrs.componentId }
        : typeof attrs.source === 'string' && attrs.source
          ? { kind: 'datasets' as const, name: attrs.source }
          : undefined;

    return {
      leans: (
        [
          ['components', '컴포넌트'],
          ['datasets', '데이터'],
          ['assets', '파일'],
          ['services', '연결'],
          ['variables', '변수']
        ] as const
      )
        .map(([key, label]) => ({ key, label, names: [...leans[key]] }))
        .filter((one) => one.names.length > 0),
      mine,
      elsewhere: mine ? whereUsed(doc as never, mine.kind, mine.name) : []
    };
    // `revision`: the document changed, so what it points at may have.
  }, [editor, store, rootId, sid, revision]);

  if (!said) return null;

  return (
    <div className="st-uses">
      {said.leans.length === 0 && said.elsewhere.length === 0 ? (
        <p className="st-uses-none">이 블록은 이름으로 가리키는 것이 없습니다</p>
      ) : null}

      {said.leans.map((one) => (
        <section key={one.key} className="st-uses-group">
          <h3>{one.label}</h3>
          <ul>
            {one.names.map((name) => (
              <li key={name}>
                {one.key === 'components' && onEdit ? (
                  <button type="button" data-uses={name} onClick={() => onEdit(name)}>
                    {name}
                  </button>
                ) : (
                  <span data-uses={name}>{name}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {said.mine && said.elsewhere.length > 0 ? (
        <section className="st-uses-group">
          <h3>‘{said.mine.name}’을 쓰는 곳 {said.elsewhere.length}</h3>
          <ul>
            {said.elsewhere.map((one) => (
              <li key={one.sid}>
                <button
                  type="button"
                  data-uses-at={one.sid}
                  onClick={() => (one.kind === 'page' ? onPage?.(one.sid) : onEdit?.(one.label))}
                >
                  {one.kind === 'page' ? '페이지 · ' : '컴포넌트 · '}
                  {one.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Groups({
  stype,
  tab,
  folded,
  onFold,
  find,
  onFind,
  shown,
  at,
  state,
  page,
  tokens,
  data,
  schema,
  write,
  run,
  editor,
  onAt,
  writing,
  empty,
  after,
  row,
  onEditRow
}: {
  /**
   * **Which sections are put away**, held by the `Inspector` above rather than here.
   *
   * A fold has to survive the selection moving: a reader who put 그림자 away is not asking to be
   * shown it again the moment they click the next card. This component is drawn from a different
   * branch depending on what is selected, so state kept in it would be thrown away on exactly the
   * gesture the fold is supposed to outlive.
   */
  folded: Record<string, boolean>;
  onFold: (label: string, folded: boolean) => void;
  /** What the reader typed into 속성 찾기, and how to tell the panel they typed it. */
  find: string;
  onFind: (said: string) => void;
  stype: string | undefined;
  tab: SitePanelTab;
  shown: Shown | null;
  at: BreakpointId;
  /** The state being edited, when the reader has opened one. */
  state?: StateId;
  page?: any;
  tokens: ThemeSwatch[];
  data: {
    datasets: { id: string; label: string }[];
    columns: { id: string; label: string }[];
    openable: { id: string; label: string }[];
    services: {
      name: string;
      label?: string;
      endpoint?: string;
      method: string;
      returnField?: string;
      trapField?: string;
      uses: number;
    }[];
    assets: { name: string; label?: string }[];
    /** The pages of this site, for a form to say where a visitor lands after sending. */
    pages: { id: string; name: string }[];
    /** The widths this site is designed at — the list itself, which only the document has. */
    widths: SiteWidth[];
    /** The definitions this document holds, for a page to say which one draws it. */
    templates: { id: string; label: string }[];
  };
  /** The document's schema, which is what decides where a row appears. */
  schema?: { getNodeType?: (stype: string) => { attrs?: Record<string, unknown> } | undefined };
  write: (row: SitePanelRow, value: unknown) => void;
  run: (name: string, payload: Record<string, unknown>) => void;
  /** The editor itself, for the one control that has to read a file off the reader's machine. */
  editor: Editor;
  /** Which width a reader is editing at — the widths list can move them to another one. */
  onAt: (at: BreakpointId) => void;
  /** Whether the reader is in 글 고치기, where only the words are theirs — see `writing.ts`. */
  writing?: boolean;
  /** Shown instead of the groups when there is nothing to draw them about. */
  empty?: string;
  /** Shown under them, when a reader could be told what to do next. */
  after?: string;
  /** The row of data the selection is drawn from, and how to open its form — see `rowEdit`. */
  row?: { sid: string; row: number; label: string };
  onEditRow?: () => void;
}) {
  if (empty && !page) return <PropertyEmpty>{empty}</PropertyEmpty>;

  /*
   * Whether the selected node type declares an attribute — which is what decides where a row appears.
   *
   * Asked of the schema rather than of a list in the declaration, because a list drifts: this panel
   * was offering a 폭, a 배경 and two 테두리 rows on a heading and a paragraph, and none of those
   * types declares any of them. Seven controls that wrote nothing, on every text block on the page.
   */
  const declares = (one: string, attr: string) => schema?.getNodeType?.(one)?.attrs?.[attr] !== undefined;

  /**
   * **What a row reads, when what it writes is not what is selected.**
   *
   * `of` says which node a row writes — the *document*, for the site's address, its faces, its tab
   * picture and what a crawler is told. Nothing read it, so every one of those rows took its value
   * from the selected node, which does not have the attribute and never will: they were **write
   * only**. A reader who set the site's address, went away and came back was shown an empty box and
   * would type it again; the 검색 제외 switch flicked back the moment it was let go, because React
   * redraws a controlled checkbox from a value that was always `undefined`.
   *
   * Invisible from every direction it was looked at. The command worked, the document held the
   * value, the published page used it, and the unit tests called the commands rather than the panel.
   * Found by clicking the switch in a browser and watching it come back up.
   *
   * A row for a node *type* (`of: 'service'`) is a different question — that one is resolved from
   * the block's own reference and already had an answer; this is only the document's.
   *
   * Layered into `attrs` rather than read at each control, because there are six places a control
   * reads a value — the sheet's `value`, its `raw`, and four custom kinds that draw their own — and
   * a fix in five of them is the bug still being there. Safe to layer: a row says what it writes,
   * and the conformance check already refuses a row whose `of` type does not declare the attribute,
   * so no selected block has one of these keys to lose.
   */
  const siteRoot = editor.getRootId?.();
  const siteAttrs = (siteRoot ? editor.dataStore?.getNode(siteRoot)?.attributes : undefined) ?? {};

  const attrs = (() => {
    const base = shown?.attrs ?? (page?.attributes as Record<string, any>) ?? {};
    const mine: Record<string, any> = { ...base };
    for (const row of SITE_PANEL) {
      if (row.of === 'document') mine[row.attr] = (siteAttrs as Record<string, any>)[row.attr];
    }
    return mine;
  })();
  const count = shown?.count ?? 1;
  const groups = sitePanelGroups(stype, tab, declares)
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row) =>
          visible(row, attrs, count) &&
          /*
           * The card group only where a card is: a heading on a page is nobody's part, and a row
           * offering to bind it would write a `componentBind` into a document with nothing to
           * resolve it.
           */
          (row.group !== '컴포넌트 변수' || !!shown?.part) &&
          /*
           * And in a state, only what **that** state may hold. Paint under the pointer, never an
           * arrangement — a block that resized under the pointer would move out from under it and
           * flicker, so the panel does not offer the gesture rather than accepting it and having the
           * command refuse.
           *
           * 열림 is the state where appearing is the point, so it offers 보임 and the two arrangement
           * rows with it: a menu that can be made to appear and cannot be made to stack is half a
           * design. `stateableIn` is the one list, asked rather than repeated here.
           */
          (!state || stateableIn(state).includes(row.attr)) &&
          /**
           * And in **글 고치기**, only what a writer may change.
           *
           * Drawn rather than greyed, and that is the difference the mode is for: a greyed control
           * is a thing a reader keeps looking at and wondering about, and a writer looking at 폭 ·
           * 배치 · 그림자 is a writer being shown somebody else's work. What is left is the words and
           * the thing the words are about.
           *
           * Asked of the row's **attribute** rather than its command, because that is the question a
           * panel has: not *may this run* — the guarded editor answers that — but *is this row worth
           * drawing*. A picture's file is; its corner radius is not, and both go through one command.
           */
          (!writing || writerMaySet(row.attr))
      )
    }))
    .filter((group) => group.rows.length > 0);
  return (
    <>
      <PropertySheet
        /**
         * **A different panel in 글 고치기**, said with a key.
         *
         * Measured rather than guessed at: with the mode on, this component renders one group of
         * three rows — logged from inside the sheet itself — and the panel on screen went on showing
         * six. React was reconciling the new list onto the old sections instead of removing them,
         * and no amount of filtering upstream reaches that.
         *
         * A key is the honest description as well as the fix: a writer's panel is not the builder's
         * panel with rows hidden, it is a different panel, and saying so lets React build it.
         */
        key={writing ? 'writing' : 'all'}
        groups={groups}
        /**
         * **Every section starts open**, and the reason it is not cleverer than that is measured.
         *
         * The panel is long: five groups on an ordinary band came to **946 pixels in a 679 pixel
         * window**, so opening only the groups that hold a value was the obvious fix. Built, and then
         * measured again: **790 pixels**. Still taller than the window, so the scroll a reader was
         * doing is the scroll they still do — and the bill for those 156 pixels was four carve-outs
         * and seven browser tests.
         *
         * Each carve-out was the rule being wrong in a way that had to be *listed* rather than
         * derived:
         *
         * - 사이트 and 페이지 are drawn **twice** on the page tab, so the second run of rows closed on
         *   a document whose value sat under the first — and its controls could not be reached.
         * - 코드 › 언어 is empty until somebody types it. Closing the only place a value can come
         *   from is the opposite of tidying.
         * - 컴포넌트 변수 is where a variable is *made*, so it is empty by definition.
         * - A group of one row shut is a heading with nothing under it and no way in.
         *
         * A rule that needs a hand-kept list of exceptions is a rule that will be wrong the next time
         * somebody adds a group, and it would be wrong silently. The height was worth having and this
         * was not the way to get it: the four segmented rows took more pixels out of this panel than
         * folding did, and they took them out of every selection rather than out of two groups.
         *
         * What stays is the reader's own fold, remembered per heading — which is what they asked for
         * and the only version of this that cannot be wrong.
         */
        folded={(group) => folded[group.label] === true}
        onFold={(group, next) => onFold(group.label, next)}
        /*
         * **Finding a row**, which a panel of 114 is bad at however well the groups are named. Held
         * here rather than in the sheet because it is a fact about this reader's session, and cleared
         * when the tab changes: a filter left over from another tab is a panel that looks empty.
         */
        find={find}
        onFind={onFind}
        /*
         * Pixels out, twips in — and it is **here** rather than in the sheet because 15 twips to the
         * pixel is a fact about this document model, not about how a number field behaves. The sheet
         * asks the product what the value is; a sheet that converted would be a second place that
         * knows what a document means by a length.
         */
        value={(row) => {
          const held = shorthandOf(row, attrs);
          if (row.unit !== 'px' || held === undefined || held === null) return held;
          /*
           * A **string** is already CSS. Twips are numbers in this schema, without exception, so a
           * length that arrived with its unit written on it came from a mark rather than from an
           * attribute — and dividing `'44px'` by fifteen is `NaN`, which a number field draws as an
           * empty box. The size row would have shown nothing over text that plainly has a size.
           */
          if (typeof held === 'string') return parseFloat(held);
          return Math.round(Number(held) / PX);
        }}
        /* A colour that follows a token must not be shown as the hex it resolves to. */
        raw={(row) =>
          row.of === 'document' ? attrs[row.attr] : (shown?.raw ?? attrs)[row.attr]
        }
        marked={(row) => shown?.overridden.has(row.attr) === true}
        /**
         * And **taking it back** — the half the mark was missing.
         *
         * A dot said *this width owns this value* and there was no way to stop it owning one. Typing
         * the page's number back in looks identical and is a different document: the width still
         * states a value, it now happens to match, and it stops following the day the page's changes.
         *
         * `undefined` is what takes an override or a state's statement off (`withOverride`,
         * `withState`) — which is deliberately **not** what an emptied field writes at a narrower
         * width. That means *nothing at this width*, and the two were one gesture until now.
         */
        /**
         * **A colour at a weight**, which is the panel saying a sentence the palette needed.
         *
         * A token holds one colour and a design wants it at a fraction constantly — a frosted bar, a
         * scrim, a hairline. Written as a literal `rgba(...)` it stops following the palette: the
         * sample's own header bar was exactly that, and it is in the backlog as a colour that would
         * not move the day 종이 changed.
         *
         * The three questions the sheet asks are answered here, because how a document *spells* a
         * weighted reference is the editor's business and `office-ui` must not learn it.
         */
        follows={(row) => {
          const said = (shown?.raw ?? attrs)[row.attr];
          return isVarRef(said) ? varRef(varNameOf(said)) : undefined;
        }}
        weightOf={(row) => {
          const said = (shown?.raw ?? attrs)[row.attr];
          return isVarRef(said) ? varWeightOf(said) : undefined;
        }}
        onWeight={(row, weight) => {
          const said = (shown?.raw ?? attrs)[row.attr];
          if (!isVarRef(said)) return;
          write(row, varRefAt(varNameOf(said), weight));
        }}
        onUnmark={(row) => {
          if (!row.command) return;
          run(row.command, { nodeIds: shown?.ids, at, state, [row.attr]: undefined });
        }}
        swatches={tokens}
        heading={(group) =>
          /*
           * The selection's group is named after what is selected, which is the one heading a
           * declaration cannot hold: it is a fact about the document rather than about the panel.
           */
          group.label === '선택'
            ? shown && shown.count > 1
              ? `${shown.count}개 선택됨`
              : (shown?.label ?? group.label)
            : group.label
        }
        onWrite={(row, next) => write(row, isMarkRow(row) ? next : commit(row, next))}
        render={(one) => own(one, { attrs, shown, at, data, run, editor, onAt, page, row, onEditRow })}
      />
      {/*
        The sentence about **the next thing**, under a heading that says it is one.
        
        It was a bare paragraph directly under the last of the page's six rows, so read top to bottom
        the panel said *here is the page's background, here is its shadow, select a block and its
        properties will appear here* — which reads as though the panel is empty while six rows of it
        are on screen. A section heading is the whole fix: the sentence is now the content of a
        section called 블록 rather than a trailing remark about the one above it.
      */}
      {after ? (
        <PropertyGroup label="블록">
          <PropertyEmpty>{after}</PropertyEmpty>
        </PropertyGroup>
      ) : null}
    </>
  );
}

/**
 * The switch between what a block looks like **at rest** and what it promises under a pointer.
 *
 * ## Why it is a switch and not a second panel
 *
 * Because it is the same block and the same rows. Every tool that gave states their own panel made a
 * reader hold two pictures of one card in their head; a switch says *now you are editing the hover*,
 * and the rows underneath answer for the hover. The marks on the rows do the rest: a marked row is
 * one this state changes, which is the same mark a width uses and means the same thing.
 *
 * ## Why it says the width does not apply
 *
 * Because a reader looking at the mobile board while setting a hover colour has, correctly, set the
 * site's hover colour — a state is not a width (`states.ts`), and the one thing a panel must never
 * do is let a reader believe a change was narrower than it was. So the sentence is under the switch
 * rather than in a document nobody opens.
 */
function StateSwitch({
  state,
  onState
}: {
  state?: StateId;
  onState: (state: StateId | undefined) => void;
}) {
  return (
    <div className="st-state">
      <div className="st-state-row" role="group" aria-label="상태">
        <button
          type="button"
          data-current={state === undefined ? 'true' : undefined}
          title="평소 모습"
          onClick={() => onState(undefined)}
        >
          기본
        </button>
        {STATES.map((one) => (
          <button
            key={one.id}
            type="button"
            data-state={one.id}
            data-current={state === one.id ? 'true' : undefined}
            title={one.title}
            onClick={() => onState(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>
      {state === 'open' ? (
        <p className="st-state-said">
          방문자가 열었을 때의 모습입니다. 보임과 배치까지 바꿀 수 있고, 여는 블록은 아래 ‘여는 것’에서
          고릅니다.
        </p>
      ) : state ? (
        <p className="st-state-said">
          모든 너비에 함께 적용됩니다. 색과 그림자만 바꿀 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a shorthand row shows when the sides disagree with it.
 *
 * `padding` is one number for four sides and each side may say its own. A box with 96 above and 64
 * below has no single padding, and showing the shorthand's own value — usually nothing, so **0** —
 * is the panel telling a reader their section has no padding while they are looking at the air above
 * the heading.
 *
 * `null` is what every control in this suite already means by *mixed*: a number field draws it as an
 * empty box with a placeholder rather than as a value, so a reader can see there is no one answer
 * and can still type one, which then applies to all four.
 */
function shorthandOf(row: SitePanelRow, attrs: Record<string, any>): unknown {
  const held = attrs[row.attr];
  const sides = SHORTHAND[row.attr];
  if (!sides) return held;

  const stated = sides.map((side) => attrs[side]).filter((one) => one !== undefined);
  if (stated.length === 0) return held;
  // Every side stated the same thing is one answer, whatever the shorthand says.
  return stated.length === sides.length && stated.every((one) => one === stated[0]) ? stated[0] : null;
}

/** The rows that are a shorthand for four others — see `office-schema`'s frame attributes. */
const SHORTHAND: Record<string, string[]> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
};

/**
 * What a row's value becomes on the way into the document.
 *
 * Pixels to twips, and "nothing" for a length that has no natural zero: a `minWidth` of 0 and no
 * `minWidth` draw the same and mean different things — one is a decision — and `undefined` is how a
 * reader takes a value back at this width.
 */
/**
 * Whether a row writes a **mark** rather than an attribute of a node.
 *
 * The distinction matters for exactly one reason and it is worth naming: `unit: 'px'` in this panel
 * has always meant two things at once — *print px after the number* and *the document stores this in
 * twips*. Every length in this schema is twips, so the two never came apart. A mark's `fontSize` is a
 * **CSS length**: it is the shared mark vocabulary's, Word and the deck read the same one, and it is
 * a string with its unit on it. Sent through the twips arithmetic, a reader typing 44 would have
 * written `660px`.
 */
const isMarkRow = (row: SitePanelRow) =>
  row.command === 'setFontSize' || row.command === 'setFontColor';

function commit(row: SitePanelRow, next: unknown): unknown {
  if (row.control !== 'number') return row.control === 'toggle' && next !== true ? undefined : next;
  /*
   * A reader who **emptied** the field said nothing, and nothing is a value here: at the base width
   * the attribute goes, at a narrower one this width stops disagreeing and the page's own answer
   * reaches it again (`setBlockFormat`). Before the arithmetic, because `Number(undefined)` is `NaN`
   * and `Math.max(0, NaN)` is `NaN` — which passes the `<= 0` test below and would be written.
   */
  if (next === undefined) return undefined;
  // Typing into a shorthand answers for all four sides, which is what a reader means by typing into
  // it — see `shorthandOf` for why it can be showing nothing at the time.

  const floor = row.min ?? 0;
  /*
   * Rounded to the row's **step**, not to a whole number.
   *
   * It was `Math.round` for anything without a `px` unit, which was right while every such row was a
   * count or a degree — 열, 전환 시간, 그림자 방향, 몇 줄까지. 투명도 is the first that is not: a
   * reader typed `0.4`, the field held `0.4`, and the document stored **0**, so the block vanished.
   *
   * The step is what says how fine the value is — it is already on the row, because a browser
   * sanitises what is typed into a number field against it — so one number answers both questions.
   */
  const step = row.step ?? 1;
  const places = step >= 1 ? 0 : (String(step).split('.')[1]?.length ?? 0);
  const kept = Math.max(
    floor,
    row.unit === 'px' ? Number(next) : Number(Number(next).toFixed(places))
  );
  if (row.fallback === undefined && kept <= 0) return undefined;
  return kept * (row.unit === 'px' ? PX : 1);
}

/**
 * The kinds that are a **page's** rather than the suite's.
 *
 * `undefined` means "the sheet draws this one", which is how the shared five stay shared. A kind
 * this does not answer and the sheet does not know draws nothing — visible and askable, rather than
 * a guessed control that writes the wrong thing.
 */
/**
 * **The widths this site is designed at**, as one control.
 *
 * Four commands, one list — which is what the four declared panel rows say and why only the leader
 * draws. A row per width: its name, how wide, and the two things a reader does to it. Adding one is
 * the row at the bottom; moving one is the two arrows, because a drag inside a 240-pixel panel of
 * forty rows is a gesture that fights the panel's own scrolling.
 *
 * **A device is a shorthand for the numbers.** Choosing one writes the width, the height and the
 * picture; typing a number afterwards keeps the device's name and stops matching it, and the control
 * says 직접 입력 rather than claiming a phone the page is not drawn at (`deviceMatches`).
 *
 * The row a reader is editing at is marked and pressable, so this list is also how they move between
 * boards — which is the same answer the three glyphs at the top of the panel give, for a list that
 * can now be longer than three.
 */
function Widths({
  widths,
  at,
  onRun,
  onAt
}: {
  widths: SiteWidth[];
  at: BreakpointId;
  onRun: (command: string, payload: Record<string, unknown>) => void;
  onAt: (at: BreakpointId) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <span className="st-widths" data-widths>
      {widths.map((one, index) => (
        <span
          key={one.id}
          className="st-width"
          data-width={one.id}
          data-current={one.id === at ? 'true' : undefined}
        >
          {/*
            **Two lines**, because one could not hold them.

            A name a reader can type, a width, a window height, and three acts — that is five controls
            in a 240px column, and the single line that came first fitted them by making the name 60
            pixels wide, which is a name nobody can read or retype. So: what it is called on top, what
            it measures underneath.
          */}
          <span className="st-width-top">
            {/*
              The picture is the **way there**: pressing it edits at this width, which is the same
              answer the three glyphs at the top of the panel give and the one that has to keep
              working now that the list can be longer than three.
            */}
            <button
              type="button"
              className="st-width-go"
              /*
               * What it is a window onto, in the tooltip rather than on the row: the name had a
               * column of its own for one screenshot and every entry in it was cut to 노… / 태… — a
               * 240px panel has no room for a fourth thing per line, and the picture beside the name
               * already says which shape it is.
               */
              title={`${one.label}에서 편집 · ${
                deviceMatches(one)
                  ? (DEVICES.find((each) => each.name === one.device)?.label ?? '')
                  : '직접 입력'
              }`}
              aria-label={`${one.label}에서 편집`}
              onClick={() => onAt(one.id)}
            >
              <Icon name={one.icon ?? iconForWidth(one.width)} size={13} />
            </button>
            {/*
              And the name is a **field**, asked for directly (*사이즈별 제목 수정하게 해주고*). It is
              the `label` and never the `name`: the name is what every `overrides` key in the document
              points at, so renaming it would be a migration rather than an edit — which is the
              distinction `variable` drew first and this copies.
            */}
            <TextField
              value={one.label}
              onCommit={(next) => onRun('setWidth', { name: one.id, label: next || one.id })}
              ariaLabel={`${one.label} 이름`}
              className="st-width-label"
            />
            <button
              type="button"
              className="st-width-move"
              disabled={index === 0}
              title="위로"
              aria-label={`${one.label} 위로`}
              onClick={() => onRun('moveWidth', { name: one.id, to: index - 1 })}
            >
              <Icon name="move-up" size={12} />
            </button>
            <button
              type="button"
              className="st-width-move"
              disabled={index === widths.length - 1}
              title="아래로"
              aria-label={`${one.label} 아래로`}
              onClick={() => onRun('moveWidth', { name: one.id, to: index + 1 })}
            >
              <Icon name="move-down" size={12} />
            </button>
            <button
              type="button"
              className="st-width-remove"
              /* Never the last one: a site with no widths is a site with no boards. */
              disabled={widths.length < 2}
              title="이 폭 삭제"
              aria-label={`${one.label} 삭제`}
              onClick={() => onRun('removeWidth', { name: one.id })}
            >
              <Icon name="delete" size={12} />
            </button>
          </span>

          {/*
            The two numbers, and the second is not decoration: the window height is what preview shows
            and what a device frame is drawn around. A width that says nothing about it is a square.
          */}
          <span className="st-width-size">
            <PropertyNumber
              value={one.width}
              onCommit={(next) => onRun('setWidth', { name: one.id, size: next })}
              prefix="W"
              suffix="px"
              min={200}
              ariaLabel={`${one.label} 폭`}
            />
            <PropertyNumber
              value={one.viewport}
              onCommit={(next) => onRun('setWidth', { name: one.id, viewport: next })}
              prefix="H"
              suffix="px"
              min={200}
              ariaLabel={`${one.label} 창 높이`}
            />

          </span>
        </span>
      ))}

      {/*
        **A plus that opens the list**, which is the same shape the board's plus takes and was asked
        for in the same words: *사이즈 다이얼로그로 나와서 선택하면 추가*. A `<select>` of devices was
        here first and it is the wrong control for a choice a reader makes once and wants to *see* —
        a phone and a tablet are shapes, and a dropdown shows one line of text at a time.
      */}
      <button
        type="button"
        className="st-widths-plus"
        data-add-width
        title="폭 추가"
        aria-label="폭 추가"
        onClick={() => setPicking(true)}
      >
        <Icon name="add" size={12} />
        <span>폭 추가</span>
      </button>

      <Dialog
        open={picking}
        onOpenChange={setPicking}
        title="어떤 크기를 더할까요"
        description="장치를 고르면 폭과 창 높이가 같이 들어갑니다. 나중에 숫자만 바꿔도 됩니다."
        footer={<DialogButton onClick={() => setPicking(false)}>닫기</DialogButton>}
      >
        <div className="st-add-sheet">
          <section>
            <h3>장치</h3>
            <div className="st-add-grid">
              {DEVICES.map((one) => (
                <button
                  key={one.name}
                  type="button"
                  className="st-add-item"
                  data-add-device={one.name}
                  title={`${one.width} × ${one.viewport}`}
                  onClick={() => {
                    setPicking(false);
                    onRun('insertWidth', { device: one.name });
                  }}
                >
                  <Icon name={one.icon} />
                  <span>
                    {one.label}
                    <em>{one.width}px</em>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>직접</h3>
            <div className="st-add-grid">
              <button
                type="button"
                className="st-add-item"
                data-add-device=""
                title="가장 좁은 것보다 한 단계 좁게"
                onClick={() => {
                  setPicking(false);
                  onRun('insertWidth', {});
                }}
              >
                <Icon name="add" />
                <span>빈 폭</span>
              </button>
            </div>
          </section>
        </div>
      </Dialog>
    </span>
  );
}

function own(
  row: SitePanelRow,
  ctx: {
    attrs: Record<string, any>;
    shown: Shown | null;
    at: BreakpointId;
    data: {
    datasets: { id: string; label: string }[];
    columns: { id: string; label: string }[];
    openable: { id: string; label: string }[];
    services: {
      name: string;
      label?: string;
      endpoint?: string;
      method: string;
      returnField?: string;
      trapField?: string;
      uses: number;
    }[];
    assets: { name: string; label?: string }[];
    /** The pages of this site, for a form to say where a visitor lands after sending. */
    pages: { id: string; name: string }[];
    /** The widths this site is designed at — the list itself, which only the document has. */
    widths: SiteWidth[];
    /** The definitions this document holds, for a page to say which one draws it. */
    templates: { id: string; label: string }[];
  };
    run: (name: string, payload: Record<string, unknown>) => void;
    /** The editor itself, for the one control that has to read a file off the reader's machine. */
    editor: Editor;
    /** Which width a reader is editing at, and how to move them to another one. */
    onAt: (at: BreakpointId) => void;
    /**
     * The page the panel is on, for the rows whose subject is the page rather than a selection.
     *
     * The page pane is drawn with **nothing selected** — that is how a reader reaches a page at all
     * — so a row there has no `shown.ids` to act on and its command needs to be told which page.
     */
    page?: { sid?: string };
    /** The row of data the selected block is drawn from, and how to open its form. */
    row?: { sid: string; row: number; label: string };
    onEditRow?: () => void;
  }
): React.ReactNode | undefined {
  const { attrs, shown, at, data, run, editor, onAt, page, row: atRow, onEditRow } = ctx;

  /**
   * **A companion answers `when` too**, which it could not until a grid needed two gaps.
   *
   * `visible` filters the panel's rows, and a **companion** is not one of them: it is drawn beside
   * its leader by the sheet, which asks this function first and takes `null` for *leave it out*. So a
   * companion could say `when` and be drawn anyway — a control that writes an attribute the drawing
   * ignores, which is the fault the harness exists to catch, arriving through the one door it does
   * not watch.
   *
   * Asked of every row rather than of the one that needed it. A leader has already been filtered by
   * the time it reaches here, so this is only ever a second identical answer for those, and the day
   * another pair needs it the mechanism is the one already declared.
   */
  if (!visible(row, attrs, shown?.count ?? 1)) return null;

  switch (row.control) {
    case 'static':
      return <span className="st-kind">{kindOfBlock(shown?.stype ?? '') ?? shown?.stype}</span>;

    case 'note':
      /*
       * What turning **하나만** on costs, said at the moment a reader turns it on.
       *
       * A radio cannot be unpressed — right for a tab strip, a surprise for an accordion, and the
       * kind of thing a reader otherwise finds out from a visitor. Not a fault: nothing is wrong
       * with the document and there is nothing to fix.
       */
      if (row.attr === 'opensOne') {
        return (
          <span className="st-at-note">
            열어둔 것을 다시 눌러 닫을 수는 없습니다. 다른 것을 열면 바뀝니다.
          </span>
        );
      }

      // Only worth saying when it is true: at the widest width every value is the page's own.
      if (at === 'desktop') return null;
      return (
        <span className="st-at-note">
          {BREAKPOINTS.find((one) => one.id === at)?.label}에서 바꾼 값만 이 폭에 적용됩니다.
        </span>
      );

    case 'widths-part':
      /*
       * Declared so `every-command-can-be-reached` can see `setWidth`, `removeWidth` and `moveWidth`;
       * drawn by the leader below, because a widths list is one list and four labelled rows would be
       * four labels for it. `null` is the sheet's word for *leave this row out*.
       */
      return null;

    case 'widths':
      return (
        <Widths
          widths={data.widths}
          at={at}
          onRun={(command, payload) => run(command, payload)}
          onAt={onAt}
        />
      );

    case 'template':
      /*
       * **The definitions this document holds**, offered as the template a page is drawn through —
       * a picker rather than a field, because the value is a definition's id and an id is not a
       * thing anybody knows by looking at their site. 없음 is the first entry and a real answer: a
       * page that was an entry becomes an ordinary page holding exactly the blocks it always held.
       */
      return (
        <PropertyChoice
          value={String(attrs.template ?? '')}
          options={[{ id: '', label: '없음' }, ...data.templates]}
          onChange={(next) =>
            run('setPageTemplate', { nodeId: shown?.ids?.[0] ?? page?.sid, template: next })
          }
          ariaLabel={row.ariaLabel}
        />
      );

    case 'dataset':
    case 'column':
      /*
       * Two lists only the **document** can supply, which is why they are kinds and not `options`.
       * A reader picks a column rather than typing one, and that is the reason `dataset.fields` is
       * declared rather than inferred from the first row: a panel has to offer the fields before
       * there is a row on screen.
       */
      return (
        <PropertyChoice
          value={String(attrs[row.attr] ?? '')}
          options={row.control === 'dataset' ? data.datasets : data.columns}
          onChange={(next) => run('setBlockFormat', { nodeIds: shown?.ids, at, [row.attr]: next || undefined })}
          ariaLabel={row.ariaLabel}
          disabled={row.needs !== undefined && !attrs[row.needs]}
        />
      );

    case 'opens':
      /*
       * The blocks this one could open, by the names a reader gave them.
       *
       * A picker rather than a text field because the value is a sid, and a sid is not a thing
       * anybody knows by looking at their page. The list is scoped to the page or the component the
       * block is in — see where it is built for why that scoping is the feature.
       */
      return (
        <PropertyChoice
          value={String(attrs[row.attr] ?? '')}
          options={data.openable}
          onChange={(next) =>
            run(row.command ?? 'setOpens', { nodeId: shown?.ids?.[0], target: next || undefined })
          }
          ariaLabel={row.ariaLabel}
        />
      );

    case 'goes': {
      /*
       * **Where pressing this block goes**, which is two kinds of destination and one decision.
       *
       * A page of this site is picked by **name** and written as `page:<id>`, so renaming the page's
       * address moves every button that points at it — the reference shape this document model uses
       * six other times. Anything else is typed: an address, a `mailto:`, `#main`.
       *
       * One row rather than two, because a block goes to one place: two fields would let a document
       * hold a page *and* an address, and only one of them would ever be published.
       */
      const said = String(attrs.goes ?? '');
      const toPage = said.startsWith(PAGE_PREFIX) ? said.slice(PAGE_PREFIX.length) : '';
      return (
        <span className="st-goes">
          <PropertyChoice
            value={toPage ? toPage : said ? '주소' : ''}
            options={[
              { id: '', label: '아무 데도' },
              ...data.pages.map((one) => ({ id: one.id, label: one.name })),
              { id: '주소', label: '주소 직접' }
            ]}
            onChange={(next) =>
              run('setBlockFormat', {
                nodeIds: shown?.ids,
                /*
                 * 주소 직접 writes **nothing**, not an empty string: it is a reader saying which
                 * half of this row they mean, and the field below is where they say the rest. A
                 * placeholder value written here would publish a link to nowhere in the meantime.
                 */
                goes: next === '주소' ? (toPage ? undefined : said || undefined) : next ? `${PAGE_PREFIX}${next}` : undefined
              })
            }
            ariaLabel={row.ariaLabel}
          />
          {said && !toPage ? (
            <TextField
              value={said}
              onCommit={(next) =>
                run('setBlockFormat', { nodeIds: shown?.ids, goes: addressFor(next) })
              }
              placeholder="https://…"
              ariaLabel="누르면 가는 주소"
            />
          ) : null}
        </span>
      );
    }

    case 'sends': {
      /*
       * Which connection this form's answers go through — a **name**, so five forms on a site are
       * five references to one address rather than five copies of it. The address itself is the row
       * under this one, because a reader is at the form when the question comes up.
       */
      const chosen = String(attrs.sends ?? '');
      return (
        <PropertyChoice
          value={chosen}
          options={[
            { id: '', label: '고르지 않음' },
            ...data.services.map((one) => ({ id: one.name, label: one.label ?? one.name }))
          ]}
          onChange={(next) =>
            run('setBlockFormat', { nodeIds: shown?.ids, sends: next || undefined })
          }
          ariaLabel={row.ariaLabel}
        />
      );
    }

    case 'endpoint': {
      /*
       * The address the chosen connection points at — **the one thing about a form only a reader can
       * supply.** There is no default and none of this product's own: a builder that quietly posted a
       * stranger's message to its own server would be doing something nobody asked for.
       *
       * And how many forms share it, said beside the field rather than found out afterwards.
       */
      const service = data.services.find((one) => one.name === attrs.sends);
      if (!service) return null;
      return (
        <span className="st-endpoint">
          <TextField
            value={service.endpoint ?? ''}
            onCommit={(next) => run('setServiceInfo', { name: service.name, endpoint: next })}
            placeholder="https://…"
            ariaLabel={row.ariaLabel}
          />
          {service.uses > 1 ? <em className="st-uses">폼 {service.uses}개가 함께 씁니다</em> : null}
        </span>
      );
    }

    case 'serviceMethod': {
      const service = data.services.find((one) => one.name === attrs.sends);
      if (!service) return null;
      return (
        <PropertyChoice
          value={service.method}
          options={[
            { id: 'post', label: '보통 (post)' },
            { id: 'get', label: '주소에 담기 (get)' }
          ]}
          onChange={(next) => run('setServiceInfo', { name: service.name, method: next })}
          ariaLabel={row.ariaLabel}
        />
      );
    }

    case 'picture': {
      /**
       * **Which picture this is** — the files the document holds, and a way to add one.
       *
       * One row rather than two, because a reader choosing a picture is doing one thing: two would
       * have made them decide what *kind* of picture they wanted before they had chosen one, which is
       * the editor's bookkeeping showing through.
       *
       * The file is read **here** — a browser's job, and the same line `publish` draws about writing
       * one. What crosses into the model is base64, a media type, and the file's own size, which is
       * what stops every word under an image jumping down when it arrives.
       */
      /*
       * The **site's** tab picture is the same question as a block's picture — which file — so it is
       * the same control, reading whichever attribute the row names and writing through whichever
       * command it declares. A second kind for one extra row would be a second place to fix a bug.
       */
      const said = String(attrs[row.attr] ?? '');
      return (
        <span className="st-picture-row">
          <PropertyChoice
            value={isAssetRef(said) ? said : ''}
            options={[
              ...(isAssetRef(said) ? [] : [{ id: '', label: said ? '주소로 넣은 그림' : '없음' }]),
              ...data.assets.map((one) => ({ id: `${ASSET_PREFIX}${one.name}`, label: one.name }))
            ]}
            onChange={(next) =>
              run(row.command ?? 'setBlockFormat', {
                nodeIds: shown?.ids,
                [row.attr]: next || undefined
              })
            }
            ariaLabel={row.ariaLabel}
          />
          <label className="st-file">
            파일 넣기
            <input
              type="file"
              accept="image/*"
              aria-label="그림 파일 넣기"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void addPicture(editor, file, shown?.ids ?? [], row.command, row.attr);
              }}
            />
          </label>
        </span>
      );
    }

    case 'values':
      /*
       * One declared row, many on screen: how many there are is a fact about the *definition*, which
       * only the document knows. So the declaration says the shape and this draws one per question.
       */
      if (!shown) return null;
      if (shown.count > 1) return <PropertyEmpty>한 블록만 선택했을 때 값을 바꿀 수 있습니다.</PropertyEmpty>;
      if (shown.values.length === 0) return <PropertyEmpty>이 컴포넌트에는 변수가 없습니다.</PropertyEmpty>;
      return (
        <span className="st-values">
          {shown.values.map((one) => (
            <TextField
              key={one.sid}
              value={one.value}
              onCommit={(next) => run('setComponentValue', { nodeId: shown.ids[0], name: one.name, value: next })}
              ariaLabel={one.name}
            />
          ))}
        </span>
      );

    case 'question':
      /*
       * Which of the card's questions this part's words come from.
       *
       * Only drawn inside a definition, and the row above it in the group — 새 질문 — is what makes
       * the list able to grow: a picker can only ever offer what is already there, and the wall a
       * template hit was that nothing could add one.
       */
      if (!shown?.part) return null;
      return (
        <PropertyChoice
          value={shown.part.bound ?? ''}
          options={[
            { id: '', label: '연결 안 함' },
            ...shown.part.asks.map((one) => ({ id: one, label: one }))
          ]}
          onChange={(next) => run('bindPartText', { nodeId: shown.ids[0], var: next || undefined })}
          ariaLabel={row.ariaLabel}
        />
      );

    case 'varKind':
      /*
       * **What kind of thing the answer is.** The reason a price can be a number in the data and
       * still read as `월 9,900원` on the card — before this, the only way to get the words was to
       * store them, and a stored caption is a value nothing can sort.
       */
      if (!shown?.part?.bound) return null;
      return (
        <PropertyChoice
          value={shown.part.kind ?? 'text'}
          options={[
            { id: 'text', label: '글' },
            { id: 'number', label: '숫자' },
            { id: 'date', label: '날짜' },
            { id: 'color', label: '색' },
            { id: 'boolean', label: '예/아니오' },
            { id: 'choice', label: '고르기' }
          ]}
          onChange={(next) =>
            run('setComponentVar', { nodeId: shown.ids[0], name: shown.part!.bound, kind: next })
          }
          ariaLabel={row.ariaLabel}
        />
      );

    case 'varFormat': {
      /*
       * And how it reads — only where there is a reading to choose. A text variable reads as itself,
       * so the row is not drawn rather than being drawn with one option in it.
       */
      const kinds = VALUE_FORMATS[shown?.part?.kind ?? 'text'];
      if (!shown?.part?.bound || !kinds) return null;
      return (
        <PropertyChoice
          value={shown.part.format ?? ''}
          options={kinds}
          onChange={(next) =>
            run('setComponentVar', { nodeId: shown.ids[0], name: shown.part!.bound, format: next })
          }
          ariaLabel={row.ariaLabel}
        />
      );
    }

    case 'variable': {
      /*
       * The variable itself — renamed here, or taken away.
       *
       * The name, committed on Enter. Drawn only when this part is bound to something, because
       * there is no variable to rename otherwise — a heading on a page is nobody's part, and a part
       * that draws its own words has no variable behind it yet.
       *
       * The removal is the row's `with`, so it is declared as its own command rather than being a
       * button this file renders and nothing knows about.
       */
      if (!shown?.part?.bound) return null;
      const name = shown.part.bound;
      return (
        <span className="st-variable">
          <TextField
            value={name}
            onCommit={(next) =>
              next.trim() && next.trim() !== name
                ? run('setComponentVar', { nodeId: shown.ids[0], name, rename: next.trim() })
                : undefined
            }
            ariaLabel={row.ariaLabel}
          />
        </span>
      );
    }

    case 'variableRemove': {
      /*
       * And the **sentence before the removal**, which is why this is a button with words rather
       * than an icon: unbinding a part is local and undoing it is looking at it, and removing a
       * variable reaches every placement of this card on every page at once.
       *
       * The count is the honest way to say that. *3곳* is a fact; "this cannot be undone" would be a
       * lie — it is one entry in the history, deliberately.
       */
      if (!shown?.part?.bound) return null;
      const held = shown.part.bound;
      return (
        <Button
          tone="plain"
          ariaLabel={row.ariaLabel}
          title={`${held}을(를) 이 컴포넌트에서 없앱니다. 이 컴포넌트를 놓은 ${shown.part.uses}곳의 값도 함께 사라집니다.`}
          onClick={() => run('removeComponentVar', { nodeId: shown.ids[0], name: held })}
        >
          삭제
        </Button>
      );
    }

    case 'rowEdit':
      /**
       * **이 행 편집** — from the page, which is where a reader is when they want it.
       *
       * The form existed and its only door was the grid's row number, behind a dialog opened from
       * the rail: *페이지에서 Drawer 를 어떻게 열어서 편집해야 할지 모르겠어.* Somebody looking at the
       * third card of a blog index is looking at row three.
       *
       * Which row is a fact about the **drawing** — a row's sid is `${collection}~${index}` and the
       * selection carries document ids, which for every card in a list is the same collection — so
       * the board reads it at the press and hands it here. Nothing selected inside a row means no
       * button rather than a button that opens the wrong thing.
       */
      if (!atRow) {
        return <PropertyEmpty>페이지에서 목록의 한 줄을 누르면 그 행을 폼으로 고칠 수 있습니다.</PropertyEmpty>;
      }
      return (
        <Button onClick={onEditRow} data={{ 'row-edit': String(atRow.row) }}>
          {atRow.row + 1}행 편집
        </Button>
      );

    case 'cardValues':
      /*
       * Which column of the data goes into which slot of the card — the row that closes the loop.
       *
       * A list is three things and only two of them were reachable: the dataset, the card, and *this*.
       * A reader who added a 할인 column had no way to make the card show it, because the answers live
       * on the list's template placement and nothing selects a template.
       *
       * Written as `field:이름` rather than as a column id, which is the same reference this schema
       * uses everywhere: `var:` for a colour, `page:` for a link, `field:` for a value from a row.
       * A picker of the dataset's columns, because the answer is a column and typing one is a typo.
       */
      if (!shown?.card) return <PropertyEmpty>이 목록에는 반복해서 그릴 카드가 없습니다.</PropertyEmpty>;
      if (shown.card.asks.length === 0) {
        return <PropertyEmpty>{shown.card.name}에는 변수가 없습니다.</PropertyEmpty>;
      }
      return (
        <span className="st-values">
          {shown.card.asks.map((ask) => (
            <label key={ask.name} className="st-card-value">
              <span>{ask.name}</span>
              <PropertyChoice
                value={fieldNameOf(ask.value) ?? ''}
                options={[{ id: '', label: '없음' }, ...data.columns.filter((one) => one.id)]}
                onChange={(next) =>
                  run('setComponentValue', {
                    nodeId: shown.card!.template,
                    name: ask.name,
                    value: next ? `${FIELD_PREFIX}${next}` : ''
                  })
                }
                ariaLabel={`${ask.name} 변수에 넣을 컬럼`}
              />
            </label>
          ))}
        </span>
      );

    default:
      return undefined;
  }
}

/** Whether a row applies to what is selected, from what the row itself declares. */
function visible(row: SitePanelRow, attrs: Record<string, any>, count: number): boolean {
  if (row.single && count > 1) return false;
  /*
   * With `is`, the value has to be one of them; without it, there just has to be one — see `when`.
   * A page has only the first kind today; the deck needed both within a day of each other.
   */
  if (row.when) {
    const held = attrs[row.when.attr];
    if (row.when.is ? !row.when.is.includes(held) : held === undefined || held === null) return false;
  }
  return true;
}
