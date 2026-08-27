import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { Button, Dialog, DialogButton, Icon, IconButton, useRevision, TextField } from '@barocss/office-ui';
import { DataEditor } from './data-editor';
import {
  blocksIn,
  definitionsOf,
  iconForBlock,
  labelOfBlock,
  linksTo,
  siteControlsIn,
  type SiteControl
} from '@barocss/office-site';

/**
 * The left side of the window: **one rail, several panels**.
 *
 * ## Why a rail and not a list
 *
 * It was a layer list and nothing else, and the question that found the gap was the plainest one a
 * reader can ask: *where do I add a heading?* Nowhere. The toolbar offered three kinds of container
 * and no way to put anything in them, so a reader could arrange an empty page beautifully.
 *
 * Every builder of this kind answers it the same way, and the answer is not "more toolbar buttons":
 * the left side holds several panels and a reader picks which question they are asking.
 *
 * - **추가** — what a page is made of. Chosen by *what it is*, which is why these are a list of
 *   blocks rather than a row of icons: there are more of them than a toolbar has room for, and a
 *   reader looks for 제목 rather than for a button that makes one.
 * - **구성** — what this page holds, which is the only place an empty stack or a block behind
 *   another block can be reached at all.
 * - **페이지** — the pages of the site. A site is more than one page, and the address is what makes
 *   each one a page of it.
 * - **컴포넌트** — the definitions the document holds, and how many places use each. Placing one is
 *   the same gesture as adding a heading, which is why it is on the same rail.
 * - **데이터** — the datasets, their columns and how many rows they have. Making a list needs a
 *   dataset *and* a definition, so this is where both are chosen at once.
 *
 * ## What it does not do
 *
 * Decide anything. Every row runs a command and every command says whether it can run, so a greyed
 * row is greyed because the model said no — the same contract the ribbon has, for the same reason: a
 * rule kept in a panel is a rule the keyboard does not follow.
 */
export type Panel = 'add' | 'layers' | 'pages' | 'components' | 'data';

const PANELS: { id: Panel; label: string }[] = [
  { id: 'add', label: '추가' },
  { id: 'layers', label: '구성' },
  { id: 'pages', label: '페이지' },
  { id: 'components', label: '컴포넌트' },
  { id: 'data', label: '데이터' }
];

