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
import { ASPECT_LABELS } from './aspect';
import { PROVIDERS } from './embed';
import { FACES, SCALES } from './type-scale';
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
  /**
   * A list of words, or — when **every** option carries an icon — a strip of small pictures.
   *
   * The sheet decides from the declaration rather than from a second control kind, and that is the
   * declaration's job: a stack's direction is three choices a reader makes constantly and a
   * `<select>` costs two gestures every time, while a list of ten field kinds is words and should
   * stay words. Give the options icons to say *this one is a shape*.
   */
  | 'choice'
  | 'toggle'
  /** Read and never written — the kind of block, which a reader is told rather than asked. */
  | 'static'
  /** The datasets this document holds, which only the document can list. */
  | 'dataset'
  /**
   * **The widths this site is designed at** — the whole list, with its add, its remove and its drag.
   *
   * One control drawn from four declared rows, which is the honest way round: a widths list *is* four
   * things a reader can do, and four labelled rows would be four labels for one list. The leader
   * draws all of it; the three `widths-part` rows exist so `every-command-can-be-reached` can see the
   * other three commands, and answer `null` when the sheet asks them to draw.
   */
  | 'widths'
  | 'widths-part'
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
  | 'variableRemove'
  /**
   * **What kind of thing the answer is**, and **how it reads** — two rows, one variable.
   *
   * Their own kinds rather than `choice` rows, because both offer a list only the *document* can
   * supply: the second's options depend on the first's answer, and a declaration written once cannot
   * say "the date formats when it is a date". `VALUE_FORMATS` is where that list lives.
   */
  | 'varKind'
  | 'varFormat'
  /**
   * **Which block this one opens** — a list only the document can supply, like `dataset` and
   * `column`.
   *
   * Not `options`, and for the same reason those two are not: the choices are the blocks of this
   * page or this component, which a declaration written once cannot name. A reader picks the menu
   * their hamburger opens rather than typing its id, which is the only version of this a reader
   * could actually use — a sid is not a thing anybody knows by looking.
   */
  | 'opens'
  /**
   * **Where pressing a block goes** — a page of this site picked by name, or an address typed out.
   *
   * Its own kind rather than a `choice` plus a `text`, because the two are one decision: a reader
   * chooses *a page* or *somewhere else*, and two rows would let a document hold both and draw one.
   */
  | 'goes'
  /**
   * **Which connection a form sends through**, and the address that connection points at.
   *
   * Lists only the document can supply, like `dataset` and `column` — and the second is a control
   * that writes a **different node** from the one selected, which is what `writes: 'child'` says. A
   * reader is at the form when the question comes up; the address lives with the connection.
   */
  | 'sends'
  | 'endpoint'
  | 'serviceMethod'
  /**
   * **Which picture this is** — the files the document holds, and a way to add one.
   *
   * A list only the document can supply, like `dataset` and `column`, with one thing those two do
   * not have: a control that reads a file off the reader's machine. That reading is the app's, so the
   * kind is declared here and drawn there.
   */
  | 'picture'
  /**
   * **A list that grows** — the rows a `choice` field offers.
   *
   * The panel had no control for one: `values` draws a fixed number of boxes from a definition, and a
   * reader adding a fourth option needs a fourth box. Drawn with no buttons at all — one box per
   * option and an empty one at the end — because *type in the blank row to add, empty a row to
   * remove* is a thing a reader works out by looking, where a `+` and a `×` per row is two more
   * targets in a panel that already has forty.
   */
  | 'choices'
  /**
   * **Where a visitor lands after sending** — the pages of this site, which only the document has.
   *
   * And the two names a service uses for its own hidden fields, which write the **connection** rather
   * than the form: they are the service's vocabulary and a site says them once.
   */
  | 'thanks'
  | 'serviceField';

/** Which pane of the panel a row sits in. */
/**
 * The tabs the panel offers, and `uses` is the one that holds no rows.
 *
 * Every other tab is a list of properties. `uses` answers the question a property cannot: **what
 * does this block depend on, and what depends on it** — which in this document model is the whole
 * of what a reader has to know before changing anything, because six things are referred to by name
 * and a name means *somewhere else*.
 */
/**
 * **Which words a panel uses, and when the English one is the plain one.**
 *
 * This file's rule has been *say it in the words a reader would use*, and it produced 차례대로, 고정
 * and 겹침 for `static`, `sticky` and `absolute` — three invented Korean words for three concepts
 * that have had settled names for twenty years. Reported by somebody who could not tell what any of
 * them meant, which is the whole test: a translation nobody has heard before is not plainer than the
 * word everybody has.
 *
 * So the rule is narrower and says which way to go:
 *
 * - **English** where the concept is a CSS or design-tool primitive with no settled Korean —
 *   `Static / Sticky / Absolute`, the blend modes (untranslated in Korean Figma too), `Fill / Hug /
 *   Fixed`, `Cover / Contain`, `Linear / Radial`. These are what a designer says out loud.
 * - **Korean** where an ordinary word does the job — 세로 / 가로, 가운데, 오름차순, 글머리 / 번호,
 *   머리말 / 본문 / 꼬리말. Writing `Ascending` here would be the same mistake in the other
 *   direction: reaching for English to sound technical.
 *
 * The test to apply to a new one: **would somebody who uses design tools recognise the English word
 * without being told?** If yes it is a name, and names are not translated. If no, it is a
 * description, and a description belongs in the reader's language.
 *
 * `ariaLabel` stays Korean throughout — it is a sentence, not a name.
 */
export type SitePanelTab = 'block' | 'style' | 'data' | 'values' | 'page' | 'text' | 'uses';

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
 * And the same, plus a **placement** — for the rows about where a block sits.
 *
 * A placement is the one node a reader positions that is not a stack, and it is the commonest of
 * them: a header is a component, and whether a header follows the page down is a decision about the
 * page it is placed on. A block inside a definition cannot answer it — its parent is the placement's
 * own box, which is exactly that block's height, so `sticky` there has nowhere to travel and does
 * nothing at all (`renderers.ts`).
 */
const PLACED = [...STACKS, 'instance'];

/**
 * The panel, in the order a reader meets it.
 *
 * Order is meaning here, the same way it is in `SITE_TOOLBAR`: the panel draws these top to bottom,
 * so moving a row in this array moves it on screen.
 */
/**
 * **What a box is painted with** — declared once, offered twice.
 *
 * A block's paint is on the 모양 pane, and a **page** has exactly the same paint: `paintCss` reads
 * the page's own attributes in the renderer, and has since the day a page could hold a gradient. What
 * was missing was anywhere to say it — the page pane held its address, its type and nothing about how
 * it looks — which is what *여기도 배경색이랑 꾸밀 수 있는 걸 따로 둘 수 있잖아* is asking for.
 *
 * Written out once and mapped onto the page pane rather than declared twice, because two declarations
 * of one thing is how a panel and a product drift apart — the fault this whole file exists to have
 * already made once.
 */
