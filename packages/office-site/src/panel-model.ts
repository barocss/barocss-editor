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
import { REVEALS } from './reveal';
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
  /**
   * The same, for a **list's card** — and the answers are columns rather than words.
   *
   * A separate kind rather than `values` with a flag, because it is a different question: a
   * placement is asked *what does this one say*, and a list's card is asked *where does each row get
   * this from*. One draws text fields, the other draws a picker of the dataset's columns.
   */
  | 'cardValues'
  /** A sentence rather than a control: the note that says which width is being edited. */
  | 'note'
  /**
   * Which of the **card's** questions a part's words come from.
   *
   * Only a document can list them — they are the definition this part is inside — and only a
   * document knows whether the part is inside one at all. A heading on a page is nobody's part and
   * the row is not drawn for it.
   */
  | 'question'
  /**
   * The variable this part is bound to, as a thing that can be **renamed and taken away**.
   *
   * A separate kind from `question` because it is about a different noun. `question` asks *which of
   * the card's variables does this part take*, and the answer is one of a list; this one is about
   * the variable itself, which lives on the definition and is named in every placement of it.
   *
   * That difference is why removing needs a sentence in front of it and rewiring does not: unbinding
   * a part changes this part, and removing a variable changes every placement of the card at once.
   */
  | 'variable'
  /** And taking it away — its own command, so its own row beside the name. */
  | 'variableRemove';

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
  /**
   * Whether the block is **on the page**, and whether a reader can pick it up.
   *
   * Rows as well as the eye and the padlock on a layer row, because they are two different readers'
   * moments. A reader working through a list hides five things in a row and wants a column of eyes;
   * a reader standing on one block wants to know what is true of it without going to look somewhere
   * else. Every tool of this kind offers both for that reason.
   *
   * `toggle` and not a pair of buttons: they are facts about the block with two values, which is
   * what a switch is. The labels say the **true** state rather than the act — 보임 and 잠금 — because
   * a switch's label names what it controls and its position says which way.
   */
  {
    attr: 'visible',
    command: 'setBlockFormat',
    group: '선택',
    tab: 'block',
    label: '보임',
    ariaLabel: '페이지에 보임',
    control: 'toggle',
    fallback: true
  },
  {
    attr: 'locked',
    command: 'setBlockFormat',
    group: '선택',
    tab: 'block',
    label: '잠금',
    ariaLabel: '잠금',
    control: 'toggle',
    fallback: false
  },
  /**
   * **What part of the page this is**, which is the one property here that is not about how it looks.
   *
   * On the **블록** tab beside 이름 and 보임 rather than in 모양, because it is what the block *is*.
   * Measured on the sample's published page: `lang`, a `<title>`, a viewport, no script and not one
   * inline style — and forty `<div>`s, with nothing saying which was the header, the navigation, the
   * body or the footer. A screen reader jumps between landmarks and a search engine reads `<main>`;
   * the document knew and had no word for it.
   *
   * 구역 for the silent case rather than "없음": a stack that says nothing still publishes as
   * something, and calling that nothing would be a panel disagreeing with the page.
   */
  {
    attr: 'landmark',
    command: 'setBlockFormat',
    group: '선택',
    tab: 'block',
    label: '역할',
    ariaLabel: '페이지에서의 역할',
    control: 'choice',
    /*
     * **And a placement**, which is the case that matters: the sample's header and footer are
     * placements of definitions, so a panel that offered this only on a plain stack would offer it
     * everywhere except where a reader needs it. Caught by the browser and not by the harness —
     * `every-property-can-be-edited` counts rows against the schema and passed, which is the open
     * item about it counting rows rather than panes.
     */
    on: [...STACKS, 'instance'],
    options: [
      { id: '', label: '구역' },
      { id: 'header', label: '머리말' },
      { id: 'nav', label: '둘러보기' },
      { id: 'main', label: '본문' },
      { id: 'aside', label: '곁들이' },
      { id: 'footer', label: '꼬리말' }
    ]
  },
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
    /*
     * **Pictures**, which turns this row from a dropdown into three buttons — see `PanelOption.icon`.
     *
     * The row that earns it: a stack's direction is the thing a reader changes while they are
     * arranging, over and over, and a `<select>` costs a gesture to open before it costs one to
     * choose. The three drawings already exist because the toolbar makes the same three stacks.
     */
    options: [
      { id: 'column', label: '세로', icon: 'frame-column' },
      { id: 'row', label: '가로', icon: 'frame-row' },
      { id: 'grid', label: '그리드', icon: 'frame-grid' }
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
    /*
     * The four say **상 우 하 좌** now, and the word is the field's own rather than a row's.
     *
     * They were 위/오른쪽/아래/왼쪽 and drawn nowhere at all: the sheet draws a row's one label and
     * then bare controls, so four numbers sat in a line with nothing to tell them apart. Inside the
     * field the name costs no line, which is the whole reason it can be there — and one character
     * is what fits, which is what the Sino-Korean pair 상하좌우 is for. `ariaLabel` keeps the long
     * form, because a screen reader has the room and no adjacency to read from.
     */
    with: [
      { attr: 'paddingTop', command: 'setBlockFormat', group: '배치', tab: 'block', label: '상', ariaLabel: '위쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingRight', command: 'setBlockFormat', group: '배치', tab: 'block', label: '우', ariaLabel: '오른쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingBottom', command: 'setBlockFormat', group: '배치', tab: 'block', label: '하', ariaLabel: '아래쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingLeft', command: 'setBlockFormat', group: '배치', tab: 'block', label: '좌', ariaLabel: '왼쪽 여백', control: 'number', unit: 'px', min: 0, on: STACKS }
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
  /**
   * A gradient, as its two ends — the row that turns a flat band into a designed one.
   *
   * Under 배경 rather than in a group of its own, because it *is* the background: a reader who has
   * set a colour and wants it to fade is looking at the row they set the colour on. The angle and
   * the kind ride with it for the same reason the four paddings ride with the one — four labelled
   * rows about one idea is a panel nobody reads.
   */
  {
    attr: 'gradientFrom',
    command: 'setBlockFormat',
    group: '바탕',
    tab: 'style',
    label: '그라디언트',
    ariaLabel: '그라디언트 시작 색',
    control: 'colour',
    with: [
      { attr: 'gradientTo', command: 'setBlockFormat', group: '바탕', tab: 'style', label: '끝', ariaLabel: '그라디언트 끝 색', control: 'colour' },
      {
        attr: 'gradientAngle',
        command: 'setBlockFormat',
        group: '바탕',
        tab: 'style',
        label: '각도',
        ariaLabel: '그라디언트 각도',
        control: 'number',
        unit: '°',
        fallback: 180,
        min: 0,
        max: 360,
        needs: 'gradientFrom'
      },
      {
        attr: 'gradientKind',
        command: 'setBlockFormat',
        group: '바탕',
        tab: 'style',
        label: '모양',
        ariaLabel: '그라디언트 모양',
        control: 'choice',
        fallback: 'linear',
        needs: 'gradientFrom',
        options: [
          { id: 'linear', label: '직선' },
          { id: 'radial', label: '원형' }
        ]
      }
    ]
  },
  /**
   * A picture **behind** what is in the box, and how much of it comes through.
   *
   * The one thing a landing page cannot be built without: a hero is words over a photograph, and
   * the only picture a page could draw before this was a `picture` node in the flow, which pushes
   * the words off it.
   */
  {
    attr: 'backgroundImage',
    command: 'setBlockFormat',
    group: '바탕',
    tab: 'style',
    label: '배경 그림',
    ariaLabel: '배경 그림 주소',
    control: 'text',
    with: [
      {
        attr: 'backgroundFit',
        command: 'setBlockFormat',
        group: '바탕',
        tab: 'style',
        label: '맞춤',
        ariaLabel: '배경 그림 맞춤',
        control: 'choice',
        fallback: 'cover',
        needs: 'backgroundImage',
        options: [
          { id: 'cover', label: '꽉 채움' },
          { id: 'contain', label: '전체 보임' },
          { id: 'tile', label: '바둑판' }
        ]
      },
      {
        // Only the picture fades, never the words on it — see `paint.ts`.
        attr: 'backgroundOpacity',
        command: 'setBlockFormat',
        group: '바탕',
        tab: 'style',
        label: '진하기',
        ariaLabel: '배경 그림 진하기',
        control: 'number',
        fallback: 1,
        min: 0,
        max: 1,
        needs: 'backgroundImage'
      }
    ]
  },
  /**
   * A shadow, which is how a card stops being a rectangle with a line round it.
   *
   * The colour is the row, because a shadow with no colour is not a shadow — the other three are
   * only meaningful once there is one, and say so with `needs`.
   */
  {
    attr: 'shadowColor',
    command: 'setBlockFormat',
    group: '그림자',
    tab: 'style',
    label: '색',
    ariaLabel: '그림자 색',
    control: 'colour',
    with: [
      { attr: 'shadowBlur', command: 'setBlockFormat', group: '그림자', tab: 'style', label: '번짐', ariaLabel: '그림자 번짐', control: 'number', unit: 'px', min: 0, needs: 'shadowColor' },
      { attr: 'shadowDistance', command: 'setBlockFormat', group: '그림자', tab: 'style', label: '거리', ariaLabel: '그림자 거리', control: 'number', unit: 'px', min: 0, needs: 'shadowColor' },
      { attr: 'shadowAngle', command: 'setBlockFormat', group: '그림자', tab: 'style', label: '방향', ariaLabel: '그림자 방향', control: 'number', unit: '°', fallback: 180, min: 0, max: 360, needs: 'shadowColor' }
    ]
  },
  { attr: 'stroke', command: 'setBlockFormat', group: '테두리', tab: 'style', label: '색', ariaLabel: '테두리 색', control: 'colour' },
  { attr: 'strokeWidth', command: 'setBlockFormat', group: '테두리', tab: 'style', label: '두께', ariaLabel: '테두리 두께', control: 'number', unit: 'px', min: 0 },

  // ── 등장 — how this block arrives as a visitor scrolls to it ──────────────
  /**
   * The thing a page built here had none of, and a page built anywhere else has.
   *
   * A choice and not a number, because the five are compositions — a fade *and* a lift *and* the
   * range they happen over — and a reader picking 부드럽게 올라오기 is picking a look rather than
   * assembling one. The names are the deck's own, which is the paint decision again (`reveal.ts`).
   *
   * On every block a reader can select rather than only on stacks: a heading arriving on its own
   * above a paragraph that is already there is the commonest reveal on any page, and it is a
   * *heading* that arrives.
   */
  {
    attr: 'reveal',
    command: 'setBlockFormat',
    group: '등장',
    tab: 'style',
    label: '방식',
    ariaLabel: '등장 방식',
    control: 'choice',
    options: [
      { id: '', label: '없음' },
      ...REVEALS.map((one) => ({ id: one.id, label: one.label }))
    ]
  },
  /**
   * **Whose** arrival it is — the block's, or its children's one after another.
   *
   * `needs: 'reveal'`, because a stagger with no arrival to stagger is a switch that does nothing;
   * greyed rather than hidden, so a reader who wants it can see it is there and what it wants first.
   *
   * Only on a container. A heading has nothing inside it to arrive in turn, and offering the switch
   * there would be a control that is on and changes nothing — which is the fault this repository has
   * a check for now.
   */
  {
    attr: 'revealStagger',
    command: 'setBlockFormat',
    group: '등장',
    tab: 'style',
    label: '차례로',
    ariaLabel: '안에 있는 것들이 차례로',
    control: 'toggle',
    needs: 'reveal',
    on: STACKS
  },

  // ── 전환 — how long this block takes to answer the pointer ────────────────
  /**
   * The pairing every design system has, and the first thing on a page that is about **time**.
   *
   * Milliseconds and not the reader's length unit: this is the one number on a page that is not a
   * distance, and `unit: 'ms'` after the field is what stops it being read as one.
   *
   * No `needs: 'states'` on it, though it is only ever *visible* in a state's rule. Two reasons, and
   * the second is the real one: `needs` names an attribute, and `states` is a map rather than a
   * value, so the check would be asking a question it cannot ask — and a reader sets the fade before
   * the hover as often as after it. A row that appears only once the colour is chosen is a row
   * nobody finds.
   *
   * Emptying it takes it back, which is a different document from `0` and the same drawing: a block
   * nobody has told about time, and a block told to answer instantly. Both are now reachable, which
   * they were not before the number field learned what an emptied field means.
   */
  {
    attr: 'transitionMs',
    command: 'setBlockFormat',
    group: '전환',
    tab: 'style',
    label: '시간',
    ariaLabel: '전환 시간',
    control: 'number',
    unit: 'ms',
    min: 0,
    max: 2000,
    on: STACKS
  },

  // ── 상자 — the two things a page's frame says that a canvas's does not ─────
  {
    attr: 'cornerRadius',
    command: 'setBlockFormat',
    group: '상자',
    tab: 'style',
    label: '둥글기',
    ariaLabel: '모서리 둥글기',
    control: 'number',
    unit: 'px',
    min: 0,
    on: STACKS,
    /*
     * And the four corners, each falling back to the one number — the same shape as the padding's
     * four sides, and for the same reason: one number is the common case, and four is what makes a
     * tab, a speech bubble, or a card whose top is flush with the picture above it.
     */
    with: [
    /*
     * **상좌 상우 하우 하좌**, and they used to be `↖ ↗ ↘ ↙`.
     *
     * Which nothing drew, so nobody had seen them: a companion's label was declared and unread until
     * the field started carrying its own name. Drawn, they are four arrows standing in for four
     * pictures of a corner — an icon made out of a character, which is the one thing this repository
     * has written down about icons. The same shorthand the padding row uses, in the same vocabulary.
     *
     * A corner honestly wants a **drawing** — a square with one rounded corner, which is what every
     * design tool puts here and what `office-icons` has no entry for. See `BACKLOG.md`.
     */
      { attr: 'cornerTopLeft', command: 'setBlockFormat', group: '상자', tab: 'style', label: '상좌', ariaLabel: '왼쪽 위 둥글기', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerTopRight', command: 'setBlockFormat', group: '상자', tab: 'style', label: '상우', ariaLabel: '오른쪽 위 둥글기', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerBottomRight', command: 'setBlockFormat', group: '상자', tab: 'style', label: '하우', ariaLabel: '오른쪽 아래 둥글기', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerBottomLeft', command: 'setBlockFormat', group: '상자', tab: 'style', label: '하좌', ariaLabel: '왼쪽 아래 둥글기', control: 'number', unit: 'px', min: 0, on: STACKS }
    ]
  },
  { attr: 'clipsContent', command: 'setBlockFormat', group: '상자', tab: 'style', label: '넘침', ariaLabel: '넘치는 것 자르기', control: 'toggle', on: STACKS },
  /**
   * **How much of the block comes through.**
   *
   * The property every design tool puts near the top of its inspector and this one could not set at
   * all: `opacity` was exempt from `every-attribute-is-read` with the reason *"a canvas idea; a page
   * has no z-order to see through"*, which is not what opacity is. Z-order decides *which* of two
   * overlapping things you see; opacity decides how much of one you see, and a flow page uses it
   * constantly — a scrim over a hero, a caption at 60%, a card that reads as not-yet-available.
   *
   * What the wrong reason cost is `backgroundOpacity`, three groups up: a special case built for the
   * one place the need could not be argued away. It stays, and it is still the right control for the
   * job it does — it fades the **picture and not the words**, which this cannot — but it was built
   * beside a general answer that a sentence had ruled out.
   *
   * 0–1 rather than a percentage, because that is what the document stores and what the renderer
   * writes; a panel that showed 60 and stored 0.6 is a second unit for a reader to be wrong about.
   */
  {
    attr: 'opacity',
    command: 'setBlockFormat',
    group: '상자',
    tab: 'style',
    label: '투명도',
    ariaLabel: '투명도',
    control: 'number',
    fallback: 1,
    min: 0,
    max: 1,
    // A hundredth, or a browser turns a typed `0.4` into `0` — see `PanelRow.step`.
    step: 0.01,
    on: [...STACKS, 'picture', 'instance', 'textFrame']
  },

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

  // ── The blocks that have a question of their own ──────────────────────────
  /*
   * Which kind of list. `type`, which is what the schema declares — the insert had been writing
   * `kind` since it was written, and nothing read either of them until a site drew `<ul>` and `<ol>`
   * instead of two identical `<div>`s.
   */
  {
    attr: 'type',
    command: 'setBlockFormat',
    group: '목록',
    tab: 'block',
    label: '종류',
    ariaLabel: '목록 종류',
    control: 'choice',
    fallback: 'bullet',
    on: ['list'],
    options: [
      { id: 'bullet', label: '글머리' },
      { id: 'ordered', label: '번호' }
    ]
  },
  /*
   * What a code block is in. Written on the drawing as `data-language`, so a published page can be
   * highlighted by whatever the reader's site uses without this product shipping a highlighter.
   */
  {
    attr: 'language',
    command: 'setBlockFormat',
    group: '코드',
    tab: 'block',
    label: '언어',
    ariaLabel: '코드 언어',
    control: 'text',
    on: ['codeBlock']
  },

  // ── 컴포넌트 변수 — what this element's text is wired to, inside a component ─
  /*
   * A component's variables, as two rows.
   *
   * A component declares variables and an instance supplies their values; a data list supplies them
   * from a column. Both of those were reachable and a reader still could not declare a **new**
   * variable, because `componentVar` and `componentBind` could be written by hand and by nothing
   * else — so a card was stuck with whatever its author had thought of.
   *
   * Two rows rather than one control with a hidden second state: wire this element to a variable
   * that exists, or type the name of a new one. Each is a row the harness can read.
   *
   * The words are the ordinary ones on purpose. This file's comments may talk about a component
   * *asking* and an instance *answering*; a **label a reader sees** may not, because in a panel the
   * metaphor strips out the noun they know and puts back a word that could mean anything.
   */
  {
    /*
     * A **node**, because that is what the row writes: a `componentBind` on the definition this part
     * is inside. `writes: 'child'` is the panel's word for *this row is not an attribute of the
     * selected node*, and it is doubly true here — the child lands on the card rather than on the
     * part, which is where a binding has always lived.
     */
    attr: 'componentBind',
    writes: 'child',
    command: 'bindPartText',
    group: '컴포넌트 변수',
    tab: 'block',
    label: '연결',
    ariaLabel: '연결된 변수',
    control: 'question',
    single: true,
    on: ['heading', 'paragraph', 'listItem']
  },
  {
    /** And this one declares the question itself — a `componentVar`, on the same card. */
    attr: 'componentVar',
    writes: 'child',
    command: 'bindPartText',
    group: '컴포넌트 변수',
    tab: 'block',
    label: '새 변수',
    ariaLabel: '새 변수 이름',
    control: 'text',
    single: true,
    on: ['heading', 'paragraph', 'listItem']
  },
  {
    /**
     * And **editing the variable this part is bound to** — its name, and taking it away.
     *
     * The half that made the two rows above a one-way door. A reader could declare a variable and
     * bind to it, and then live with the name forever: a typo in a card's variable was permanent,
     * and a variable added by mistake could only be *unbound*, never removed — so a card
     * accumulated questions nobody answers and every placement grew a field with nothing behind it.
     *
     * Drawn only when this part is bound to something, because there is no variable to rename
     * otherwise. Which makes the group read as a sentence top to bottom: what this part is wired
     * to, how to wire it to something new, and what to do about the thing it is wired to.
     */
    attr: 'componentVar',
    writes: 'child',
    command: 'setComponentVar',
    group: '컴포넌트 변수',
    tab: 'block',
    label: '변수 관리',
    ariaLabel: '변수 이름 바꾸기',
    control: 'variable',
    single: true,
    on: ['heading', 'paragraph', 'listItem'],
    /*
     * The removal is its own **command** and so it is its own declaration, drawn beside the name
     * under the one label. Not a button this app renders and nothing declares: a command a reader
     * can run and no model mentions is exactly what `every-command-can-be-reached` exists to catch,
     * and it caught this one the first time it was written that way.
     */
    with: [
      {
        attr: 'componentVar',
        writes: 'child',
        command: 'removeComponentVar',
        group: '컴포넌트 변수',
        tab: 'block',
        label: '삭제',
        ariaLabel: '변수 삭제',
        control: 'variableRemove',
        single: true,
        on: ['heading', 'paragraph', 'listItem']
      }
    ]
  },

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
    group: '이 인스턴스의 값',
    tab: 'values',
    label: '값',
    ariaLabel: '값',
    control: 'values',
    on: ['instance']
  },

  /**
   * And the same question for a **list**, where it is the one that closes the loop.
   *
   * A list is a dataset, a card, and *which column goes into which slot of the card*. The first two
   * were reachable and the third was not: a reader could add a 할인 column to the data and had no way
   * to make the card show it, because the answers live on the list's template placement and nothing
   * selects a template.
   *
   * So the rows are drawn from the **card's** questions and written to the list's template, which is
   * the sentence a reader would say — *the card asks for a name; give it the 이름 column.*
   */
  {
    /*
     * `componentValue`, the same node the row above writes — because it *is* that node, put on the
     * list's template rather than on a placement a reader selected. The panel's own check reads this
     * name and asks the schema for it, which is what says the row writes something that exists.
     */
    attr: 'componentValue',
    writes: 'child',
    command: 'setComponentValue',
    group: '카드 변수에 넣을 컬럼',
    tab: 'data',
    label: '변수',
    ariaLabel: '카드 변수에 넣을 컬럼',
    control: 'cardValues',
    on: ['collection']
  },

  /**
   * ── 사이트 — the one thing above a page ──────────────────────────────────
   *
   * Where the site lives. Found writing the Open Graph tags: `og:url`, a canonical link and a
   * sitemap all need an **absolute** address, and the document knew its pages' paths and nothing
   * about where the site is published.
   *
   * Above 페이지 because it is above it: a site has one address and five pages, and a reader who has
   * nothing selected is looking at the page *and* the site. Written to the document rather than to a
   * page, so `setSiteAddress` takes no `nodeId` — the only command in this product that does not.
   */
  {
    attr: 'address',
    command: 'setSiteAddress',
    group: '사이트',
    tab: 'page',
    label: '주소',
    ariaLabel: '사이트 주소',
    control: 'text',
    // Shown in the page's pane, which is where a reader who selected nothing is…
    on: ['surface'],
    // …and written to the **document**, of which there is one. See `PanelRow.of`.
    of: 'document'
  },

  // ── 페이지 — shown when nothing is selected, because a page is the board ───
  { attr: 'name', command: 'setPageInfo', group: '페이지', tab: 'page', label: '이름', ariaLabel: '페이지 이름', control: 'text', on: ['surface'] },
  { attr: 'path', command: 'setPageInfo', group: '페이지', tab: 'page', label: '주소', ariaLabel: '페이지 주소', control: 'text', on: ['surface'] },
  /**
   * And what the page is **about**, which is the third thing it is.
   *
   * A title is what it is called and an address is where it answers; both are here and both were
   * being said to a browser tab and to nothing else. This is what a search result shows and what a
   * chat unfurls, and the published page had neither it nor an Open Graph tag.
   */
  {
    attr: 'description',
    command: 'setPageInfo',
    group: '페이지',
    tab: 'page',
    label: '설명',
    ariaLabel: '페이지 설명',
    control: 'text',
    on: ['surface']
  }
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
  const rows = panelRowsFor(SITE_PANEL, stype, tab, { declares, anything: (one) => SELECTABLE.has(one) });

  /**
   * A page's **paint**, which would otherwise be in a pane a reader cannot open.
   *
   * The panes are for a *selection*, and a page is never in one — it is the board. So a row about
   * a page's background, declared under 모양 like every other background, was reachable by nothing
   * at all: the harness said it was settable because `panelAttrs` counts rows and not panes, and
   * the page pane showed two text fields.
   *
   * Found by drawing it. It is also the honest reading of what a pane *is* here: 페이지 is not a
   * third category of property, it is the only pane a page has — so it holds everything a page can
   * say. Noted in `BACKLOG.md` as a limit of the check rather than of the product.
   */
  if (tab === 'page' && stype === 'surface') {
    return [
      ...rows,
      ...panelRowsFor(SITE_PANEL, stype, 'style', { declares, anything: () => false })
    ];
  }

  return rows;
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

/**
 * The pictures the **panel** asks for, so the icon table can be asked whether it has them.
 *
 * The toolbar's have been collected since the harness could see a toolbar; a panel had none to
 * collect until a row's choices could carry one. A name the table does not know draws as the name
 * itself, in a 24-pixel button — see `every-icon-has-a-picture`.
 */
export function sitePanelIcons(rows: SitePanelRow[] = SITE_PANEL): string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => [row, ...(row.with ?? [])])
        .flatMap((row) => (row.options ?? []).map((one) => one.icon))
        .filter((one): one is string => typeof one === 'string' && one.length > 0)
    )
  ];
}

/** Every attribute the panel can set — see `panelAttrs`. */
export function sitePanelAttrs(): string[] {
  return panelAttrs(SITE_PANEL);
}
