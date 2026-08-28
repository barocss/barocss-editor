import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  Icon,
  Button,
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
  FIELD_PREFIX,
  fieldNameOf,
  STATEABLE,
  STATES,
  attrsInState,
  boundVarOf,
  definitionAt,
  definitionOf,
  kindOfBlock,
  labelOfBlock,
  overriddenAt,
  sitePanelGroups,
  statedIn,
  statesOf,
  templateOf,
  type BreakpointId,
  type SitePanelRow,
  type SitePanelTab,
  type StateId
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
  state,
  onState,
  page
}: {
  editor: Editor;
  /** The width being edited. The widest is the page itself; the others say only what differs. */
  at: BreakpointId;
  onAt: (at: BreakpointId) => void;
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
    const rootId = editor.getRootId?.();
    return {
      ids,
      count: nodes.length,
      stype: String(first.stype),
      label: labelOfBlock(doc, ids[0]),
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
        return {
          asks: inside.asks,
          uses: inside.uses,
          bound: boundVarOf({ getNode: (sid: string) => store?.getNode(sid) } as never, String(first.sid))
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
    /*
     * Naming a question the card does not ask **declares** it, so the field that types a name and
     * the picker that chooses one run the same command. One sentence — *this text comes from the
     * card's data, and the question is called 할인* — which is why there is one command and not two.
     */
    else if (row.command === 'bindPartText') {
      run('bindPartText', { nodeId: shown?.ids[0], var: value || undefined });
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
      run(row.command, { nodeIds: shown?.ids, at, state, ...sides, [row.attr]: value });
    }
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
              aria-label={`${one.label}에서 편집`}
              onClick={() => onAt(one.id)}
            >
              {/*
                The picture, because the word did not fit and the truncation was 데 / 태 / 모.

                A one-syllable Korean truncation is not an abbreviation — it carries no meaning at
                all — and these three are exactly what a glyph says instantly. Which glyph means
                *tablet* is declared with the breakpoint (`breakpoints.ts`), not here.
              */}
              <Icon name={one.icon} size={14} />
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
            onChange={(id) => {
              setTab(id as SitePanelTab);
              // Only 모양 can hold a state, so leaving it puts the panel back on the resting page.
              if (id !== 'style') onState(undefined);
            }}
          />
          {tab === 'style' ? (
            <StateSwitch state={state} onState={onState} />
          ) : null}
          <Groups
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
function Groups({
  stype,
  tab,
  shown,
  at,
  state,
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
  /** The state being edited, when the reader has opened one. */
  state?: StateId;
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
           * And in a state, only what a state may hold. Paint, never an arrangement — a block that
           * resized under the pointer would move out from under it and flicker, so the panel does not
           * offer the gesture rather than accepting it and having the command refuse.
           */
          (!state || STATEABLE.includes(row.attr))
      )
    }))
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
          const held = shorthandOf(row, attrs);
          if (row.unit !== 'px' || held === undefined || held === null) return held;
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
      {state ? (
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
        <ChoiceSelect
          value={shown.part.bound ?? ''}
          options={[
            { id: '', label: '연결 안 함' },
            ...shown.part.asks.map((one) => ({ id: one, label: one }))
          ]}
          onChange={(next) => run('bindPartText', { nodeId: shown.ids[0], var: next || undefined })}
          ariaLabel={row.ariaLabel}
        />
      );

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
              <ChoiceSelect
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
