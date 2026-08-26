import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ColorField,
  NumberField,
  PropertyEmpty,
  PropertyGroup,
  PropertyPanel,
  PropertyRow,
  PropertyTabs,
  PropertyToggle,
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
 * The declaration, drawn.
 *
 * Groups in the order `panel-model.ts` lists them, rows in the order inside each — so moving a row
 * in that file moves it on screen, and there is no second place that decides what the panel has.
 */
function Groups({
  stype,
  tab,
  shown,
  at,
  page,
  tokens,
  data,
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
  write: (row: SitePanelRow, value: unknown) => void;
  run: (name: string, payload: Record<string, unknown>) => void;
  /** Shown instead of the groups when there is nothing to draw them about. */
  empty?: string;
  /** Shown under them, when a reader could be told what to do next. */
  after?: string;
}) {
  if (empty && !page) return <PropertyEmpty>{empty}</PropertyEmpty>;

  const attrs = shown?.attrs ?? (page?.attributes as Record<string, any>) ?? {};
  const groups = sitePanelGroups(stype, tab).filter((group) =>
    group.rows.some((row) => visible(row, attrs, shown?.count ?? 1))
  );

  return (
    <>
      {groups.map((group) => (
        <PropertyGroup
          key={group.label}
          // The selection's group is named after what is selected, which is the one label the
          // declaration cannot hold: it is a fact about the document, not about the panel.
          label={
            group.label === '선택'
              ? shown && shown.count > 1
                ? `${shown.count}개 선택됨`
                : (shown?.label ?? group.label)
              : group.label
          }
        >
          {group.rows
            .filter((row) => visible(row, attrs, shown?.count ?? 1))
            .map((row) => (
              <Row
                key={`${row.group}.${row.attr}`}
                row={row}
                attrs={attrs}
                raw={shown?.raw ?? attrs}
                shown={shown}
                at={at}
                tokens={tokens}
                data={data}
                write={write}
                run={run}
              />
            ))}
        </PropertyGroup>
      ))}
      {after ? <PropertyEmpty>{after}</PropertyEmpty> : null}
    </>
  );
}

/** Whether a row applies to what is selected, from what the row itself declares. */
function visible(row: SitePanelRow, attrs: Record<string, any>, count: number): boolean {
  if (row.single && count > 1) return false;
  if (row.when && attrs[row.when.attr] !== row.when.is) return false;
  return true;
}

/**
 * One row: a label, and the control its kind says it is.
 *
 * The `switch` is total over `SitePanelControl` on purpose — a kind is a small closed set precisely
 * so that adding a row cannot quietly invent a control the product has never drawn before.
 */
