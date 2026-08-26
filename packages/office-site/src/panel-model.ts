/**
 * What the site builder's property panel offers, as data.
 *
 * ## The third surface, which was the last one still hiding
 *
 * This package already declares two of the three ways a reader reaches a command. `toolbar-model.ts`
 * says why: *"a ribbon that declares its own commands in JSX is a declaration nothing can read"*, and
 * `keymap.ts` is the same file for the same reason. Both were moved out of the app after the harness
 * asked a question the app could not answer.
 *
 * The panel was not moved, and the conformance test says so in as many words — *"The property panel
 * is a third surface and the harness has no notion of one … So a panel-only command is an exemption
 * that names the row it is on"*. Measured across the three products: **44 exemptions that are prose
 * claims about a panel**, eight of them added the same week this file was written. A claim a person
 * has to go and check is the hand-kept list this whole harness replaced, one level up.
 *
 * ## What a declaration buys that a claim does not
 *
 * Three things, and the third is the one worth the rewrite:
 *
 * - **`every-command-can-be-reached` can ask** instead of being told. Eleven of the site's
 *   exemptions become an answer.
 * - **A new question becomes askable**: for every attribute this product *draws*, is there a control
 *   that sets it? The harness could ask "can a reader run this command" and never "can a reader set
 *   this value" — and the two are different: `setBlockFormat` writes 24 fields, and being reachable
 *   says nothing about whether all 24 have a row. Measured before this file: the site draws 64
 *   attributes and offered 41.
 * - **The panel is drawn from it.** `ribbon.tsx` maps over `siteControlsIn()`, so the toolbar model
 *   cannot drift from the toolbar — there is nothing to drift *from*. The inspector maps over
 *   `sitePanelRows()` for the same reason. A model the panel merely agreed with would be the
 *   forty-fifth prose claim.
 *
 * ## What is deliberately *not* here
 *
 * How a control looks, and what it does when pressed. `office-ui` is pure UI and this is pure
 * declaration; between them sits `inspector.tsx`, which is the only place that knows both. A row
 * says *which attribute, which command, which kind of control, which values* — and a kind is a small
 * closed set precisely so that the panel's `switch` is total and a new kind cannot be added by
 * accident in the app.
 */

import {
  panelAttrs,
  panelCommands,
  panelGroupsFor,
  panelRowsFor,
  type PanelRow
} from '@barocss/office-controls';
import { SELECTABLE } from './selection';

/**
 * The kinds of control this panel draws.
 *
 * The first five are `office-controls`' `CommonPanelControl` and `office-ui`'s `PropertySheet`
 * draws them without being told anything; the rest are a **page's** own and are drawn by the
 * inspector's `render`. Closed, so the inspector's switch stays total and a new kind cannot be
 * invented in the app.
 */
export type SitePanelControl =
  | 'text'
  | 'number'
  | 'colour'
  | 'choice'
  | 'toggle'
  /** Read and never written — the kind of block, which a reader is told rather than asked. */
  | 'static'
  /** The datasets this document holds, which only the document can list. */
  | 'dataset'
  /** The columns of the dataset a list is drawing — likewise. */
  | 'column'
  /** A placement's answers, one row per question its definition asks. */
  | 'values'
  /** A sentence rather than a control: the note that says which width is being edited. */
  | 'note';

/** Which pane of the panel a row sits in. */
export type SitePanelTab = 'block' | 'style' | 'data' | 'values' | 'page';

/** A row of the site's panel — `office-controls`' shape, with this product's kinds. */
export type SitePanelRow = PanelRow<SitePanelControl> & { tab: SitePanelTab };

/**
 * Every stack: the two node types that arrange what is in them.
 *
 * Kept for the rows that are narrower than the schema — `clipsContent` and `cornerRadius` are on
 * every frame the office schema has, and a *page's* panel offers them only where a page can hold
 * one. Everything else asks the schema, because a hand-written list drifts and a schema cannot:
 * measured, this panel was offering a 폭, a 배경 and two 테두리 rows on a heading and a paragraph,
 * none of which declares any of them. Seven controls that wrote nothing.
 */