export function Rail({
  editor,
  page,
  insertRoot,
  pages,
  onPage,
  editing,
  onEdit,
  panel,
  onPanel
}: {
  editor: Editor;
  /** What the list walks from — the page, or the definition, so its own part is a row. */
  page?: string;
  /**
   * What a new block lands **in**, which is not always what the list walks from.
   *
   * On a page they are the same node. Inside a definition they are not: the list walks from the
   * `component` so the part shows up as a row, and a block put *there* would be a paragraph among
   * the definition's declarations — which the content model refuses, silently, as a transaction that
   * does nothing.
   */
  insertRoot?: string;
  pages: { sid: string; id: string; name: string; path: string }[];
  onPage: (sid: string) => void;
  /** The definition being edited, so its row can say so. */
  editing?: string;
  onEdit: (componentId: string | undefined) => void;
  /**
   * Which list is open — the **app's**, because something outside this component points at one.
   *
   * 삽입 › 컴포넌트 놓기… opens the 컴포넌트 tab rather than running a command, because the choice
   * a placement needs (which definition) is a fact only this rail can offer. A menu that points at
   * the surface which can answer is what every 삽입 › 표 in every word processor does.
   */
  panel: Panel;
  onPanel: (panel: Panel) => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  const store = editor.dataStore;
  const doc = useMemo(() => ({ getNode: (sid: string) => store?.getNode(sid) }), [store]);

  /*
   * Every command is told which page is on screen.
   *
   * The model has no notion of "on screen" and should not grow one — so the app says it, and an
   * insert with nothing selected lands at the end of the page the reader is looking at. Without it,
   * every row in 추가 was greyed out on a freshly opened site: a panel of things a reader may not
   * have.
   */
  const run = (name: string, payload?: Record<string, unknown>) =>
    void editor.executeCommand(name, {
      pageId: insertRoot ?? page,
      ...payload
    });
  const can = (name: string, payload?: Record<string, unknown>) =>
    editor.canExecuteCommand(
      name,
      { pageId: insertRoot ?? page, ...payload }
    ) ?? false;

  return (
    <aside className="st-rail" aria-label="도구">
      <nav className="st-rail-tabs" data-rail>
        {PANELS.map((one) => (
          <button
            key={one.id}
            type="button"
            data-panel={one.id}
            data-current={panel === one.id ? 'true' : undefined}
            onClick={() => onPanel(one.id)}
          >
            {one.label}
          </button>
        ))}
      </nav>

      <div className="st-rail-body">
        {panel === 'add' ? <AddPanel run={run} can={can} revision={revision} /> : null}
        {panel === 'layers' ? <LayersPanel editor={editor} doc={doc} page={page} revision={revision} run={run} /> : null}
        {panel === 'pages' ? (
          <PagesPanel
            pages={pages}
            page={page}
            onPage={onPage}
            run={run}
            can={can}
            linksInto={(id) => {
              const rootId = editor.getRootId();
              return rootId ? linksTo({ rootId, getNode: doc.getNode } as never, id) : 0;
            }}
          />
        ) : null}
        {panel === 'components' ? (
          <ComponentsPanel
            editor={editor}
            doc={doc}
            run={run}
            can={can}
            revision={revision}
            editing={editing}
            onEdit={onEdit}
          />
        ) : null}
        {panel === 'data' ? <DataPanel editor={editor} run={run} can={can} revision={revision} /> : null}
      </div>
    </aside>
  );
}

/** What a page is made of. */
function AddPanel({
  run,
  can,
  revision
}: {
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  revision: number;
}) {
  void revision;
  /*
   * Read from the model, not restated here.
   *
   * These two groups were two arrays of command names written out in this file, and five inserts
   * were registered, working and reachable by no button — because a hard-coded array is not a claim
   * about anything and `every-command-can-be-seen` had nothing to read. A control now says whether
   * it makes a thing that holds other things or a thing that goes in one, and the next one appears
   * where it belongs by saying what it is.
   */
  const groups: { label: string; controls: SiteControl[] }[] = [
    { label: '담는 것', controls: siteControlsIn('insert').filter((one) => one.puts === 'container') },
    { label: '넣는 것', controls: siteControlsIn('insert').filter((one) => one.puts === 'block') }
  ];

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} className="st-rail-group">
          <h3>{group.label}</h3>
          {group.controls.map((one) => (
            <button
              key={one.command}
              type="button"
              className="st-rail-item"
              data-insert={one.command}
              title={one.title}
              disabled={!can(one.command)}
              onClick={() => run(one.command)}
            >
              {/*
                A picture **and** the word.

                Icon-only is unreadable at twelve entries — a reader would be guessing at four of
                them — and word-only is what this was: a column of unadorned text, which reads as a
                menu of options rather than as a palette of things. Every builder of this kind draws
                both, for the reason a palette exists: a reader picking a shape scans for the shape.
              */}
              {one.icon && (
                <span className="st-rail-icon">
                  <Icon name={one.icon} size={14} />
                </span>
              )}
              {one.makes ?? one.label}
            </button>
          ))}
        </section>
      ))}
      <p className="st-rail-note">
        고른 스택 안에 들어갑니다. 아무것도 고르지 않았으면 커서가 있는 블록 다음입니다.
      </p>
    </>
  );
}