function Row({
  row,
  attrs,
  raw,
  shown,
  at,
  tokens,
  data,
  write,
  run
}: {
  row: SitePanelRow;
  attrs: Record<string, any>;
  raw: Record<string, any>;
  shown: Shown | null;
  at: BreakpointId;
  tokens: ThemeSwatch[];
  data: { datasets: { id: string; label: string }[]; columns: { id: string; label: string }[] };
  write: (row: SitePanelRow, value: unknown) => void;
  run: (name: string, payload: Record<string, unknown>) => void;
}) {
  /** A property whose value at this width is this width's own rather than the page's. */
  const mark = shown?.overridden.has(row.attr) ? ' ·' : '';
  const label = `${row.label}${mark}`;
  const value = attrs[row.attr];
  const disabled = row.needs !== undefined && !attrs[row.needs];

  /** Pixels in the panel, twips in the document — for the rows that say they are lengths. */
  const shownNumber =
    value === undefined
      ? row.fallback === undefined
        ? null
        : Number(row.fallback)
      : row.unit === 'px'
        ? Math.round(Number(value) / PX)
        : Number(value);

  switch (row.control) {
    case 'static':
      return (
        <PropertyRow label={label}>
          <span className="st-kind">{kindOfBlock(shown?.stype ?? '') ?? shown?.stype}</span>
        </PropertyRow>
      );

    case 'note':
      // Only worth saying when it is true: at the widest width every value is the page's own.
      if (at === 'desktop') return null;
      return (
        <PropertyRow label={label}>
          <span className="st-at-note">
            {BREAKPOINTS.find((one) => one.id === at)?.label}에서 바꾼 값만 이 폭에 적용됩니다.
          </span>
        </PropertyRow>
      );

    case 'text':
      return (
        <PropertyRow label={label}>
          <TextField
            value={String(value ?? '')}
            onCommit={(next) => write(row, next || undefined)}
            ariaLabel={row.ariaLabel}
            disabled={disabled}
            placeholder={row.attr === 'name' ? (kindOfBlock(shown?.stype ?? '') ?? '') : undefined}
          />
        </PropertyRow>
      );

    case 'number':
      return (
        <PropertyRow label={label}>
          <NumberField
            value={shownNumber}
            onCommit={(next) => {
              const floor = row.min ?? 0;
              const kept = Math.max(floor, row.unit === 'px' ? next : Math.round(next));
              /*
               * Nothing rather than zero, for a length that has no natural zero. A `minWidth` of 0
               * and no `minWidth` draw the same and mean different things — one is a decision — and
               * `undefined` is how a reader takes a value back at this width.
               */
              write(row, row.fallback === undefined && kept <= 0 ? undefined : kept * (row.unit === 'px' ? PX : 1));
            }}
            ariaLabel={row.ariaLabel}
            suffix={row.unit}
            min={row.min}
            disabled={disabled}
          />
        </PropertyRow>
      );

    case 'colour':
      return (
        <PropertyRow label={label}>
          {/*
            The site's own colours beside any colour at all. Choosing one writes `var:강조` — a
            reference rather than a hex — so changing the token later changes every block that
            follows it. Read from `raw`, because a colour that follows a token must not be shown as
            the hex it currently resolves to.
          */}
          <ColorField
            value={typeof raw[row.attr] === 'string' ? raw[row.attr] : null}
            varSwatches={tokens}
            onChange={(next) => write(row, next)}
            onClear={() => write(row, undefined)}
            ariaLabel={row.ariaLabel}
          />
        </PropertyRow>
      );

    case 'toggle':
      return (
        <PropertyRow label={label}>
          <PropertyToggle
            value={value === true}
            onChange={(next) => write(row, next ? true : undefined)}
            label={row.label === '넘침' ? '자르기' : row.label}
            ariaLabel={row.ariaLabel}
          />
        </PropertyRow>
      );

    case 'choice':
    case 'dataset':
    case 'column':
      return (
        <PropertyRow label={label}>
          <ChoiceSelect
            value={String(value ?? row.fallback ?? '')}
            options={
              row.control === 'dataset' ? data.datasets : row.control === 'column' ? data.columns : (row.options ?? [])
            }
            onChange={(next) => write(row, row.attr === 'level' ? Number(next) : next || undefined)}
            ariaLabel={row.ariaLabel}
            disabled={disabled}
          />
        </PropertyRow>
      );

    case 'values':
      /*
       * One declared row, many on screen: how many there are is a fact about the *definition*, which
       * only the document knows. So the declaration says the shape — this command, this kind — and
       * this draws one row per question.
       */
      if (!shown) return null;
      if (shown.count > 1) return <PropertyEmpty>한 블록만 선택했을 때 값을 바꿀 수 있습니다.</PropertyEmpty>;
      if (shown.values.length === 0) return <PropertyEmpty>이 정의는 묻는 것이 없습니다.</PropertyEmpty>;
      return (
        <>
          {shown.values.map((one) => (
            <PropertyRow key={one.sid} label={one.name}>
              <TextField
                value={one.value}
                onCommit={(next) => run('setComponentValue', { nodeId: shown.ids[0], name: one.name, value: next })}
                ariaLabel={one.name}
              />
            </PropertyRow>
          ))}
        </>
      );
  }
}
