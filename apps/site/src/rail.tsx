import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { Button, Dialog, DialogButton, Icon, IconButton, useRevision } from '@barocss/office-ui';
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
type Panel = 'add' | 'layers' | 'pages' | 'components' | 'data';

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
  onEdit
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
}) {
  const [panel, setPanel] = useState<Panel>('add');
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
            onClick={() => setPanel(one.id)}
          >
            {one.label}
          </button>
        ))}
      </nav>

      <div className="st-rail-body">
        {panel === 'add' ? <AddPanel run={run} can={can} revision={revision} /> : null}
        {panel === 'layers' ? <LayersPanel editor={editor} doc={doc} page={page} revision={revision} /> : null}
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
  revision
}: {
  editor: Editor;
  doc: { getNode: (sid: string) => any };
  page?: string;
  revision: number;
}) {
  const rows = useMemo(() => {
    const found: { sid: string; depth: number; label: string; stype: string }[] = [];
    const walk = (sid: string, depth: number) => {
      if (depth > 12) return;
      for (const child of blocksIn(doc, sid)) {
        found.push({
          sid: child,
          depth,
          label: labelOfBlock(doc, child),
          stype: String(doc.getNode(child)?.stype)
        });
        walk(child, depth + 1);
      }
    };
    if (page) walk(page, 0);
    return found;
  }, [doc, page, revision]);

  const selected = new Set(selectedNodeIds(editor.selection) ?? []);
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
          // The indent is the structure, so it is what the row is measured by rather than decoration.
          style={{ paddingLeft: `${8 + row.depth * 12}px` }}
          onClick={(event) => select(row.sid, event.shiftKey)}
        >
          {/*
            The shape before the word. A list of forty rows is scanned rather than read, and every
            tool of this kind heads the row with what the thing *is* — `iconForBlock` is the
            document's answer to that, so the rail is not deciding it.
          */}
          <Icon name={iconForBlock(doc.getNode(row.sid))} size={13} />
          <span className="st-layer-name">{row.label}</span>
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

  return (
    <div className="st-rail-list" data-components>
      {components.map((one) => (
        <div
          key={one.id}
          className="st-rail-item st-rail-pair"
          data-component-row={one.id}
          data-current={one.id === editing ? 'true' : undefined}
        >
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