/** What this page holds — depth-first, because that is the shape of the thing being described. */
function LayersPanel({
  editor,
  doc,
  page,
  revision,
  run
}: {
  editor: Editor;
  doc: { getNode: (sid: string) => any };
  page?: string;
  revision: number;
  /** The rail's own writer, which already tells every command which page is on screen. */
  run: (name: string, payload?: Record<string, unknown>) => void;
}) {
  const selected = new Set(selectedNodeIds(editor.selection) ?? []);

  /**
   * Which containers are **open**, and why the list starts closed.
   *
   * Measured on the sample's home page: **110 rows, 2,923 pixels of them, in a 928-pixel pane** —
   * three screens of list, every one of them expanded because there was nothing to close. A reader
   * looking for the footer scrolled past a hundred rows of things they were not looking for.
   *
   * Closed by default is what every tool of this kind does — Figma's frames, Sketch's groups,
   * Photoshop's layer sets — and the reason is this number rather than convention: a page is a tree
   * four deep, and the top of it is the only part a reader can hold in their head.
   */
  const [open, setOpen] = useState<Set<string>>(new Set());

  /**
   * And the ancestors of what is **selected**, always open.
   *
   * Which is what makes a closed list still useful: a reader clicks a card on the canvas and the
   * list reveals where it lives, rather than showing a closed band and leaving them to guess which
   * one to open. Every tool does this and it is the half that is easy to leave out.
   */
  const revealed = useMemo(() => {
    const found = new Set<string>();
    for (const sid of selected) {
      let at = doc.getNode(sid)?.parentId;
      for (let hop = 0; typeof at === 'string' && hop < 16; hop += 1) {
        found.add(at);
        at = doc.getNode(at)?.parentId;
      }
    }
    return found;
    // The selection is the input; `revision` is what says the document moved under it.
  }, [doc, editor.selection, revision]);

  /**
   * Whether the whole tree **fits on a screen**, in which case none of this applies.
   *
   * Closed-by-default is an answer to 110 rows; it is not an answer to two. A reader who opens the
   * button definition — a stack with a word in it — and is shown one closed row has been made to
   * press a triangle to see a thing they could have been shown. The board's root changes when a
   * definition is being edited, so this is the ordinary case rather than an edge one.
   *
   * `SMALL` is the pane, measured: 928 pixels tall and a row is 27, so a little over thirty fit.
   * Twenty-four is comfortably inside that with room for the list to grow as a reader works.
   */
  const SMALL = 24;
  const whole = useMemo(() => {
    let n = 0;
    const walk = (sid: string, depth: number) => {
      if (depth > 12 || n > SMALL) return;
      for (const child of blocksIn(doc, sid)) {
        n += 1;
        walk(child, depth + 1);
      }
    };
    if (page) walk(page, 0);
    return n;
  }, [doc, page, revision]);
  const all = whole <= SMALL;

  const rows = useMemo(() => {
    const found: {
      sid: string;
      depth: number;
      label: string;
      stype: string;
      holds: boolean;
      shown: boolean;
      hidden: boolean;
      locked: boolean;
    }[] = [];
    const walk = (sid: string, depth: number) => {
      if (depth > 12) return;
      for (const child of blocksIn(doc, sid)) {
        const holds = blocksIn(doc, child).length > 0;
        const shown = holds && (all || open.has(child) || revealed.has(child));
        const attrs = (doc.getNode(child)?.attributes ?? {}) as Record<string, unknown>;
        found.push({
          sid: child,
          depth,
          label: labelOfBlock(doc, child),
          stype: String(doc.getNode(child)?.stype),
          holds,
          shown,
          hidden: attrs.visible === false,
          locked: attrs.locked === true
        });
        if (shown) walk(child, depth + 1);
      }
    };
    if (page) walk(page, 0);
    return found;
  }, [doc, page, revision, open, revealed, all]);

  /**
   * **Where a dragged row would land** — a parent and a place in it.
   *
   * ## Why `useStackOrder` is not the tool
   *
   * `office-ui` has one, and it assumes what the deck's list is: a flat row of shapes in one
   * container, all the same height, so a drop is `(pointerY - top) / rowHeight`. A page's list is a
   * **tree** — rows at four depths with different parents — and index arithmetic cannot say which
   * parent, which is the whole question.
   *
   * ## The thirds
   *
   * The rule every tree list uses, and why it is that rule: a row is 27 pixels and there are three
   * things a reader can mean by dropping on one. The top third is *before this*, the bottom third is
   * *after this*, and the middle is *inside this* — offered only by a row that can hold something,
   * because a drop into a paragraph has no meaning and a target that sometimes lies is worse than
   * one that is smaller.
   *
   * Reparenting by **indent** — drag sideways to change depth — is the other convention, and it is
   * the one that needs a tutorial. The thirds are visible: a line between two rows is a place, a
   * highlighted row is a container.
   */
  const [drag, setDrag] = useState<{
    sid: string;
    over?: string;
    where?: 'before' | 'after' | 'into';
  }>();

  const dropAt = (holds: boolean, y: number, box: DOMRect): 'before' | 'after' | 'into' => {
    const third = box.height / 3;
    if (holds && y > box.top + third && y < box.bottom - third) return 'into';
    return y < box.top + box.height / 2 ? 'before' : 'after';
  };

  /** And what that means to the document: which parent, and at which index. */
  const landing = (): { nodeId: string; parentId: string; index: number } | undefined => {
    if (!drag?.over || !drag.where || drag.over === drag.sid) return undefined;
    const target = doc.getNode(drag.over);
    if (!target) return undefined;

    if (drag.where === 'into') {
      // At the end of what it holds, which is what a reader dropping *onto* a container means.
      return { nodeId: drag.sid, parentId: drag.over, index: blocksIn(doc, drag.over).length };
    }

    const parentId = String(target.parentId ?? '');
    const kids = blocksIn(doc, parentId);
    const at = kids.indexOf(drag.over);
    if (at < 0) return undefined;
    /*
     * Moving **down inside one parent** loses a place as the row leaves it, so the index a reader
     * pointed at is one too many. Measured as exactly that off-by-one everywhere this has ever been
     * written; said here rather than left to a `+1` nobody can explain a year later.
     */
    const from = kids.indexOf(drag.sid);
    const raw = drag.where === 'before' ? at : at + 1;
    return { nodeId: drag.sid, parentId, index: from >= 0 && from < raw ? raw - 1 : raw };
  };

  /**
   * The drag ends **wherever the pointer is let go**, including outside the list.
   *
   * On the window rather than on a row, because a reader who drags past the last row and releases
   * over the canvas has still finished a gesture — and a drag that never ends leaves every row
   * marked and the next click doing something nobody asked for.
   *
   * `landing` is read here rather than remembered, so the drop is computed from the marker the
   * reader could actually see.
   */
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const where = landing();
      setDrag(undefined);
      if (where) run('moveBlockInto', where);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
    // `drag` is the whole input: a new target means a new landing.
  }, [drag]);

  const select = (sid: string, add: boolean) => {
    const now = [...selected];
    const next = add ? (now.includes(sid) ? now.filter((one) => one !== sid) : [...now, sid]) : [sid];
    void editor.executeCommand('setNode', {
      nodeIds: next
    });
  };

  if (rows.length === 0) return <p className="st-rail-note">이 페이지에는 아직 아무것도 없습니다.</p>;

  return (
    <div className="st-layers-list" data-layers>
      {rows.map((row) => (
        <button
          key={row.sid}
          type="button"
          className="st-layer"
          data-layer={row.sid}
          data-stype={row.stype}
          data-selected={selected.has(row.sid) ? 'true' : undefined}
          data-hidden={row.hidden ? 'true' : undefined}
          data-locked={row.locked ? 'true' : undefined}
          data-dragging={drag?.sid === row.sid ? 'true' : undefined}
          data-drop={drag?.over === row.sid && drag.sid !== row.sid ? drag.where : undefined}
          /*
           * The whole row is the grip, which is what a list of names wants: a separate handle would
           * be a sixth thing in a 27-pixel row, and a reader dragging a *name* is already pointing at
           * the thing they mean. A press that does not move stays a click — `select` runs on `click`,
           * which a drag never becomes.
           */
          onPointerDown={(event) => {
            /*
             * The row **is** a `<button>`, so `closest('button')` finds itself and a naive guard
             * refused every drag — measured as a drag that never started. What has to be excluded is
             * only what is *inside* it: the eye, the padlock, the triangle.
             */
            const inner = (event.target as HTMLElement).closest('button, [data-twist]');
            if (inner && inner !== event.currentTarget) return;
            /*
             * **No pointer capture.** It was the first shape and it is exactly wrong here: capture
             * sends every later `pointermove` to the row that was grabbed, so no other row's handler
             * ever fires and the drop marker never appeared. What ends the drag is a window listener
             * instead — see the effect below — which also survives a pointer that leaves the list.
             */
            setDrag({ sid: row.sid });
          }}
          onPointerMove={(event) => {
            if (!drag || drag.sid === row.sid) return;
            const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const where = dropAt(row.holds, event.clientY, box);
            if (drag.over !== row.sid || drag.where !== where) {
              setDrag({ sid: drag.sid, over: row.sid, where });
            }
          }}

          // The indent is the structure, so it is what the row is measured by rather than decoration.
          style={{ paddingLeft: `${8 + row.depth * 12}px` }}
          onClick={(event) => select(row.sid, event.shiftKey)}
        >
          {/*
            The disclosure, and a **space where one would be** on a row that holds nothing.

            Without the space the icons of a container and of a block sit at different distances from
            the indent, and a list four deep reads as two lists interleaved. It is a `span` rather
            than a nested `<button>` because a button inside a button is not valid HTML and the
            browser's own recovery from it is to close the outer one early — the whole row after it
            would stop being clickable.
          */}
          <span
            className="st-layer-twist"
            data-twist={row.holds ? (row.shown ? 'open' : 'closed') : undefined}
            role={row.holds ? 'button' : undefined}
            aria-label={row.holds ? `${row.label} ${row.shown ? '접기' : '펼치기'}` : undefined}
            aria-expanded={row.holds ? row.shown : undefined}
            onClick={
              row.holds
                ? (event) => {
                    // The row underneath means *select me*, and this means *show what is in me*.
                    event.stopPropagation();
                    setOpen((was) => {
                      const next = new Set(was);
                      if (row.shown) next.delete(row.sid);
                      else next.add(row.sid);
                      return next;
                    });
                  }
                : undefined
            }
          >
            {row.holds && <Icon name={row.shown ? 'disclosed' : 'collapsed'} size={12} />}
          </span>
          {/*
            The shape before the word. A list of forty rows is scanned rather than read, and every
            tool of this kind heads the row with what the thing *is* — `iconForBlock` is the
            document's answer to that, so the rail is not deciding it.
          */}
          <Icon name={iconForBlock(doc.getNode(row.sid))} size={13} />
          <span className="st-layer-name">{row.label}</span>
          {/*
            The eye and the padlock — **drawn only when they say something**, or on hover.

            Twelve rows each carrying two grey glyphs is a column of noise a reader reads past, and
            the state a reader needs to see at a glance is the *unusual* one: this block is hidden,
            this one is locked. So a row that is neither shows them under the pointer and a row that
            is either shows them always. Which is what the deck's layer panel already does, and it
            records the same reason: *"drawing the act would put a crossed-out eye on all twelve,
            which reads as twelve hidden layers"*.
          */}
          <span
            className="st-layer-acts"
            data-state={row.hidden || row.locked ? 'said' : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <IconButton
              size="sm"
              label={`${row.label} ${row.hidden ? '보이기' : '숨기기'}`}
              pressed={row.hidden}
              onClick={() => run('setBlockFormat', { nodeIds: [row.sid], visible: row.hidden })}
            >
              <Icon name={row.hidden ? 'hide' : 'shown'} size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label={`${row.label} ${row.locked ? '잠금 풀기' : '잠그기'}`}
              pressed={row.locked}
              onClick={() => run('setBlockFormat', { nodeIds: [row.sid], locked: !row.locked })}
            >
              <Icon name={row.locked ? 'locked' : 'unlocked'} size={13} />
            </IconButton>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The pages of the site, the address that makes each one a page of it, and the four acts.
 *
 * ## Why the acts are here rather than on the toolbar
 *
 * A page is not a selection. Nothing on the canvas *is* a page — the boards draw one, the panel
 * describes the one being drawn when nothing is selected — so a toolbar button acting on "the page"
 * would be acting on something a reader cannot point at. This list is where a page is a thing with a
 * row, which is why it is also where a page can be copied, moved and taken away.
 *
 * The same argument the data grid makes about a dataset, and the deck's slide strip about a slide.
 *
 * ## And why removing one asks first
 *
 * Because it breaks links, and silently: a link into a page that is gone draws as ordinary words.
 * `linkFaults` is the report; this is the moment before, where the number is still preventable.
 */
function PagesPanel({
  pages,
  page,
  onPage,
  run,
  can,
  linksInto
}: {
  pages: { sid: string; id: string; name: string; path: string }[];
  page?: string;
  onPage: (sid: string) => void;
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  /** How many links point at a page — asked of the document, because only it knows. */
  linksInto: (id: string) => number;
}) {
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const doomed = pages.find((one) => one.sid === removing);
  const breaks = doomed ? linksInto(doomed.id) : 0;

  return (
    <>
      {doomed ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(undefined);
          }}
          title={`${doomed.name} 삭제`}
          /*
            The number is the whole point of asking. "링크가 끊어집니다" is a warning a reader learns
            to click through; "링크 4개가 끊어집니다" is a fact they can weigh, and when it is zero
            the dialog says so and the decision is easy.
          */
          description={
            breaks > 0
              ? `이 페이지를 가리키는 링크 ${breaks}개가 끊어집니다. 끊어진 링크는 그냥 글자로 보입니다.`
              : '이 페이지를 가리키는 링크는 없습니다.'
          }
          footer={
            <>
              <DialogButton variant="secondary" onClick={() => setRemoving(undefined)}>
                취소
              </DialogButton>
              <DialogButton
                variant="primary"
                data-page-remove-confirm={doomed.sid}
                onClick={() => {
                  run('removePage', { nodeId: doomed.sid });
                  setRemoving(undefined);
                }}
              >
                삭제
              </DialogButton>
            </>
          }
        >
          <p className="st-rail-note">{doomed.path}</p>
        </Dialog>
      ) : null}

      <div className="st-rail-list" data-pages>
        {pages.map((one, at) => (
          <div key={one.sid} className="st-rail-row" data-page-row={one.sid}>
            <button
              type="button"
              className="st-rail-item"
              data-page={one.sid}
              data-page-current={one.sid === page ? 'true' : undefined}
              title={one.path}
              onClick={() => onPage(one.sid)}
            >
              <span className="st-rail-name">{one.name}</span>
              <span className="st-rail-hint">{one.path}</span>
            </button>
            {/*
              Up, rather than a drag: a rail row is 28px tall and a drag between two of them is a
              gesture that needs a drop indicator, an autoscroll and a test that can hold a pointer
              down. The order of five pages is a thing a reader changes twice in a site's life.
            */}
            <IconButton
              label={`${one.name} 위로`}
              disabled={!can('movePage', { nodeId: one.sid, to: at - 1 })}
              onClick={() => run('movePage', { nodeId: one.sid, to: at - 1 })}
              data={{ 'page-up': one.sid }}
            >
              <Icon name="previous" size={13} />
            </IconButton>
            <IconButton
              label={`${one.name} 복제`}
              disabled={!can('duplicatePage', { nodeId: one.sid })}
              onClick={() => run('duplicatePage', { nodeId: one.sid })}
              data={{ 'page-duplicate': one.sid }}
            >
              <Icon name="duplicate" size={13} />
            </IconButton>
            <IconButton
              label={`${one.name} 삭제`}
              disabled={!can('removePage', { nodeId: one.sid })}
              /*
               * The one act in this product that asks before it happens, and the reason is that what
               * it costs is **not on screen**: the page is, and the links into it from every other
               * page are not. A reader who deletes 제품 has unlinked the navigation of five pages,
               * and nothing about the drawing would have told them.
               */
              onClick={() => setRemoving(one.sid)}
              data={{ 'page-remove': one.sid }}
            >
              <Icon name="delete" size={13} />
            </IconButton>
          </div>
        ))}
      </div>
      {/*
        Above nothing and below everything: a site always has at least one page, so this list is
        never empty and the button never has to double as the empty case — unlike the datasets'.
      */}
      <Button onClick={() => run('insertPage', { nodeId: page })} data={{ 'page-add': 'true' }}>
        새 페이지
      </Button>
    </>
  );
}

/**
 * The definitions the document holds, and how many places use each.
 *
 * The count is the fact that makes a component list worth having: a definition used in twelve places
 * is a decision, and one used nowhere is a thing to delete. It is also what tells a reader that
 * editing this changes twelve pages.
 */
function ComponentsPanel({
  editor,
  doc,
  run,
  can,
  revision,
  editing,
  onEdit
}: {
  editor: Editor;
  doc: { getNode: (sid: string) => any };
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  revision: number;
  editing?: string;
  onEdit: (componentId: string | undefined) => void;
}) {
  /*
   * Read from the model rather than walked here.
   *
   * It *was* walked here — the counting, the library lookup, all of it in a React component — which
   * is exactly the code that cannot be tested without a browser. `definitionsOf` is the same answer
   * in `office-site`, with `components.test.ts` holding it.
   */
  const components = useMemo(() => {
    const rootId = editor.getRootId();
    return rootId ? definitionsOf({ rootId, getNode: doc.getNode }) : [];
  }, [doc, editor, revision]);

  if (components.length === 0) return <p className="st-rail-note">아직 컴포넌트가 없습니다.</p>;

  /**
   * The definition whose name a reader is typing, if any.
   *
   * A field that **replaces the row** rather than a dialog: renaming is the smallest edit there is,
   * and a modal for it is three gestures where one would do. Escape puts the row back, which is the
   * rule every list in this suite follows for the same reason.
   */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | undefined>();

  return (
    <div className="st-rail-list" data-components>
      {components.map((one) => (
        <div
          key={one.id}
          className="st-rail-item st-rail-pair"
          data-component-row={one.id}
          data-current={one.id === editing ? 'true' : undefined}
        >
          {renaming?.id === one.id ? (
            /*
             * The field **replaces the row** rather than opening a dialog: renaming is the smallest
             * edit there is, and a modal for it is three gestures where one would do. `TextField`
             * commits on blur and on Enter and puts the old value back on Escape, which is the rule
             * every field in this suite already follows.
             */
            <TextField
              value={renaming.name}
              ariaLabel={`${one.name} 새 이름`}
              onCommit={(next: string) => {
                setRenaming(undefined);
                if (next.trim() && next.trim() !== one.name) {
                  run('setComponentInfo', { componentId: one.id, name: next.trim() });
                }
              }}
            />
          ) : (
            <>
          {/* Placing is the common act, so it is the row. */}
          <button
            type="button"
            className="st-rail-main"
            data-component={one.id}
            title={`${one.name}을(를) 여기에 놓습니다`}
            disabled={!can('insertPlacement', { componentId: one.id })}
            onClick={() => run('insertPlacement', { componentId: one.id })}
          >
            <span className="st-rail-name">{one.name}</span>
            <span className="st-rail-hint">{one.uses}곳</span>
          </button>
          {/*
            And editing is its own control, because it is the act with consequences: opening this
            changes every place that uses it, which is what the count beside it is for.
          */}
          <button
            type="button"
            className="st-rail-side"
            data-edit-component={one.id}
            title={`${one.name} 컴포넌트를 엽니다 — ${one.uses}곳이 함께 바뀝니다`}
            onClick={() => onEdit(one.id === editing ? undefined : one.id)}
          >
            편집
          </button>
          {/*
            And the two the library never had: a **name** and a way out of it.
            
            Measured against the other two lists this rail draws — a page can be made, renamed,
            duplicated and removed; a dataset can be made, renamed and removed; a component could
            only be made. One shape, three answers, and this is the list that only grew.
          */}
          <IconButton
            size="sm"
            label={`${one.name} 이름 바꾸기`}
            onClick={() => setRenaming({ id: one.id, name: one.name })}
          >
            <Icon name="edit" size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label={`${one.name} 삭제`}
            disabled={one.uses > 0}
            /*
             * The **reason**, not a grey button. `removeComponent` refuses while anything places it —
             * a placement whose definition has gone draws nothing, and nothing is what a reader would
             * be looking at while wondering what they broke — and a disabled control that says
             * nothing is the commonest small cruelty in a tool.
             */
            title={one.uses > 0 ? `${one.uses}곳에서 쓰는 중이라 지울 수 없습니다` : undefined}
            onClick={() => run('removeComponent', { componentId: one.id })}
          >
            <Icon name="delete" size={13} />
          </IconButton>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The datasets, their columns and how many rows they hold.
 *
 * Making a list needs a dataset **and** a definition — a list with no data draws nothing, and a list
 * with nothing to draw for each row draws nothing either — so both are chosen here, at once.
 */
function DataPanel({
  editor,
  run,
  can,
  revision
}: {
  editor: Editor;
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  revision: number;
}) {
  const store = editor.dataStore;
  const [design, setDesign] = useState<string>('');
  /** Which dataset's grid is open, by **name** — a sid would be stale after any edit. */
  const [editing, setEditing] = useState<string | null>(null);

  const { datasets, components } = useMemo(() => {
    const rootId = editor.getRootId();
    const root = rootId ? store?.getNode(rootId) : undefined;
    const under = (holder: string) =>
      (((root?.content ?? []) as string[])
        .map((sid) => store?.getNode(sid))
        .find((child: any) => child?.stype === holder)?.content ?? []) as string[];

    return {
      datasets: under('resources')
        .map((sid) => store?.getNode(sid))
        .filter((one: any) => one?.stype === 'dataset')
        .map((one: any) => ({
          sid: String(one.sid),
          name: String(one.attributes.name),
          label: String(one.attributes.label ?? one.attributes.name),
          fields: (one.attributes.fields ?? []) as string[],
          rows: ((one.attributes.records ?? []) as unknown[]).length
        })),
      components: under('components')
        .map((sid) => store?.getNode(sid))
        .filter((one: any) => one?.stype === 'component')
        .map((one: any) => ({ id: String(one.attributes.id), name: String(one.attributes.name ?? one.attributes.id) }))
    };
  }, [editor, store, revision]);

  const chosen = design || components[0]?.id || '';

  /*
   * A dataset was something only TypeScript could write until now, so "아직 데이터가 없습니다" was
   * the end of the road: a reader who opened an empty site could look at this panel and do nothing
   * with it. The button is the way out of that, and it is the same button whether there are none or
   * ten — which is why it is above the list rather than inside the empty case.
   */
  const make = () => {
    const taken = new Set(datasets.map((one) => one.name));
    let name = '새 데이터';
    for (let n = 2; taken.has(name); n += 1) name = `새 데이터 ${n}`;
    run('insertDataset', { name });
    // Straight into the grid: making one and then having to find it is two gestures for one act.
    // Held by name, so this works before the panel has redrawn and found the new node.
    setEditing(name);
  };

  return (
    <>
      {/*
        The grid opens over the page — see `data-editor.tsx`. Held by **name** rather than by sid so
        it survives the redraw that follows every edit made inside it.
      */}
      <DataEditor
        editor={editor}
        run={run}
        can={can}
        revision={revision}
        sid={datasets.find((one) => one.name === editing)?.sid ?? null}
        onClose={() => setEditing(null)}
      />

      <section className="st-rail-group">
        <h3>어떤 디자인으로</h3>
        <div className="st-rail-list">
          {components.map((one) => (
            <button
              key={one.id}
              type="button"
              className="st-rail-item"
              data-design={one.id}
              data-current={one.id === chosen ? 'true' : undefined}
              onClick={() => setDesign(one.id)}
            >
              {one.name}
            </button>
          ))}
        </div>
      </section>

      <section className="st-rail-group">
        <h3>어떤 데이터를</h3>
        {datasets.map((one) => (
          /*
            One row, two acts on the same thing: the name makes a list from it, and the pencil opens
            its rows. They were two lists of the same names for a moment, which reads as a bug —
            and the two are not equally available, which is the other reason they cannot be one
            button: making a list needs a design chosen first, and editing the data never does.
          */
          <div key={one.name} className="st-rail-row">
            <button
              type="button"
              className="st-rail-item"
              data-dataset={one.name}
              title={one.fields.join(' · ')}
              disabled={!can('insertDataList', { source: one.name, componentId: chosen })}
              onClick={() => run('insertDataList', { source: one.name, componentId: chosen })}
            >
              <span className="st-rail-name">{one.label}</span>
              <span className="st-rail-hint">
                {one.fields.length}열 · {one.rows}행
              </span>
            </button>
            <IconButton
              label={`${one.label} 데이터 고치기`}
              onClick={() => setEditing(one.name)}
              data={{ 'dataset-edit': one.name }}
            >
              <Icon name="edit" size={13} />
            </IconButton>
          </div>
        ))}
        <Button onClick={make} data={{ 'dataset-add': 'true' }}>
          새 데이터
        </Button>
      </section>
      <p className="st-rail-note">카드 하나로 행 전체를 그립니다. 문서에는 카드 하나만 저장됩니다.</p>
    </>
  );
}