const PAINT: SitePanelRow[] = [
  { attr: 'fill', command: 'setBlockFormat', group: '바탕', tab: 'style', label: '배경', ariaLabel: '배경', control: 'colour' },
  /**
   * The colour of what is **on** the background — the row directly under it, because it is the same
   * decision made twice.
   *
   * Until this row a builder could paint a section near-black and had no control that made the words
   * on it light. The only way was to select each run and set a text colour, which is why the sample's
   * one dark band has a coloured paragraph and an uncoloured heading: the person writing it did the
   * work per run and missed one, and the heading shipped dark-on-dark at 1.06:1.
   *
   * It inherits, so setting it on a section reaches everything added to that section afterwards. A
   * `colour` control rather than a choice, because a dark band's ink is rarely pure white — the band
   * in the sample wants a faintly green off-white to sit in the same family as its gradient.
   */
  { attr: 'ink', command: 'setBlockFormat', group: '바탕', tab: 'style', label: '글자', ariaLabel: '블록 안 글자 색', control: 'colour' },
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
          { id: 'linear', label: 'Linear' },
          { id: 'radial', label: 'Radial' }
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
          { id: 'cover', label: 'Cover' },
          { id: 'contain', label: 'Contain' },
          { id: 'tile', label: 'Tile' }
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
   * **The sheet over the picture** — the layer that makes white words on a photograph readable.
   *
   * Its own row rather than a fourth companion under 배경 그림, and that was measured rather than
   * chosen: four controls sharing one line drew the last of them **11 pixels wide**, which the
   * chrome's own check calls a target that is aimed at rather than moved to. A row holds a label and
   * about two controls; the third is a row of its own.
   *
   * Beside 진하기 and not instead of it, because they do different things and a reader has to be able
   * to see both: 진하기 fades the picture toward the box's own ground, and this puts a chosen colour
   * on top of it. `paint.ts` argues why a gradient could not.
   */
  {
    attr: 'overlay',
    command: 'setBlockFormat',
    group: '바탕',
    tab: 'style',
    label: '덮개',
    ariaLabel: '배경 덮개 색',
    control: 'colour',
    needs: 'backgroundImage',
    with: [
      {
        attr: 'overlayOpacity',
        command: 'setBlockFormat',
        group: '바탕',
        tab: 'style',
        label: '진하기',
        ariaLabel: '배경 덮개 진하기',
        control: 'number',
        fallback: 1,
        min: 0,
        max: 1,
        step: 0.01,
        needs: 'overlay'
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
  }
];

/**
 * The same rows, asked of the **page**.
 *
 * `on: ['surface']` because a page is not a block — `SELECTABLE` leaves it out on purpose — and
 * `tab: 'page'` because that is the pane a reader reaches by selecting nothing, which is the only way
 * to reach a page at all.
 */
const pagePaint = (one: SitePanelRow): SitePanelRow => ({
  ...one,
  tab: 'page',
  on: ['surface'],
  /**
   * **A name of its own**, which `calls no two rows the same thing` is right to insist on: an
   * accessible name has to be unique across the whole declaration, so that a reader — or a test —
   * can address any row by saying it. `label` may repeat, because a label is read *inside* a group
   * that has already said which pane it is.
   *
   * And the two really are different things: a block's 배경 is the band's, and this is the paper the
   * whole page is printed on — the thing a reader sees under every section shorter than the window.
   */
  ariaLabel: `페이지 ${one.ariaLabel}`,
  /* A companion is a row too, and it needs the same three answers — see `PanelRow.with`. */
  with: one.with?.map((each) => pagePaint(each as SitePanelRow))
});

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
  /*
   * On **one row**, because they are the two things a reader says about a block without changing how
   * it looks: is it there, and can it be touched. Every panel of this kind puts the pair together —
   * two whole rows for two switches is two rows of eye travel for one question.
   */
  {
    attr: 'visible',
    command: 'setBlockFormat',
    group: '선택',
    tab: 'block',
    label: '보임 · 잠금',
    ariaLabel: '페이지에 보임',
    control: 'toggle',
    fallback: true,
    with: [
      {
        attr: 'locked',
        command: 'setBlockFormat',
        group: '선택',
        tab: 'block',
        label: '잠금',
        ariaLabel: '잠금',
        control: 'toggle',
        fallback: false
      }
    ]
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
  {
    attr: 'gap',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '간격',
    ariaLabel: '간격',
    control: 'number',
    unit: 'px',
    min: 0,
    fallback: 0,
    on: STACKS,
    /**
     * **And the gap across the flow, which only a grid has.**
     *
     * Asked as *column gap 이랑 row gap 을 분리해야하지 않아?* — and it had to be, for a grid: one
     * number went to the CSS `gap` shorthand, so a card grid could not have more air between its rows
     * than between its columns, and the board's row-gap strip moved the column gap with it.
     *
     * A companion rather than a row of its own, and drawn **only for a grid**: a row and a column
     * have one line each and nothing here wraps, so a second number there would be a control that
     * writes something no drawing reads — which is the exact fault this suite's harness exists to
     * catch. The companion is left out where it means nothing (`own` answers `null`), the way every
     * companion that draws nothing is.
     *
     * 줄 간격 rather than 세로 간격, because what it spaces is the **lines** of the grid, and that
     * stays true if the grid is ever read in another direction.
     */
    with: [
      {
        attr: 'gapCross',
        command: 'setBlockFormat',
        group: '배치',
        tab: 'block',
        label: '줄 간격',
        ariaLabel: '줄 간격',
        control: 'number',
        unit: 'px',
        min: 0,
        on: STACKS,
        when: { attr: 'layoutMode', is: ['grid'] }
      }
    ]
  },
  /**
   * **A row that scrolls sideways**, which is also exactly a carousel.
   *
   * Three words rather than a switch, because the third is a different thing rather than more of the
   * second: *넘김* is what turns a scrolling strip into a carousel — letting go lands on a card
   * instead of between two. A reader who wants a free-running strip of logos wants 옆으로 and not
   * 넘김, and one word could not have offered both.
   *
   * Under 배치 beside 간격 rather than in 모양, because it is what the stack **does** with what it
   * holds, which is the same question 방향 and 간격 answer.
   */
  /**
   * **What to embed, and which service it comes from.**
   *
   * Two rows for one decision, and they are genuinely two: *which service* is a list this product
   * keeps (`embed.ts`), and *which thing on it* is something only the reader knows. A single field
   * taking a URL would be the third option and the wrong one — the document would then hold one
   * company's address shape, and the day it changes every page that used it breaks.
   *
   * The id field takes a **pasted URL** and finds the id in it, which is what somebody will actually
   * do. Telling a reader to go and find an id themselves is telling them to do a computer's job.
   */
  {
    attr: 'provider',
    command: 'setBlockFormat',
    group: '넣은 것',
    tab: 'block',
    label: '어디',
    ariaLabel: '넣을 곳',
    control: 'choice',
    on: ['mediaEmbed'],
    options: [{ id: '', label: '고르지 않음' }, ...PROVIDERS.map((one) => ({ id: one.id, label: one.label }))]
  },
  { attr: 'id', command: 'setBlockFormat', group: '넣은 것', tab: 'block', label: '무엇', ariaLabel: '넣을 것의 주소나 id', control: 'text', on: ['mediaEmbed'] },
  { attr: 'title', command: 'setBlockFormat', group: '넣은 것', tab: 'block', label: '설명', ariaLabel: '넣은 것의 설명', control: 'text', on: ['mediaEmbed'] },

  /**
   * **A video**, and the four things a reader decides about one.
   *
   * `src` is a file or an address like a picture's; the other three are what the browser does with
   * it. 조작 defaults on and that is the honest default rather than the pretty one — a video a
   * visitor cannot pause is a video they close the tab on.
   */
  { attr: 'src', command: 'setBlockFormat', group: '영상', tab: 'block', label: '파일', ariaLabel: '영상 파일', control: 'picture', on: ['mediaVideo'] },
  { attr: 'poster', command: 'setBlockFormat', group: '영상', tab: 'block', label: '표지', ariaLabel: '재생 전 보일 그림', control: 'picture', on: ['mediaVideo'] },
  {
    attr: 'controls',
    command: 'setBlockFormat',
    group: '영상',
    tab: 'block',
    label: '조작 · 소리 없이',
    ariaLabel: '재생 조작 보이기',
    control: 'toggle',
    fallback: true,
    on: ['mediaVideo'],
    with: [
      { attr: 'muted', command: 'setBlockFormat', group: '영상', tab: 'block', label: '소리 없이', ariaLabel: '소리 없이', control: 'toggle', fallback: false, on: ['mediaVideo'] }
    ]
  },
  { attr: 'loop', command: 'setBlockFormat', group: '영상', tab: 'block', label: '반복', ariaLabel: '끝나면 다시', control: 'toggle', fallback: false, on: ['mediaVideo'] },

  {
    attr: 'scrolls',
    command: 'setBlockFormat',
    group: '배치',
    tab: 'block',
    label: '가로 스크롤',
    ariaLabel: '가로로 스크롤',
    control: 'choice',
    on: STACKS,
    when: { attr: 'layoutMode', is: ['row'] },
    options: [
      { id: '', label: '없음' },
      { id: 'x', label: '옆으로' },
      { id: 'x-snap', label: '넘김' }
    ]
  },
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
      { attr: 'paddingTop', command: 'setBlockFormat', group: '배치', tab: 'block', label: '상', ariaLabel: '위쪽 여백', icon: 'padding-top', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingRight', command: 'setBlockFormat', group: '배치', tab: 'block', label: '우', ariaLabel: '오른쪽 여백', icon: 'padding-right', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingBottom', command: 'setBlockFormat', group: '배치', tab: 'block', label: '하', ariaLabel: '아래쪽 여백', icon: 'padding-bottom', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'paddingLeft', command: 'setBlockFormat', group: '배치', tab: 'block', label: '좌', ariaLabel: '왼쪽 여백', icon: 'padding-left', control: 'number', unit: 'px', min: 0, on: STACKS }
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
      { id: 'start', label: '앞으로', icon: 'along-start' },
      { id: 'center', label: '가운데', icon: 'along-centre' },
      { id: 'end', label: '뒤로', icon: 'along-end' },
      { id: 'between', label: '양끝', icon: 'along-between' },
      { id: 'around', label: '둘레', icon: 'along-around' },
      { id: 'evenly', label: '고르게', icon: 'along-evenly' }
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
      { id: 'stretch', label: '채움', icon: 'cross-stretch' },
      { id: 'start', label: '앞', icon: 'cross-start' },
      { id: 'center', label: '가운데', icon: 'cross-centre' },
      { id: 'end', label: '뒤', icon: 'cross-end' }
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
      { id: 'fill', label: 'Fill', icon: 'size-fill' },
      { id: 'hug', label: 'Hug', icon: 'size-hug' },
      { id: 'fixed', label: 'Fixed', icon: 'size-fixed' }
    ]
  },
  /**
   * **Two halves of one decision, on one row** — which is how every panel of this kind draws a pair
   * and how this one did not.
   *
   * Measured against the shape a designer expects: sixteen of this panel's rows spend a whole 240
   * pixels on a single control, and four of them are 최소/최대 twice. A minimum without its maximum
   * beside it is half a sentence, and reading the pair costs two rows of eye travel where it should
   * cost none.
   *
   * `with` is the mechanism the padding row already uses for 상하좌우: one label, the controls
   * beside each other. Nothing new — it was simply never applied to the pairs that most obviously
   * are pairs.
   */
  {
    attr: 'minWidth',
    command: 'setBlockFormat',
    group: '크기',
    tab: 'block',
    label: '폭 범위',
    ariaLabel: '최소 폭',
    control: 'number',
    unit: 'px',
    min: 0,
    when: { attr: 'position', is: [undefined, '', 'sticky'] },
    with: [
      { attr: 'maxWidth', command: 'setBlockFormat', group: '크기', tab: 'block', label: '최대', ariaLabel: '최대 폭', control: 'number', unit: 'px', min: 0 }
    ]
  },
  /*
   * And the same pair for **height**, which is new and reads as though it had always been there —
   * which is the point: a reader who has learned 최소/최대 폭 has learned this in the same gesture.
   * `sizing.ts` has the five blocks that could not be drawn without it.
   */
  /*
   * The four **constraints** a block in a flow has, and they are hidden once it places itself: a
   * placed block's width is a width rather than a bound on one, and it is offered as W beside X and Y
   * under 위치. Two rows writing one attribute is a panel where setting either silently changes the
   * other — the fault `a row per attribute` refuses — and `when` is what keeps them apart.
   */
  {
    attr: 'minHeight',
    command: 'setBlockFormat',
    group: '크기',
    tab: 'block',
    label: '높이 범위',
    ariaLabel: '최소 높이',
    control: 'number',
    unit: 'px',
    min: 0,
    when: { attr: 'position', is: [undefined, '', 'sticky'] },
    with: [
      { attr: 'maxHeight', command: 'setBlockFormat', group: '크기', tab: 'block', label: '최대', ariaLabel: '최대 높이', control: 'number', unit: 'px', min: 0 }
    ]
  },

  // ── 폼 — where what a visitor typed goes ──────────────────────────────────
  /**
   * **Where the answers go**, which is the only thing about a form that is not about drawing it.
   *
   * No default and no destination of this product's own: a builder that quietly posted a stranger's
   * message to its own server would be doing something nobody asked for with somebody else's data.
   * Empty is a **fault** the panel reports (`formFaults`) rather than a blank that looks fine — a
   * form with nowhere to send to is identical on screen to one that works.
   */
  { attr: 'sends', command: 'setBlockFormat', group: '폼', tab: 'block', label: '보낼 곳', ariaLabel: '보낼 곳 연결', control: 'sends', on: ['form'] },
  /**
   * And **the address that connection points at**, edited from here.
   *
   * A shared thing edited from the panel of one of its users, which needs saying rather than hiding:
   * the row under it counts how many forms send through it, because changing this changes all of
   * them. That count is the same sentence the component list makes with 5곳 — a named reference is
   * worth having exactly because one edit reaches every use, and a reader has to be told when they
   * are about to make one.
   */
  { attr: 'endpoint', of: 'service', command: 'setServiceInfo', group: '폼', tab: 'block', label: '주소', ariaLabel: '연결 주소', control: 'endpoint', on: ['form'] },
  /*
   * And how. `post` for anything a person typed — a `get` puts a visitor's message in the address
   * bar, in their history, and in every log between here and there.
   */
  {
    attr: 'method',
    of: 'service',
    command: 'setServiceInfo',
    group: '폼',
    tab: 'block',
    label: '방식',
    ariaLabel: '보내는 방식',
    control: 'serviceMethod',
    on: ['form']
  },

  /**
   * **Where a visitor lands after sending** — a page of this site.
   *
   * The worst thing about a form without it: 보내기 takes the visitor to the service's own page, and
   * the site's design, header and footer are replaced by a stranger's. One hidden field fixes it, and
   * the service's name for that field is on the connection because it is a fact about the service.
   */
  { attr: 'thanks', command: 'setBlockFormat', group: '폼', tab: 'block', label: '보낸 뒤', ariaLabel: '보낸 뒤 갈 페이지', control: 'thanks', on: ['form'] },
  /*
   * And the two names the service uses for its own hidden fields — written once for the whole site,
   * because they are the service's vocabulary rather than this form's.
   */
  { attr: 'returnField', of: 'service', command: 'setServiceInfo', group: '폼', tab: 'block', label: '돌아오기 칸', ariaLabel: '돌아올 주소를 담는 칸 이름', control: 'serviceField', on: ['form'] },
  { attr: 'trapField', of: 'service', command: 'setServiceInfo', group: '폼', tab: 'block', label: '스팸 칸', ariaLabel: '스팸을 거르는 칸 이름', control: 'serviceField', on: ['form'] },

  // ── 질문 — one field of a form ────────────────────────────────────────────
  /**
   * What the visitor **reads**, which is also the accessible name — so it is not decoration.
   *
   * The first row of the group on purpose: a field with no label is the fault this product will not
   * let a reader make by accident, because the alternative everyone reaches for — labelling with the
   * placeholder — takes the question off the screen the moment somebody types in it.
   */
  { attr: 'label', command: 'setBlockFormat', group: '질문', tab: 'block', label: '이름표', ariaLabel: '질문 이름표', control: 'text', on: ['field'] },
  /*
   * And which control it is. One row rather than five node types: the difference between a line and
   * an address really is one word, which is the same thing `<input type>` has said since the
   * beginning.
   */
  {
    attr: 'kind',
    command: 'setBlockFormat',
    group: '질문',
    tab: 'block',
    label: '종류',
    ariaLabel: '질문 종류',
    control: 'choice',
    fallback: 'text',
    options: [
      { id: 'text', label: '한 줄' },
      { id: 'email', label: '이메일' },
      { id: 'tel', label: '전화' },
      { id: 'number', label: '숫자' },
      { id: 'date', label: '날짜' },
      { id: 'paragraph', label: '여러 줄' },
      { id: 'choice', label: '고르기' },
      { id: 'checkbox', label: '동의 체크' },
      /*
       * The one kind whose presence changes the **form** rather than only itself — a form holding
       * one is sent as `multipart/form-data`, or the file is dropped and everything else arrives.
       * `needsUpload` sees to that; the fault list says the other half out loud, because whether the
       * service at the far end takes a file is not this product's to know.
       */
      { id: 'file', label: '파일' },
      { id: 'submit', label: '보내기 단추' }
    ],
    on: ['field']
  },
  /**
   * **What a list offers**, in order — the rows a `choice` is made of.
   *
   * An array and not a comma-separated string: a Korean answer contains commas, and a separator a
   * reader has to avoid typing is a field that quietly loses half an option.
   *
   * Its own kind, because the panel has no control for a list that grows. The one it draws is the
   * pattern with no buttons in it: one box per option and an empty one at the end, so typing in the
   * last row adds and emptying a row removes.
   */
  {
    attr: 'choices',
    command: 'setBlockFormat',
    group: '질문',
    tab: 'block',
    label: '고를 것',
    ariaLabel: '고를 수 있는 항목',
    control: 'choices',
    when: { attr: 'kind', is: ['choice'] },
    on: ['field']
  },
  /*
   * And the browser's own validation, which is most of a form feature and costs nothing: it runs with
   * scripts off, in the visitor's own language. `pattern` is deliberately not here — see the schema.
   */
  { attr: 'min', command: 'setBlockFormat', group: '질문', tab: 'block', label: '최소', ariaLabel: '가장 작은 값', control: 'number', when: { attr: 'kind', is: ['number'] }, on: ['field'] },
  { attr: 'max', command: 'setBlockFormat', group: '질문', tab: 'block', label: '최대', ariaLabel: '가장 큰 값', control: 'number', when: { attr: 'kind', is: ['number'] }, on: ['field'] },
  { attr: 'maxLength', command: 'setBlockFormat', group: '질문', tab: 'block', label: '글자 수', ariaLabel: '최대 글자 수', control: 'number', min: 1, when: { attr: 'kind', is: ['text', 'email', 'tel', 'paragraph'] }, on: ['field'] },
  /*
   * What the answer arrives **called**, which is what the person reading the messages sees. Not the
   * label: they get `email`, not 이메일 주소. Minted from the label when nobody says.
   */
  { attr: 'name', command: 'setBlockFormat', group: '질문', tab: 'block', label: '보낼 이름', ariaLabel: '답이 도착할 이름', control: 'text', on: ['field'] },
  { attr: 'required', command: 'setBlockFormat', group: '질문', tab: 'block', label: '필수', ariaLabel: '반드시 답해야 함', control: 'toggle', on: ['field'] },
  /*
   * The grey words **inside** the box, which are a hint and never the question — see the schema.
   */
  { attr: 'placeholder', command: 'setBlockFormat', group: '질문', tab: 'block', label: '안내글', ariaLabel: '상자 안 안내글', control: 'text', on: ['field'] },
  { attr: 'lines', command: 'setBlockFormat', group: '질문', tab: 'block', label: '줄 수', ariaLabel: '보이는 줄 수', control: 'number', min: 1, max: 20, when: { attr: 'kind', is: ['paragraph'] }, on: ['field'] },

  // ── 위치 — the category of design a column of boxes could not express ──────
  /**
   * **Where this block is**, when it is not simply the next thing in the column.
   *
   * Its own group rather than a row in 크기, because it changes what the four numbers under it
   * *mean*: with nothing chosen there are no offsets to state, and the panel does not offer four
   * fields that write attributes nothing will read (`needs: 'position'`).
   *
   * 고정 and 겹침 rather than sticky and absolute — a reader is choosing between *follows the page*
   * and *sits on top of things*, and neither English word says that to them.
   */
  {
    attr: 'position',
    command: 'setBlockFormat',
    group: '위치',
    tab: 'block',
    label: '방식',
    ariaLabel: '배치 방식',
    control: 'choice',
    fallback: '',
    options: [
      { id: '', label: 'Static' },
      { id: 'sticky', label: 'Sticky' },
      { id: 'absolute', label: 'Absolute' }
    ],
    on: PLACED
  },
  /*
   * The four edges, drawn as the four pictures the padding rows already use — a reader matching a
   * shape rather than reading 상 우 하 좌 four times.
   *
   * **No `min`**, where every other length here has one. These are offsets rather than sizes: a
   * negative one lifts a card into the band above it, which is most of how a page stops looking like
   * a stack of rectangles, and a field that refused it would have made overlap unreachable while
   * appearing to offer it.
   */
  /**
   * **X · Y · W · H**, for a block that places itself — the four numbers a designer looks for and
   * could not find here.
   *
   * The attributes are the ones this model has always had: `insetLeft`/`insetTop` for where it
   * starts, and `maxWidth`/`minHeight` for how big it is. What was missing is that they were spread
   * over two groups under names a flow layout needs and a placed block does not: a width that is
   * pinned is not a **최대**, it is the width, and 왼쪽 is a distance from an edge until the block has
   * coordinates and then it is simply X.
   *
   * So the same attributes are offered twice, under two names, and `when` decides which pair a
   * reader sees. `Sticky` keeps the edge names, because a sticky block genuinely is *some distance
   * from an edge* — it is placed relative to the scroll, not at a coordinate.
   *
   * Only `absolute`, and the four together: two of them under one heading is the layout every design
   * tool draws, and finding W three groups below X is the thing that made this unfindable.
   */
  {
    attr: 'insetLeft',
    command: 'setBlockFormat',
    group: '위치',
    tab: 'block',
    label: 'X',
    ariaLabel: '가로 위치',
    control: 'number',
    unit: 'px',
    when: { attr: 'position', is: ['absolute'] },
    on: PLACED,
    // Side by side, because X and Y are one decision said twice — the layout every tool draws.
    with: [
      { attr: 'insetTop', command: 'setBlockFormat', group: '위치', tab: 'block', label: 'Y', ariaLabel: '세로 위치', control: 'number', unit: 'px', on: PLACED }
    ]
  },
  {
    attr: 'maxWidth',
    command: 'setBlockFormat',
    group: '위치',
    tab: 'block',
    label: 'W',
    ariaLabel: '너비',
    control: 'number',
    unit: 'px',
    min: 0,
    when: { attr: 'position', is: ['absolute'] },
    on: PLACED,
    with: [
      { attr: 'minHeight', command: 'setBlockFormat', group: '위치', tab: 'block', label: 'H', ariaLabel: '높이', control: 'number', unit: 'px', min: 0, on: PLACED }
    ]
  },

  { attr: 'insetTop', command: 'setBlockFormat', group: '위치', tab: 'block', label: '위', ariaLabel: '위에서', icon: 'padding-top', control: 'number', unit: 'px', when: { attr: 'position', is: ['sticky'] }, on: PLACED },
  { attr: 'insetRight', command: 'setBlockFormat', group: '위치', tab: 'block', label: '오른쪽', ariaLabel: '오른쪽에서', icon: 'padding-right', control: 'number', unit: 'px', when: { attr: 'position', is: ['sticky'] }, on: PLACED },
  { attr: 'insetBottom', command: 'setBlockFormat', group: '위치', tab: 'block', label: '아래', ariaLabel: '아래에서', icon: 'padding-bottom', control: 'number', unit: 'px', when: { attr: 'position', is: ['sticky'] }, on: PLACED },
  { attr: 'insetLeft', command: 'setBlockFormat', group: '위치', tab: 'block', label: '왼쪽', ariaLabel: '왼쪽에서', icon: 'padding-left', control: 'number', unit: 'px', when: { attr: 'position', is: ['sticky'] }, on: PLACED },
  /*
   * And what is **over** what. Offered with no position chosen as well, because a block in the flow
   * needs it too: a header that scrolls under a hero picture is this one number.
   */
  { attr: 'zOrder', command: 'setBlockFormat', group: '위치', tab: 'block', label: '순서', ariaLabel: '겹침 순서', control: 'number', on: PLACED },
  /**
   * **How many columns of a grid this one takes** — what turns a page of equal tiles into a bento.
   *
   * In 위치 rather than 크기 because it is not a width: the block is still whatever the grid's column
   * is, there are simply more of them. Offered on everything a grid can hold, and it draws nothing
   * outside one — which is `grid-column`'s own honest behaviour and is argued in `sizing.ts`.
   */
  /**
   * **Middle of what holds it** — the other half of a maximum width.
   *
   * Beside 칸 수 because both are about where a block sits rather than how big it is, and a reader
   * who has just capped a column is one row away from the question this answers.
   */
  {
    attr: 'centred',
    command: 'setBlockFormat',
    group: '위치',
    tab: 'block',
    label: '가운데',
    ariaLabel: '가운데에 놓기',
    control: 'toggle',
    on: [...PLACED, 'picture', 'textFrame']
  },
  {
    attr: 'span',
    command: 'setBlockFormat',
    group: '위치',
    tab: 'block',
    label: '칸 수',
    ariaLabel: '그리드에서 차지할 칸 수',
    control: 'number',
    fallback: 1,
    min: 1,
    max: 12,
    on: [...PLACED, 'picture', 'textFrame']
  },

  // ── 바탕 and 테두리 — any of these may hold `var:이름` rather than a colour ─
  /**
   * **What the words look like** — the pane a reader gets when they have selected some.
   *
   * ## The gap this closes, which is the third of its kind
   *
   * `FontSizeExtension` and `FontColorExtension` are installed by this product's kit and have been
   * for as long as it has existed. `setFontSize`, `setFontColor`, `removeFontSize` and
   * `removeFontColor` are all registered, all work, and **no surface anywhere offered one** — the
   * toolbar has four mark toggles and stops. The sample uses both, twenty times, through helpers
   * written by hand in `sample-site.ts`: a reader of this product could not make the page this
   * product ships as its own example.
   *
   * The same shape as `linkToAddress` and as the `ink` on a box: something the model can do, the
   * renderer already draws, the export already writes, and nothing lets a reader say.
   *
   * ## Why it is a pane and not two more toolbar buttons
   *
   * Because of what the panel does *instead* right now. Select some words and it shows the **page's**
   * background and shadow, under a sentence asking the reader to select a block — at the exact
   * moment they have selected the most specific thing in the document. Every tool of this kind puts
   * type properties in the panel for this reason: the panel describes what is selected, and words
   * are a thing that can be selected.
   *
   * ## `on: ['inline-text']`
   *
   * Which is what a range's ends actually name, and it is also what makes the rows escape the schema
   * gate: a mark is not an attribute, so `declares` would answer no for both of these forever. A row
   * with `on` is a claim the product makes directly, which is right here — that marks apply to runs
   * is a fact about the mark vocabulary rather than about this schema.
   */
  {
    attr: 'fontSize',
    command: 'setFontSize',
    group: '글자',
    tab: 'text',
    label: '크기',
    ariaLabel: '글자 크기',
    control: 'number',
    unit: 'px',
    min: 1,
    on: ['inline-text']
  },
  {
    attr: 'fontColor',
    command: 'setFontColor',
    group: '글자',
    tab: 'text',
    label: '색',
    /*
     * Not 글자 색, which the box's `ink` row already answers to. Two different decisions were about
     * to share one accessible name: a **block** states the colour everything inside it inherits, and
     * this states the colour of the run a reader has selected. `calls no two rows the same thing`
     * caught it the minute the row was declared, which is what that check is for — and the fix is
     * two names that are each more precise than the one they collided over.
     */
    ariaLabel: '선택한 글자 색',
    control: 'colour',
    on: ['inline-text']
  },

  ...PAINT,

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

  // ── 열림 — the gesture half of the third state ─────────────────────────────
  /**
   * What pressing this block opens.
   *
   * The other half of 열림 lives in the state picker: a block says what it looks like *when open*,
   * and this says who opens it. Two blocks and one gesture, which is what a hamburger, an accordion,
   * a tab and a 더보기 all are.
   *
   * At rest rather than inside the state, deliberately. It is not a value the state *changes* — it
   * is a fact about **this** block, and the block it names is a different one. A reader setting the
   * menu's open appearance is looking at the menu; a reader saying what opens it is looking at the
   * hamburger, and putting the row inside the state would have asked them to set it from the wrong
   * block.
   */
  /**
   * **Where pressing this goes** — the row without which `goes` is a field nothing can write.
   *
   * Its own group and above 열림, because between the two gestures a block can be, going somewhere is
   * the ordinary one: most buttons on most sites are links, and one that opens a panel is the
   * special case. A reader looking for 누르면 should find it first.
   *
   * Two halves in one row, because a destination is genuinely two kinds of thing and a reader knows
   * which they mean: a **page of this site**, picked by name so a rename follows it, or an **address**
   * typed out — `https://…`, `mailto:`, `#main`. Neither is a default and the empty choice is a
   * block that is not a control at all, which is what most blocks are.
   */
  {
    attr: 'goes',
    command: 'setBlockFormat',
    group: '누르면',
    tab: 'block',
    label: '가는 곳',
    ariaLabel: '누르면 가는 곳',
    control: 'goes',
    on: [...STACKS, 'instance', 'picture', 'collection']
  },
  {
    attr: 'opens',
    /*
     * Its own command, because the row writes **two** blocks: what this one opens, and a durable
     * name on the block being opened so there is something to record. `setBlockFormat` writes one
     * node's attributes and would have written the sid a reader pointed at — a name no saved
     * document can carry. See `setOpens`.
     */
    command: 'setOpens',
    group: '열림',
    tab: 'block',
    label: '여는 것',
    ariaLabel: '이 블록이 여는 블록',
    control: 'opens',
    on: STACKS
  },
  /**
   * And whether it has **already been pressed** when a visitor arrives.
   *
   * Under 여는 것 rather than beside 보임, because it is a fact about the gesture: a reader setting it
   * is looking at the tab, not at the panel. A tab strip needs exactly one of them on — a tab strip
   * showing nothing is the one state it must never be in — and the insert turns the first one on so
   * the reader starts from a working one rather than an empty box.
   */
  {
    attr: 'openAtRest',
    command: 'setBlockFormat',
    group: '열림',
    tab: 'block',
    label: '처음부터',
    ariaLabel: '처음부터 열려 있음',
    control: 'toggle',
    // Only where there is a gesture to qualify. A block that opens nothing cannot be open at rest.
    when: { attr: 'opens' },
    on: STACKS
  },
  /**
   * And whether **only one** thing inside this block may be open at a time.
   *
   * The one switch that turns an accordion into a tab strip, which is why it is worth a row rather
   * than two separate inserts that drift apart: it makes the switches inside radios that share a
   * name, and a radio group is the browser's own answer to *one of these*.
   *
   * On the container, and the panel offers it on every stack rather than only on the two the insert
   * makes — a reader who built their own three-panel thing out of rows has exactly the same set.
   */
  {
    attr: 'opensOne',
    command: 'setBlockFormat',
    group: '열림',
    tab: 'block',
    label: '하나만',
    ariaLabel: '안에서 하나만 열림',
    control: 'toggle',
    on: STACKS
  },
  /**
   * And **what turning it on costs**, said once it is on.
   *
   * A radio cannot be unpressed. That is right for a tab strip — a tab strip with nothing chosen is
   * the one state it must never be in — and it is a surprise for an accordion, where a visitor who
   * has opened one answer can no longer close everything.
   *
   * A consequence rather than a fault, so it is not in the fault list: nothing is wrong with the
   * document and there is nothing to fix. It is the kind of thing a reader finds out from a visitor,
   * which is the worst way to find anything out, so the panel says it at the moment they choose.
   *
   * `needs: 'opensOne'` is the whole of its logic — the row is drawn only while the switch is on,
   * which is the mechanism the panel already has rather than a special case in the surface.
   */
  {
    attr: 'opensOne',
    group: '열림',
    tab: 'block',
    label: '',
    ariaLabel: '하나만 열림일 때의 동작',
    control: 'note',
    when: { attr: 'opensOne', is: [true] },
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
      { attr: 'cornerTopLeft', command: 'setBlockFormat', group: '상자', tab: 'style', label: '상좌', ariaLabel: '왼쪽 위 둥글기', icon: 'corner-top-left', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerTopRight', command: 'setBlockFormat', group: '상자', tab: 'style', label: '상우', ariaLabel: '오른쪽 위 둥글기', icon: 'corner-top-right', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerBottomRight', command: 'setBlockFormat', group: '상자', tab: 'style', label: '하우', ariaLabel: '오른쪽 아래 둥글기', icon: 'corner-bottom-right', control: 'number', unit: 'px', min: 0, on: STACKS },
      { attr: 'cornerBottomLeft', command: 'setBlockFormat', group: '상자', tab: 'style', label: '하좌', ariaLabel: '왼쪽 아래 둥글기', icon: 'corner-bottom-left', control: 'number', unit: 'px', min: 0, on: STACKS }
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
  /**
   * **The deliberate disruption.** A page of upright rectangles reads as a template.
   *
   * Beside 투명도 because it is the same kind of decision — what this box does that the flow did not
   * ask for — and because both make a stacking context, which is a cost worth meeting in one place.
   */
  {
    attr: 'rotate',
    command: 'setBlockFormat',
    group: '상자',
    tab: 'style',
    label: '기울기',
    ariaLabel: '기울기',
    control: 'number',
    unit: '°',
    fallback: 0,
    min: -30,
    max: 30,
    step: 0.5,
    on: [...STACKS, 'picture', 'instance', 'textFrame']
  },
  /**
   * **How this box mixes with what is under it.** `곱하기` is what a second ink does on paper.
   *
   * Four and no more; `effectsCss` argues why a list of sixteen is a list nobody can predict.
   */
  {
    attr: 'blend',
    command: 'setBlockFormat',
    group: '상자',
    tab: 'style',
    label: '섞임',
    ariaLabel: '아래와 섞이는 방식',
    control: 'choice',
    fallback: '',
    options: [
      { id: '', label: 'Normal' },
      { id: 'multiply', label: 'Multiply' },
      { id: 'screen', label: 'Screen' },
      { id: 'overlay', label: 'Overlay' },
      { id: 'difference', label: 'Difference' }
    ],
    on: [...STACKS, 'picture', 'instance', 'textFrame']
  },
  /**
   * **Frosted glass.** Only visible through a translucent fill, which is what the label says out
   * loud — a reader who sets it on an opaque card sees nothing and would otherwise think it broken.
   */
  {
    attr: 'backdropBlur',
    command: 'setBlockFormat',
    group: '상자',
    tab: 'style',
    label: '뒤 흐리기',
    ariaLabel: '뒤 흐리기 (반투명한 바탕에서만 보입니다)',
    control: 'number',
    unit: 'px',
    fallback: 0,
    min: 0,
    max: 60,
    on: [...STACKS, 'picture', 'instance', 'textFrame']
  },

  // ── 글 리듬 — what the words in this box are set at, for everything inside ──
  /**
   * **The rhythm, on the box rather than on the words**, and inherited — `ink`'s argument exactly.
   *
   * A band is set tight and everything in it is set tight; a run that says its own still wins. The
   * unit is a **percentage of the font's own size**, so a heading tracked at -2.5% stays tracked
   * when the type scale grows it — `paint.ts` says why twips would have been wrong here.
   */
  {
    attr: 'letterSpacing',
    command: 'setBlockFormat',
    group: '글 리듬',
    tab: 'style',
    label: '자간',
    ariaLabel: '글자 사이 간격',
    control: 'number',
    unit: '%',
    fallback: 0,
    min: -10,
    max: 40,
    step: 0.5,
    on: [...STACKS, 'textFrame']
  },
  {
    attr: 'lineHeight',
    command: 'setBlockFormat',
    group: '글 리듬',
    tab: 'style',
    label: '줄 간격',
    ariaLabel: '줄 사이 간격',
    control: 'number',
    unit: '%',
    min: 80,
    max: 260,
    step: 5,
    on: [...STACKS, 'textFrame']
  },

  // ── 이미지 ─────────────────────────────────────────────────────────────────
  /**
   * **The file, or the address** — one row, because a reader choosing a picture is doing one thing.
   *
   * A picker of the files the document holds, plus 파일 넣기, plus whatever address is already there.
   * Two rows would have made the reader decide which *kind* of picture they wanted before they had
   * chosen one, which is the editor's bookkeeping showing through.
   *
   * The file itself is read by the **app** — a browser's job, and the same line `publish` draws about
   * writing one — and arrives as `insertAsset`.
   */
  { attr: 'src', command: 'setBlockFormat', group: '이미지', tab: 'style', label: '그림', ariaLabel: '그림 파일', control: 'picture', on: ['picture'] },
  // Not decoration: it is what a reader of the published page hears.
  { attr: 'alt', command: 'setBlockFormat', group: '이미지', tab: 'style', label: '설명', ariaLabel: '대체 텍스트', control: 'text', on: ['picture'] },
  /**
   * **The shape it keeps** at every width, which a height cannot say — see `aspect.ts`.
   *
   * Beside 채우는 방식 rather than in 크기, because they are one decision: a reader who states a shape
   * almost always wants the picture to fill it, which is a **crop**, and the two rows next to each
   * other is what makes that visible before the crop is a surprise.
   */
  {
    attr: 'aspect',
    command: 'setBlockFormat',
    group: '이미지',
    tab: 'style',
    label: '비율',
    ariaLabel: '그림 비율',
    control: 'choice',
    fallback: '',
    options: ASPECT_LABELS,
    on: ['picture']
  },
  /**
   * **Whether to wait until it is needed.**
   *
   * `lazy` on a picture above the fold delays the one image a visitor is waiting for, which is why
   * this is the reader's decision rather than a rule the product applies to everything but the first
   * picture it happens to draw: a hero says no and a photograph eight sections down says yes, and
   * nothing but the design knows which.
   */
  {
    attr: 'defer',
    command: 'setBlockFormat',
    group: '이미지',
    tab: 'style',
    label: '나중에',
    ariaLabel: '보일 때 불러오기',
    control: 'toggle',
    on: ['picture']
  },
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
      { id: 'cover', label: 'Cover' },
      { id: 'contain', label: 'Contain' },
      { id: 'fill', label: 'Stretch' }
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
  /**
   * **What kind of thing this variable holds**, and it is not decoration.
   *
   * A card's question was answered with a string and drawn exactly as stored, so the only way to
   * make a price read as `월 9,900원` was to store those words — a value nothing can compare, and it
   * cost the sample's own pricing page its order for as long as that page has existed. Saying the
   * kind is what lets the data hold `9900` and the card say how it reads.
   */
  {
    attr: 'componentVar',
    writes: 'child',
    command: 'setComponentVar',
    group: '컴포넌트 변수',
    tab: 'block',
    label: '값 종류',
    ariaLabel: '변수가 담는 값의 종류',
    control: 'varKind',
    single: true,
    on: ['heading', 'paragraph', 'listItem']
  },
  /*
   * And how it reads — offered only where there is a reading to choose, which is a `number` or a
   * `date`. A text variable reads as itself and always will.
   */
  {
    attr: 'componentVar',
    writes: 'child',
    command: 'setComponentVar',
    group: '컴포넌트 변수',
    tab: 'block',
    label: '표시 형식',
    ariaLabel: '값을 보여주는 형식',
    control: 'varFormat',
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
  /**
   * **The widths this site is designed at**, as a list a reader adds to.
   *
   * Four commands and one control, which is what the four rows here say. A widths list *is* four
   * things a reader can do — add one, change one, take one away, move one — and drawing them as four
   * separate panel rows would be four labels for one list. So they are **declared** separately, which
   * is how `every-command-can-be-reached` can see all four, and **drawn** together by the one control
   * the leader names: the companions answer `null` from `own`, and the comment there says why.
   *
   * In 사이트 rather than in the rail, because the rail is at five panels and its own note says the
   * sixth turns it into an icon rail — a redesign that has nothing to do with widths. And a width is
   * the site's, like its address: a reader with nothing selected is looking at the page *and* the
   * site, which is exactly when they want to add a board.
   */
  {
    attr: 'width',
    of: 'document',
    writes: 'child',
    command: 'insertWidth',
    group: '폭',
    tab: 'page',
    label: '폭',
    ariaLabel: '이 사이트를 그리는 폭',
    control: 'widths',
    /*
     * The whole width, with no label column: the group already says 폭, and saying it again beside
     * every line costs 74 pixels of a list that needs all of them — see `SheetRow.wide`.
     */
    wide: true,
    on: ['surface'],
    with: [
      {
        attr: 'width',
        of: 'document',
        writes: 'child',
        command: 'setWidth',
        group: '폭',
        tab: 'page',
        label: '폭 고치기',
        ariaLabel: '폭 고치기',
        control: 'widths-part',
        on: ['surface']
      },
      {
        attr: 'width',
        of: 'document',
        writes: 'child',
        command: 'removeWidth',
        group: '폭',
        tab: 'page',
        label: '폭 삭제',
        ariaLabel: '폭 삭제',
        control: 'widths-part',
        on: ['surface']
      },
      {
        attr: 'width',
        of: 'document',
        writes: 'child',
        command: 'moveWidth',
        group: '폭',
        tab: 'page',
        label: '폭 순서',
        ariaLabel: '폭 순서 바꾸기',
        control: 'widths-part',
        on: ['surface']
      }
    ]
  },

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

  /**
   * **The picture in a browser tab** — the cheapest thing that makes a published site look like a
   * site rather than a file somebody opened.
   *
   * A file the document holds, which is why it could not exist before the assets did: a favicon is
   * bytes, and until a document could carry a file there was nowhere for them to be.
   */
  { attr: 'icon', of: 'document', command: 'setSiteFiles', group: '사이트', tab: 'page', label: '탭 그림', ariaLabel: '브라우저 탭 그림', control: 'picture', on: ['surface'] },
  /*
   * And what a crawler is told, which matters most in the state nobody tests: a staging copy of a
   * site that was published before it was ready and is now in somebody's search result.
   */
  /**
   * **Two rows say 검색 제외** and they are not the same decision, which the labels used to hide.
   *
   * This one writes `robots.txt` — `Disallow: /`, the whole site, every page — and the one in the
   * 페이지 group writes `<meta name="robots" content="noindex">` on the page in front of the reader.
   * Both were labelled `검색 제외`, on the **same tab**, so the 페이지 tab showed two checkboxes with
   * identical words a group heading apart, and pressing the wrong one takes a site off the internet.
   *
   * The `ariaLabel`s were already distinct, which is the tell: somebody had already noticed the two
   * needed telling apart and told only the screen reader.
   */
  { attr: 'noIndex', of: 'document', command: 'setSiteFiles', group: '사이트', tab: 'page', label: '사이트 전체 제외', ariaLabel: '검색 엔진에서 사이트 전체를 제외', control: 'toggle', on: ['surface'] },


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
  },
  /*
   * And the two a **page** answers rather than the site: which one a host serves for an address it
   * cannot match, and whether this one in particular should stay out of a search result.
   */
  { attr: 'notFound', command: 'setPageInfo', group: '페이지', tab: 'page', label: '없는 주소용', ariaLabel: '주소가 틀렸을 때 보일 페이지', control: 'toggle', on: ['surface'] },
  { attr: 'noIndex', command: 'setPageInfo', group: '페이지', tab: 'page', label: '이 페이지만 제외', ariaLabel: '이 페이지를 검색에서 제외', control: 'toggle', on: ['surface'] },

  /**
   * And the **picture** a shared link shows — the half of an unfurl anybody actually looks at.
   *
   * The page's rather than the site's, because the page whose card matters most is a post: a blog
   * with one picture for every article is a blog nobody clicks twice.
   */
  {
    attr: 'image',
    command: 'setPageInfo',
    group: '페이지',
    tab: 'page',
    label: '공유 그림',
    ariaLabel: '공유했을 때 보이는 그림',
    control: 'text',
    on: ['surface']
  },

  // ── 서체 — what the whole site is set in ──────────────────────────────────
  /**
   * **What the site is set in.**
   *
   * Colour has been a token since the day the page had one; the second thing a brand changes has been
   * unreachable. Four heading sizes and a font stack lived in `page-css.ts`, so every site this
   * product made came out in the same type.
   *
   * In the page pane, which is the one a reader reaches by selecting nothing — because it is the
   * **document's** answer, like the address, and not the page's. `of: 'document'` says so, which is
   * what the check that reads these rows compares against.
   */
  { attr: 'bodyFace', of: 'document', command: 'setSiteType', group: '서체', tab: 'page', label: '본문', ariaLabel: '본문 글꼴', control: 'choice', fallback: '', options: FACES.map((one) => ({ id: one.id, label: one.label })), on: ['surface'] },
  /*
   * A site that says nothing about its headings is set in one face, which is what most sites are —
   * so the fallback is *the body's*, and the row says so rather than repeating the list's first entry.
   */
  { attr: 'headingFace', of: 'document', command: 'setSiteType', group: '서체', tab: 'page', label: '제목', ariaLabel: '제목 글꼴', control: 'choice', fallback: '', options: [{ id: '', label: '본문과 같게' }, ...FACES.filter((one) => one.id).map((one) => ({ id: one.id, label: one.label }))], on: ['surface'] },
  { attr: 'baseSize', of: 'document', command: 'setSiteType', group: '서체', tab: 'page', label: '글자 크기', ariaLabel: '본문 글자 크기', control: 'number', unit: 'px', min: 12, max: 24, on: ['surface'] },
  /*
   * A **ratio**, and the steps are geometric — which is what a design system means by a scale and what
   * four hand-picked numbers only approximate. A reader who wants bigger headings wants all of them
   * bigger in proportion, and keeping four numbers in proportion by hand is the work this replaces.
   */
  { attr: 'scale', of: 'document', command: 'setSiteType', group: '서체', tab: 'page', label: '제목 단계', ariaLabel: '제목 크기 단계', control: 'choice', fallback: '', options: SCALES.map((one) => ({ id: one.id, label: one.label })), on: ['surface'] },

  /**
   * **And the page's own paint** — the same rows a block gets, asked of the page.
   *
   * Last, because it is the least identifying thing about a page and a reader arriving with nothing
   * selected is most often looking for the address. `paintCss` has read these off a page since the
   * day one could hold a gradient; what was missing was anywhere to say them.
   *
   * They are written **at the width being edited**, like every other paint row — which is the other
   * half of *개별 크기별 페이지도 속성 설정할 수 있어야 하는 거 아니야?*: a page that is white on a
   * desktop and dark on a phone is one page with an override, not two pages.
   */
  ...PAINT.map(pagePaint)
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
