import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { Button, useRevision } from '@barocss/office-ui';
import {
  blocksIn,
  labelOfBlock,
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
  pages,
  onPage
}: {
  editor: Editor;
  page?: string;
  pages: { sid: string; name: string; path: string }[];
  onPage: (sid: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>('add');
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
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
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(name, {
      pageId: page,
      ...payload
    });
  const can = (name: string, payload?: Record<string, unknown>) =>
    (editor as never as { canExecuteCommand?: (n: string, p?: unknown) => boolean }).canExecuteCommand?.(
      name,
      { pageId: page, ...payload }
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
        {panel === 'pages' ? <PagesPanel pages={pages} page={page} onPage={onPage} /> : null}
        {panel === 'components' ? (
          <ComponentsPanel editor={editor} doc={doc} run={run} can={can} revision={revision} />
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
  const groups: { label: string; controls: SiteControl[] }[] = [
    {
      label: '담는 것',
      controls: siteControlsIn('insert').filter((one) => one.command.startsWith('insert') && ['insertSection', 'insertRow', 'insertGrid'].includes(one.command))
    },
    {
      label: '넣는 것',
      controls: siteControlsIn('insert').filter((one) =>
        ['insertHeading', 'insertBodyText', 'insertPicture', 'insertBulletList'].includes(one.command)
      )
    }
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

  const selected = new Set(selectedNodeIds((editor as never as { selection?: never }).selection) ?? []);
  const select = (sid: string, add: boolean) => {
    const now = [...selected];
    const next = add ? (now.includes(sid) ? now.filter((one) => one !== sid) : [...now, sid]) : [sid];
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.('setNode', {
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
          <span className="st-layer-name">{row.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The pages of the site, and the address that makes each one a page of it. */
function PagesPanel({
  pages,
  page,
  onPage
}: {
  pages: { sid: string; name: string; path: string }[];
  page?: string;
  onPage: (sid: string) => void;
}) {
  return (
    <div className="st-rail-list" data-pages>
      {pages.map((one) => (
        <Button
          key={one.sid}
          className="st-rail-item"
          data={{ page: one.sid, 'page-current': one.sid === page ? 'true' : undefined }}
          title={one.path}
          onClick={() => onPage(one.sid)}
        >
          <span className="st-rail-name">{one.name}</span>
          <span className="st-rail-hint">{one.path}</span>
        </Button>
      ))}
    </div>
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
  revision
}: {
  editor: Editor;
  doc: { getNode: (sid: string) => any };
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  revision: number;
}) {
  const components = useMemo(() => {
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    const root = rootId ? doc.getNode(rootId) : undefined;
    const box = ((root?.content ?? []) as string[])
      .map((sid) => doc.getNode(sid))
      .find((child: any) => child?.stype === 'components');

    const used = new Map<string, number>();
    const walk = (sid: string, depth = 0) => {
      if (depth > 64) return;
      const node = doc.getNode(sid);
      if (!node) return;
      if (node.stype === 'instance') {
        const id = String(node.attributes?.componentId ?? '');
        used.set(id, (used.get(id) ?? 0) + 1);
      }
      for (const child of (node.content ?? []) as unknown[]) if (typeof child === 'string') walk(child, depth + 1);
    };
    if (rootId) walk(rootId);

    return ((box?.content ?? []) as string[])
      .map((sid) => doc.getNode(sid))
      .filter((one: any) => one?.stype === 'component')
      .map((one: any) => ({
        id: String(one.attributes.id),
        name: String(one.attributes.name ?? one.attributes.id),
        uses: used.get(String(one.attributes.id)) ?? 0
      }));
  }, [doc, editor, revision]);

  if (components.length === 0) return <p className="st-rail-note">아직 정의가 없습니다.</p>;

  return (
    <div className="st-rail-list" data-components>
      {components.map((one) => (
        <button
          key={one.id}
          type="button"
          className="st-rail-item"
          data-component={one.id}
          title={`${one.name}을(를) 이 페이지에 놓습니다`}
          disabled={!can('insertPlacement', { componentId: one.id })}
          onClick={() => run('insertPlacement', { componentId: one.id })}
        >
          <span className="st-rail-name">{one.name}</span>
          <span className="st-rail-hint">{one.uses}곳</span>
        </button>
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
  const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
  const [design, setDesign] = useState<string>('');

  const { datasets, components } = useMemo(() => {
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
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

  if (datasets.length === 0) return <p className="st-rail-note">아직 데이터가 없습니다.</p>;

  return (
    <>
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
          <button
            key={one.name}
            type="button"
            className="st-rail-item"
            data-dataset={one.name}
            title={one.fields.join(' · ')}
            disabled={!can('insertDataList', { source: one.name, componentId: chosen })}
            onClick={() => run('insertDataList', { source: one.name, componentId: chosen })}
          >
            <span className="st-rail-name">{one.label}</span>
            <span className="st-rail-hint">{one.rows}행</span>
          </button>
        ))}
      </section>
      <p className="st-rail-note">디자인 하나에 행 하나씩. 문서에는 배치 하나만 들어갑니다.</p>
    </>
  );
}
