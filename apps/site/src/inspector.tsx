import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  ChoiceSelect,
  PropertyEmpty,
  PropertyPanel,
  PropertySheet,
  PropertyTabs,
  TextField,
  useRevision,
  type ThemeSwatch
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  attrsAt,
  kindOfBlock,
  labelOfBlock,
  overriddenAt,
  sitePanelGroups,
  type BreakpointId,
  type SitePanelRow,
  type SitePanelTab
} from '@barocss/office-site';

/** 15 twips to the CSS pixel: the document keeps twips and a reader is shown pixels. */
const PX = 15;

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
  page
}: {
  editor: Editor;
  /** The width being edited. The widest is the page itself; the others say only what differs. */
  at: BreakpointId;
  onAt: (at: BreakpointId) => void;
  /** The page on screen, so the panel has something to say when nothing is selected. */
  page?: string;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const [tab, setTab] = useState<SitePanelTab>('block');

  const store = editor.dataStore;
  const node = (sid: string | undefined) => (sid ? store?.getNode(sid) : undefined);
  /** What the document's schema says a node type has — see `Groups`. */
  const schema = (store as never as { getActiveSchema?: () => any })?.getActiveSchema?.();

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
    return {
      ids,
      count: nodes.length,
      stype: String(first.stype),
      label: labelOfBlock(doc, ids[0]),
      /** Resolved for the width being edited — what the reader is looking at. */
      attrs: attrsAt(first.attributes ?? {}, at),
      /** And unresolved, because a colour that *follows a token* must not be shown as a hex. */
      raw: (first.attributes ?? {}) as Record<string, any>,
      overridden: new Set(overriddenAt(first.attributes ?? {}, at)),
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
  }, [editor, at, revision, store]);

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
        fields: (one.attributes.fields ?? []) as string[],
        rows: ((one.attributes.records ?? []) as unknown[]).length
      }));

    const chosen = datasets.find((one) => one.name === shown?.attrs.source);
    return {
      datasets: datasets.map((one) => ({ id: one.name, label: `${one.label} (${one.rows})` })),
      columns: [{ id: '', label: '없음' }, ...(chosen?.fields ?? []).map((f) => ({ id: f, label: f }))]
    };
  }, [editor, revision, store, shown?.attrs.source]);

  const run = (name: string, payload: Record<string, unknown>) => void editor.executeCommand(name, payload);

  /**
   * What a row does when it is changed.
   *
   * One place, and it reads the row's own `command` rather than assuming `setBlockFormat` — which is
   * what lets 페이지 › 주소 and 값 be ordinary rows instead of two hand-written groups.
   */
  const write = (row: SitePanelRow, value: unknown) => {
    if (!row.command) return;
    if (row.command === 'setPageInfo') run('setPageInfo', { nodeId: page, [row.attr]: value });
    else run(row.command, { nodeIds: shown?.ids, at, [row.attr]: value });
  };

  const tabs: { id: SitePanelTab; label: string }[] = [
    { id: 'block', label: '블록' },
    { id: 'style', label: '모양' },
    ...(shown?.stype === 'collection' ? ([{ id: 'data', label: '데이터' }] as const) : []),
    ...(shown?.stype === 'instance' ? ([{ id: 'values', label: '값' }] as const) : [])
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
              onClick={() => onAt(one.id)}
            >
              {one.label[0]}
            </button>
          ))}
        </div>
      }
    >
      {!shown ? (
        /*
         * The page, when nothing is selected — where every builder of this kind puts it, and the
         * only place a page's **address** can be edited at all: a page is the board rather than a
         * block, so it is never in a selection (`SELECTABLE` leaves it out on purpose).
         */
        <Groups
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
          empty="페이지에서 블록을 선택하세요. 한 번 누르면 바깥쪽 블록, 두 번 누르면 그 안쪽입니다."
          after="블록을 선택하면 그 블록의 속성이 여기에 나옵니다."
        />
      ) : (
        <>
          <PropertyTabs
            tabs={tabs}
            active={tab}
            onChange={(id) => setTab(id as SitePanelTab)}
          />
          <Groups
            stype={shown.stype}
            tab={tab}
            shown={shown}
            at={at}
            tokens={tokens}
            data={data}
            schema={schema}
            write={write}
            run={run}
          />
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
function Groups({
  stype,
  tab,
  shown,
  at,
  page,
  tokens,
  data,
  schema,
  write,
  run,
  empty,
  after
}: {
  stype: string | undefined;
  tab: SitePanelTab;
  shown: Shown | null;
  at: BreakpointId;
  page?: any;
  tokens: ThemeSwatch[];
  data: { datasets: { id: string; label: string }[]; columns: { id: string; label: string }[] };
  /** The document's schema, which is what decides where a row appears. */
  schema?: { getNodeType?: (stype: string) => { attrs?: Record<string, unknown> } | undefined };
  write: (row: SitePanelRow, value: unknown) => void;
  run: (name: string, payload: Record<string, unknown>) => void;
  /** Shown instead of the groups when there is nothing to draw them about. */
  empty?: string;
  /** Shown under them, when a reader could be told what to do next. */
  after?: string;
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

  const attrs = shown?.attrs ?? (page?.attributes as Record<string, any>) ?? {};
  const count = shown?.count ?? 1;
  const groups = sitePanelGroups(stype, tab, declares)
    .map((group) => ({ ...group, rows: group.rows.filter((row) => visible(row, attrs, count)) }))
    .filter((group) => group.rows.length > 0);

  return (
    <>
      <PropertySheet
        groups={groups}
        /*
         * Pixels out, twips in — and it is **here** rather than in the sheet because 15 twips to the
         * pixel is a fact about this document model, not about how a number field behaves. The sheet
         * asks the product what the value is; a sheet that converted would be a second place that
         * knows what a document means by a length.
         */
        value={(row) => {
          const held = attrs[row.attr];
          if (row.unit !== 'px' || held === undefined) return held;
          return Math.round(Number(held) / PX);
        }}
        /* A colour that follows a token must not be shown as the hex it resolves to. */
        raw={(row) => (shown?.raw ?? attrs)[row.attr]}
        marked={(row) => shown?.overridden.has(row.attr) === true}
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
        onWrite={(row, next) => write(row, commit(row, next))}
        render={(row) => own(row, { attrs, shown, at, data, run })}
      />
      {after ? <PropertyEmpty>{after}</PropertyEmpty> : null}
    </>
  );
}

/**
 * What a row's value becomes on the way into the document.
 *
 * Pixels to twips, and "nothing" for a length that has no natural zero: a `minWidth` of 0 and no
 * `minWidth` draw the same and mean different things — one is a decision — and `undefined` is how a
 * reader takes a value back at this width.
 */
function commit(row: SitePanelRow, next: unknown): unknown {
  if (row.control !== 'number') return row.control === 'toggle' && next !== true ? undefined : next;
  const floor = row.min ?? 0;
  const kept = Math.max(floor, row.unit === 'px' ? Number(next) : Math.round(Number(next)));
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
function own(
  row: SitePanelRow,
  ctx: {
    attrs: Record<string, any>;
    shown: Shown | null;
    at: BreakpointId;
    data: { datasets: { id: string; label: string }[]; columns: { id: string; label: string }[] };
    run: (name: string, payload: Record<string, unknown>) => void;
  }
): React.ReactNode | undefined {
  const { attrs, shown, at, data, run } = ctx;

  switch (row.control) {
    case 'static':
      return <span className="st-kind">{kindOfBlock(shown?.stype ?? '') ?? shown?.stype}</span>;

    case 'note':
      // Only worth saying when it is true: at the widest width every value is the page's own.
      if (at === 'desktop') return null;
      return (
        <span className="st-at-note">
          {BREAKPOINTS.find((one) => one.id === at)?.label}에서 바꾼 값만 이 폭에 적용됩니다.
        </span>
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
        <ChoiceSelect
          value={String(attrs[row.attr] ?? '')}
          options={row.control === 'dataset' ? data.datasets : data.columns}
          onChange={(next) => run('setBlockFormat', { nodeIds: shown?.ids, at, [row.attr]: next || undefined })}
          ariaLabel={row.ariaLabel}
          disabled={row.needs !== undefined && !attrs[row.needs]}
        />
      );

    case 'values':
      /*
       * One declared row, many on screen: how many there are is a fact about the *definition*, which
       * only the document knows. So the declaration says the shape and this draws one per question.
       */
      if (!shown) return null;
      if (shown.count > 1) return <PropertyEmpty>한 블록만 선택했을 때 값을 바꿀 수 있습니다.</PropertyEmpty>;
      if (shown.values.length === 0) return <PropertyEmpty>이 정의는 묻는 것이 없습니다.</PropertyEmpty>;
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

    default:
      return undefined;
  }
}

/** Whether a row applies to what is selected, from what the row itself declares. */
function visible(row: SitePanelRow, attrs: Record<string, any>, count: number): boolean {
  if (row.single && count > 1) return false;
  if (row.when && !row.when.is.includes(attrs[row.when.attr])) return false;
  return true;
}