const STACKS = ['frame', 'collection'];

/**
 * The panel, in the order a reader meets it.
 *
 * Order is meaning here, the same way it is in `SITE_TOOLBAR`: the panel draws these top to bottom,
 * so moving a row in this array moves it on screen.
 */
export const SITE_PANEL: SitePanelRow[] = [
  // ── What is selected ───────────────────────────────────────────────────────
  { attr: 'stype', group: '선택', tab: 'block', label: '종류', ariaLabel: '종류', control: 'static' },
  {
    attr: 'name',
    command: 'setBlockFormat',
    group: '선택',
    tab: 'block',
    label: '이름',
    ariaLabel: '이름',
    control: 'text',
    single: true
  },
  /*
   * Not a control. The panel writes at the width being edited, and at a narrow one it writes only
   * the difference — so a reader typing into any row below needs to know which width they are in.
   * Declared rather than drawn ad hoc so that it has a place in the order and cannot be lost in a
   * rewrite.
   */
  { attr: 'overrides', group: '선택', tab: 'block', label: '편집 중인 폭', ariaLabel: '편집 중인 폭', control: 'note' },

  // ── 배치 — a stack, and how it arranges what is in it ──────────────────────
  {
    attr: 'layoutMode',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '방향',
    ariaLabel: '방향',
    control: 'choice',
    fallback: 'column',
    on: STACKS,
    options: [
      { id: 'column', label: '세로' },
      { id: 'row', label: '가로' },
      { id: 'grid', label: '그리드' }
    ]
  },
  {
    attr: 'columns',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '열',
    ariaLabel: '열',
    control: 'number',
    fallback: 3,
    min: 1,
    on: STACKS,
    // A grid has columns and nothing else does. A row that is always there and does nothing for two
    // of the three arrangements is a row a reader learns to ignore.
    when: { attr: 'layoutMode', is: ['grid'] }
  },
  { attr: 'gap', command: 'setBlockFormat', group: '배치', tab: 'block', label: '간격', ariaLabel: '간격', control: 'number', unit: 'px', min: 0, fallback: 0, on: STACKS },
  {
    attr: 'padding',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '안쪽 여백',
    ariaLabel: '안쪽 여백',
    control: 'number',
    unit: 'px',
    min: 0,
    fallback: 0,
    on: STACKS,
    /*
     * One number, and the four sides beside it — each falling back to this one.
     *
     * The shorthand stays the row a reader reads first because the common case really is one
     * number; the four are companions rather than rows of their own for the reason `with` exists at
     * all: five labelled rows saying almost the same word down a 280px column is a panel nobody
     * reads. What forced the four is that a hero is 96 above and 64 below, and until now the answer
     * to that was a second stack.
     */
    with: [
      { attr: 'paddingTop', command: 'setBlockFormat', group: '배치', tab: 'block', label: '위', ariaLabel: '위쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingRight', command: 'setBlockFormat', group: '배치', tab: 'block', label: '오른쪽', ariaLabel: '오른쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingBottom', command: 'setBlockFormat', group: '배치', tab: 'block', label: '아래', ariaLabel: '아래쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingLeft', command: 'setBlockFormat', group: '배치', tab: 'block', label: '왼쪽', ariaLabel: '왼쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS }
    ]
  },
  /**
   * Where the children sit **along** the stack — the half `맞춤` never asked about.
   *
   * A navigation bar is the case: the mark at one end, the links at the other, which is
   * `space-between` and was unsayable. Only for a row or a column, because a grid distributes
   * tracks rather than children and a page's grid is already `1fr` per column.
   */
  {
    attr: 'justifyContent',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '분배',
    ariaLabel: '주 축 분배',
    control: 'choice',
    fallback: 'start',
    on: STACKS,
    when: { attr: 'layoutMode', is: ['row', 'column'] },
    options: [
      { id: 'start', label: '앞으로' },
      { id: 'center', label: '가운데' },
      { id: 'end', label: '뒤로' },
      { id: 'between', label: '양끝' },
      { id: 'around', label: '둘레' },
      { id: 'evenly', label: '고르게' }
    ]
  },
  {
    attr: 'alignItems',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '맞춤',
    ariaLabel: '맞춤',
    control: 'choice',
    fallback: 'stretch',
    on: STACKS,
    options: [
      { id: 'stretch', label: '채움' },
      { id: 'start', label: '앞' },
      { id: 'center', label: '가운데' },
      { id: 'end', label: '뒤' }
    ]
  },

  // ── 크기 — what a block does with the space it is given ────────────────────
  {
    attr: 'sizing',
    command: 'setBlockFormat',
    group: '크기',
    tab: 'block',
    label: '폭',
    ariaLabel: '폭',
    control: 'choice',
    /*
     * Three answers, because there are three — and silence is not one of them: a `div` hugs and a
     * flex child fills, so "nothing stated" is the absence of an intent rather than an intent
     * (`sizing.ts`).
     */
    fallback: 'fill',
    options: [
      { id: 'fill', label: '채우기' },
      { id: 'hug', label: '내용만큼' },
      { id: 'fixed', label: '고정' }
    ]
  },
  { attr: 'minWidth', command: 'setBlockFormat', group: '크기', tab: 'block', label: '최소', ariaLabel: '최소 폭', control: 'number', unit: 'px', min: 0 },
  { attr: 'maxWidth', command: 'setBlockFormat', group: '크기', tab: 'block', label: '최대', ariaLabel: '최대 폭', control: 'number', unit: 'px', min: 0 },

  // ── 바탕 and 테두리 — any of these may hold `var:이름` rather than a colour ─
  { attr: 'fill', command: 'setBlockFormat', group: '바탕', tab: 'style', label: '배경', ariaLabel: '배경', control: 'colour' },
  { attr: 'stroke', command: 'setBlockFormat', group: '테두리', tab: 'style', label: '색', ariaLabel: '테두리 색', control: 'colour' },
  { attr: 'strokeWidth', command: 'setBlockFormat', group: '테두리', tab: 'style', label: '두께', ariaLabel: '테두리 두께', control: 'number', unit: 'px', min: 0 },

  // ── 상자 — the two things a page's frame says that a canvas's does not ─────
  { attr: 'cornerRadius', command: 'setBlockFormat', group: '상자', tab: 'style', label: '둥글기', ariaLabel: '모서리 둥글기', control: 'number', unit: 'px', min: 0, on: STACKS },
  { attr: 'clipsContent', command: 'setBlockFormat', group: '상자', tab: 'style', label: '넘침', ariaLabel: '넘치는 것 자르기', control: 'toggle', on: STACKS },

  // ── 이미지 ─────────────────────────────────────────────────────────────────
  { attr: 'src', command: 'setBlockFormat', group: '이미지', tab: 'style', label: '주소', ariaLabel: '이미지 주소', control: 'text', on: ['picture'] },
  // Not decoration: it is what a reader of the published page hears.
  { attr: 'alt', command: 'setBlockFormat', group: '이미지', tab: 'style', label: '설명', ariaLabel: '대체 텍스트', control: 'text', on: ['picture'] },
  {
    attr: 'fit',
    command: 'setBlockFormat',
    group: '이미지',
    tab: 'style',
    label: '채우기',
    ariaLabel: '채우기',
    control: 'choice',
    fallback: 'cover',
    on: ['picture'],
    options: [
      { id: 'cover', label: '꽉 채움' },
      { id: 'contain', label: '전체 보임' },
      { id: 'fill', label: '늘림' }
    ]
  },

  // ── 제목 — the one thing about a heading that is not formatting ────────────
  {
    attr: 'level',
    command: 'setBlockFormat',
    group: '제목',
    tab: 'style',
    label: '단계',
    ariaLabel: '제목 단계',
    control: 'choice',
    fallback: '2',
    on: ['heading'],
    options: [1, 2, 3, 4, 5, 6].map((level) => ({ id: String(level), label: `제목 ${level}` }))
  },

  // ── 데이터 — the question a list asks of its dataset ───────────────────────
  { attr: 'source', command: 'setBlockFormat', group: '데이터', tab: 'data', label: '목록', ariaLabel: '데이터 목록', control: 'dataset', on: ['collection'] },
  { attr: 'sortBy', command: 'setBlockFormat', group: '데이터', tab: 'data', label: '정렬', ariaLabel: '정렬 기준', control: 'column', on: ['collection'] },
  {
    attr: 'sortDir',
    command: 'setBlockFormat',
    group: '데이터',
    tab: 'data',
    label: '순서',
    ariaLabel: '정렬 순서',
    control: 'choice',
    fallback: 'asc',
    on: ['collection'],
    options: [
      { id: 'asc', label: '오름차순' },
      { id: 'desc', label: '내림차순' }
    ]
  },
  // Empty means all of them, which is what a list with nothing said has always drawn.
  { attr: 'limit', command: 'setBlockFormat', group: '데이터', tab: 'data', label: '개수', ariaLabel: '개수', control: 'number', min: 0, on: ['collection'] },
  { attr: 'where', command: 'setBlockFormat', group: '거르기', tab: 'data', label: '칸', ariaLabel: '거를 칸', control: 'column', on: ['collection'] },
  { attr: 'equals', command: 'setBlockFormat', group: '거르기', tab: 'data', label: '값', ariaLabel: '거를 값', control: 'text', on: ['collection'], needs: 'where' },

  // ── 값 — a placement's answers to its definition's questions ───────────────
  /*
   * One row here and many on screen: how many there are is a fact about the *definition*, which only
   * the document knows. The declaration says the shape of the thing — this attribute, this command,
   * this kind — and the panel draws one per question.
   */
  {
    attr: 'componentValue',
    writes: 'child',
    command: 'setComponentValue',
    group: '이 블록의 값',
    tab: 'values',
    label: '값',
    ariaLabel: '값',
    control: 'values',
    on: ['instance']
  },

  // ── 페이지 — shown when nothing is selected, because a page is the board ───
  { attr: 'name', command: 'setPageInfo', group: '페이지', tab: 'page', label: '이름', ariaLabel: '페이지 이름', control: 'text', on: ['surface'] },
  { attr: 'path', command: 'setPageInfo', group: '페이지', tab: 'page', label: '주소', ariaLabel: '페이지 주소', control: 'text', on: ['surface'] }
];

/**
 * The rows for one node type, in one pane, in the order the panel draws them.
 *
 * A row with no `on` applies to every **block** — which is what `SELECTABLE` means here, and why the
 * shared helper takes the question rather than guessing it: a deck means every box on a slide by
 * "anything", and the two would quietly answer each other's question.
 */
export function sitePanelRows(
  stype: string | undefined,
  tab?: SitePanelTab,
  /** Whether a node type declares an attribute — the schema, which only the app has. */
  declares?: (stype: string, attr: string) => boolean
): SitePanelRow[] {
  return panelRowsFor(SITE_PANEL, stype, tab, { declares, anything: (one) => SELECTABLE.has(one) });
}

/** The groups a pane has, in order, with their rows — which is how the panel is drawn. */
export function sitePanelGroups(
  stype: string | undefined,
  tab: SitePanelTab,
  declares?: (stype: string, attr: string) => boolean
) {
  return panelGroupsFor(sitePanelRows(stype, tab, declares));
}

/** Every command the panel can run — the third answer to "what can a reader reach". */
export function sitePanelCommands(): string[] {
  return panelCommands(SITE_PANEL);
}

/** Every attribute the panel can set — see `panelAttrs`. */
export function sitePanelAttrs(): string[] {
  return panelAttrs(SITE_PANEL);
}
