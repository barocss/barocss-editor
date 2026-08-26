/**
 * What the deck's property panel offers, as data.
 *
 * ## The third surface, for the second product
 *
 * `toolbar-model.ts` and `keymap.ts` are already here, and their headers say why: a control declared
 * in JSX is *"a declaration nothing can read"*. The panel was the one surface still in the app, and
 * the conformance test paid for it in prose — **33 exemptions that describe a row** in this product
 * alone. The site builder moved its panel first (`office-site/src/panel-model.ts`) and the same three
 * things fell out; this is that, for the deck.
 *
 * ## Why the shape is different from the site's, and where it is the same
 *
 * The same: a row names an attribute, a command, a control kind and where it appears, and nothing
 * about how it looks.
 *
 * Different: a **canvas** panel is mostly geometry and paint, and both are lists — a shape has a
 * *stack* of fills and a *stack* of effects, and a definition asks a variable question per bindable
 * attribute. So more of the kinds here are `list`-shaped than in a page's panel, where a row is
 * nearly always one value.
 *
 * Two products is a coincidence; the rule this repository uses is that the third one makes a shared
 * component. If Word's chrome ever grows a panel, `SlidesPanelRow` and `SitePanelRow` become one
 * type in `office-controls`, which is where `Control` already lives.
 *
 * ## What the deck's panel writes, measured rather than remembered
 *
 * Every row below was read out of `apps/slide/src/properties.tsx` — the helper it calls, and the
 * keys that helper is handed — and then checked against the panel a browser actually draws
 * (`panel-model.test.ts` and the deck's own suite). A declaration written from memory is the thing
 * this file exists to stop.
 */

/** The kinds of control the deck's panel draws. Closed, so a reader of this file has seen them all. */
export type SlidesPanelControl =
  | 'number'
  | 'text'
  | 'colour'
  | 'choice'
  | 'toggle'
  /** A stack of them — a shape's fills, its effects — with add and remove. */
  | 'list'
  /** One row per bindable attribute, offering the variables whose kind fits. */
  | 'binds'
  /** A length in the reader's chosen unit, which a deck has and a page does not. */
  | 'length';

/** Which pane the row sits in. The deck has two: what a shape *is*, and what it *does*. */
export type SlidesPanelTab = 'style' | 'motion';

export interface SlidesPanelRow {
  /** The attribute the row writes. */
  attr: string;
  /**
   * Whether the row writes an attribute **of the selected node**, or of a node that node owns.
   *
   * The site's model needed the same distinction and for the same reason — the schema prefers
   * declarations made of nodes — but a deck has four of them rather than one, because a deck's panel
   * is partly about *time*: a slide's transition and a film's start are attributes of a `motion`
   * node the slide or the box owns, not of the slide or the box. A single field meaning both would
   * be the declaration lying about what it does, and the test that reads this file said so.
   */
  writes?: 'attr' | 'child';
  /** The command that writes it. */
  command: string;
  /** The heading it sits under. */
  group: string;
  tab: SlidesPanelTab;
  /** What a screen reader and a test read. Unique within the panel — see the site's model. */
  ariaLabel: string;
  control: SlidesPanelControl;
  /**
   * Which node types the row appears for. Absent means every box a reader can select.
   *
   * A list rather than a predicate, so "which rows can ever set `bend`" is a question about this
   * array and not about running the panel.
   */
  on?: string[];
  /**
   * Shown only when the selection is **inside** something.
   *
   * `on` says which node type a row is about and cannot say where that node is, and one group needs
   * the second question: a part's variable binding is a fact about the *definition* it belongs to,
   * so the row appears for a shape inside a `component` and for the identical shape on a slide it
   * does not. The other value is the same shape of question about a frame: what a box asks of
   * the arrangement around it means nothing where there is no arrangement. Declared rather than left to the panel because a check reading this file would
   * otherwise expect the row on every shape and be right to.
   */
  inside?: 'component' | 'arrangedFrame';
  /**
   * Shown only when another attribute has this value.
   *
   * A grid has columns and nothing else does, so the row belongs to one arrangement rather than to
   * the group. The site's model has the identical field for the identical row, which is the second
   * time these two have wanted the same thing — the third makes them one type.
   *
   * A **list** of values rather than one, because a frame that arranges nothing has no gap, no
   * padding and no cross axis either: those three belong to `row`, `column` and `grid` alike, and
   * only the column count belongs to a grid alone.
   */
  when?: { attr: string; is: unknown[] };
}

/** Every box a reader selects on a slide, which is what a row with no `on` applies to. */
const BOXES = [
  'frame',
  'rectangle',
  'ellipse',
  'line',
  'path',
  'textFrame',
  'picture',
  'sticky',
  'group',
  'instance',
  'connector',
  'mediaVideo',
  'mediaAudio'
];

/** The ones with a fill and a line — a connector has a stroke and no fill, and a group has neither. */
const PAINTED = ['frame', 'rectangle', 'ellipse', 'path', 'textFrame', 'picture', 'sticky', 'instance'];

/** The ones a corner radius means anything on. */
const CORNERED = ['frame', 'rectangle', 'textFrame', 'picture', 'sticky'];

const geometry = (attr: string, ariaLabel: string, control: SlidesPanelControl = 'length'): SlidesPanelRow => ({
  attr,
  command: 'setBoxGeometry',
  group: '배치',
  tab: 'style',
  ariaLabel,
  control
});

const paint = (attr: string, ariaLabel: string, control: SlidesPanelControl): SlidesPanelRow => ({
  attr,
  command: 'setBoxStyle',
  group: '채우기와 선',
  tab: 'style',
  ariaLabel,
  control,
  on: PAINTED
});

const line = (attr: string, ariaLabel: string, control: SlidesPanelControl): SlidesPanelRow => ({
  attr,
  command: 'setConnector',
  group: '연결선',
  tab: 'style',
  ariaLabel,
  control,
  on: ['connector']
});

export const SLIDES_PANEL: SlidesPanelRow[] = [
  // ── 배치 — where a box is and how big ──────────────────────────────────────
  geometry('x', 'X'),
  geometry('y', 'Y'),
  geometry('width', '너비'),
  geometry('height', '높이'),
  geometry('rotation', '회전', 'number'),
  geometry('opacity', '불투명도', 'number'),
  geometry('visible', '표시', 'toggle'),
  /*
   * Locked is its own command, and that is not tidiness: everything else in this group refuses to
   * run while the box is locked, so a lock written by the same command would be a control that can
   * turn itself off and never on again.
   */
  { attr: 'locked', command: 'setBoxLocked', group: '배치', tab: 'style', ariaLabel: '잠금', control: 'toggle' },
  /*
   * Where pressing it goes, in a deck being presented. Three attributes and one control: a reader
   * picks a destination and the command works out whether that is a slide, a named place or another
   * deck — which is why `goToKind` and `goToDeck` have no row of their own.
   */
  { attr: 'goTo', command: 'setBoxJump', group: '배치', tab: 'style', ariaLabel: '누르면 이동', control: 'choice' },

  // ── The arrangement a frame imposes on what is in it ───────────────────────
  { attr: 'layoutMode', command: 'setFrameLayout', group: '배치', tab: 'style', ariaLabel: '배치 방향', control: 'choice', on: ['frame'] },
  { attr: 'gap', command: 'setFrameLayout', group: '배치', tab: 'style', ariaLabel: '간격', control: 'length', on: ['frame'], when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  { attr: 'padding', command: 'setFrameLayout', group: '배치', tab: 'style', ariaLabel: '안쪽 여백', control: 'length', on: ['frame'], when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  // `교차 축 맞춤`, not `맞춤` — the browser check is what caught the difference, which is the whole
  // reason a declaration read out of JSX needs one.
  { attr: 'alignItems', command: 'setFrameLayout', group: '배치', tab: 'style', ariaLabel: '교차 축 맞춤', control: 'choice', on: ['frame'], when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  {
    attr: 'columns',
    command: 'setFrameLayout',
    group: '배치',
    tab: 'style',
    // `열 수`, not `열` — the row's *label* is 열 and its accessible name is not, which is exactly
    // the kind of difference a declaration read out of JSX gets wrong and a browser check catches.
    ariaLabel: '열 수',
    control: 'number',
    on: ['frame'],
    when: { attr: 'layoutMode', is: ['grid'] }
  },
  // And what a child asks of the frame around it, which is the other half of the same conversation.
  /*
   * `프레임 가득 채우기`, not `가득` — and the panel's own comment says why the *label* is the short
   * one: 채우기 already means paint in this panel, so the accessible name has to be the sentence.
   * Shown only inside a frame that arranges, which is the only place the question means anything.
   */
  { attr: 'layoutStretch', command: 'setBoxLayout', group: '배치', tab: 'style', ariaLabel: '프레임 가득 채우기', control: 'toggle', inside: 'arrangedFrame' },
  { attr: 'layoutGrow', command: 'setBoxLayout', group: '배치', tab: 'style', ariaLabel: '남은 공간 늘리기', control: 'toggle', inside: 'arrangedFrame' },

  // ── 채우기와 선 ────────────────────────────────────────────────────────────
  /*
   * `fills` is the list and `fill` is the one colour a shape has when it has no list — `paintsOf`
   * reads the list when there is one and falls back to the flat pair. Both are rows because both
   * are what a reader means at different moments: the swatch is the common case and the stack is
   * the one that makes a gradient possible.
   */
  /*
   * A stack's control is its **add** button, and the entries below it are named after their position
   * — `1번 채우기`, `1번 채우기 종류` — because how many there are is a fact about the shape and not
   * about this file. Declaring `채우기` and `효과` was declaring a row that does not exist; the
   * browser check said so.
   */
  paint('fills', '채우기 추가', 'list'),
  paint('effects', '효과 추가', 'list'),
  paint('stroke', '선 색', 'colour'),
  paint('strokeWidth', '선 두께', 'length'),
  paint('strokeDash', '선 모양', 'choice'),
  { attr: 'cornerRadius', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', ariaLabel: '모서리 둥글기', control: 'length', on: CORNERED },
  { attr: 'cornerTopLeft', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', ariaLabel: '왼쪽 위 모서리', control: 'length', on: CORNERED },
  { attr: 'cornerTopRight', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', ariaLabel: '오른쪽 위 모서리', control: 'length', on: CORNERED },
  { attr: 'cornerBottomRight', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', ariaLabel: '오른쪽 아래 모서리', control: 'length', on: CORNERED },
  { attr: 'cornerBottomLeft', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', ariaLabel: '왼쪽 아래 모서리', control: 'length', on: CORNERED },

  // ── 텍스트 — a box that holds words ────────────────────────────────────────
  { attr: 'verticalAlign', command: 'setBoxStyle', group: '텍스트', tab: 'style', ariaLabel: '세로 맞춤', control: 'choice', on: ['textFrame', 'sticky'] },
  { attr: 'textInset', command: 'setBoxStyle', group: '텍스트', tab: 'style', ariaLabel: '텍스트 안쪽 여백', control: 'length', on: ['textFrame', 'sticky'] },

  // ── 그림 ───────────────────────────────────────────────────────────────────
  { attr: 'fit', command: 'setBoxStyle', group: '그림', tab: 'style', ariaLabel: '그림 맞춤', control: 'choice', on: ['picture'] },
  /*
   * One control for four attributes, and it is a *gesture* rather than a form: the crop is dragged
   * on the picture and the panel offers the way back out of it. Four number rows would be four ways
   * to make a picture disappear.
   */
  { attr: 'cropTop', command: 'cropPicture', group: '그림', tab: 'style', ariaLabel: '자르기 원래대로', control: 'toggle', on: ['picture'] },

  // ── 연결선 ─────────────────────────────────────────────────────────────────
  line('kind', '연결선 모양', 'choice'),
  line('flow', '화살표', 'choice'),
  line('bend', '휘어짐', 'number'),
  line('label', '이름표', 'text'),
  line('startLabel', '시작 이름표', 'text'),
  line('endLabel', '끝 이름표', 'text'),
  line('labelBold', '이름표 굵게', 'toggle'),
  line('labelColor', '이름표 색', 'colour'),
  line('labelSize', '이름표 크기', 'length'),

  // ── 문서 변수 연결 ─────────────────────────────────────────────────────────
  /*
   * One declared row and many on screen: which attributes a box may bind is `BINDABLE_ROWS`, and how
   * many rows that produces is a fact about the *node type* and the variables the document holds.
   * The declaration says the shape — this attribute, this command, this kind — the way the site's 값
   * row does.
   */
  { attr: 'varBinds', command: 'setVarBind', group: '문서 변수 연결', tab: 'style', ariaLabel: '문서 변수', control: 'binds' },
  /*
   * And the same question asked of a **definition's part**, which is a different command because the
   * answer is kept in a different place: a shape's binding is the shape's, and a part's binding is a
   * `componentBind` node inside the definition, so that every placement of it is bound too.
   */
  { attr: 'componentBind', writes: 'child', command: 'setComponentBind', group: '컴포넌트 부품', tab: 'style', ariaLabel: '부품 문서 변수', control: 'binds', inside: 'component' },

  // ── 모션 — what a box does, as opposed to what it is ───────────────────────
  /*
   * The node the schema actually has, which is `motionTrack` — a box's steps live on one, and the
   * row adds a step to it. `motion` was the word in my head and not the word in the schema, and the
   * test that reads this file is what said so.
   */
  { attr: 'motionTrack', writes: 'child', command: 'addBoxesMotion', group: '모션', tab: 'motion', ariaLabel: '모션 추가', control: 'list' },
  /*
   * `startsWith`, not `playback` — and the correction is worth keeping, because it is what a
   * declaration written from memory looks like when something checks it. The row asks *when a film
   * starts relative to the step before it*, which is a motion-track attribute; `autoplay`,
   * `controls`, `loop` and `muted` are the media's own and this panel offers none of them.
   */
  { attr: 'startsWith', writes: 'child', command: 'setBoxPlayback', group: '재생', tab: 'motion', ariaLabel: '재생 시작', control: 'choice', on: ['mediaVideo', 'mediaAudio'] },
  /*
   * A slide's transition is not on a box at all — it is a `motion` node on the slide, which is why
   * the row's `on` names the surface and its command takes a `slideId`. `effect` and `duration` are
   * the two things it writes.
   */
  { attr: 'effect', writes: 'child', command: 'setSlideTransition', group: '화면 전환', tab: 'motion', ariaLabel: '화면 전환', control: 'choice', on: ['surface'] }
];

/** The rows for one node type, in one pane, in the order the panel draws them. */
export function slidesPanelRows(stype: string | undefined, tab?: SlidesPanelTab): SlidesPanelRow[] {
  return SLIDES_PANEL.filter(
    (row) =>
      (tab === undefined || row.tab === tab) &&
      (row.on === undefined ? stype !== undefined && BOXES.includes(stype) : stype !== undefined && row.on.includes(stype))
  );
}

/** Every command the panel can run — the deck's third answer to "what can a reader reach". */
export function slidesPanelCommands(): string[] {
  return [...new Set(SLIDES_PANEL.map((row) => row.command))];
}

/**
 * Every attribute the panel can set.
 *
 * Some rows write **more than one**, and saying so is the point of this function rather than of the
 * rows: a destination picker writes `goTo`, `goToKind` and `goToDeck` together because a reader
 * chooses one thing and the command works out which of the three it was, and a crop reset writes all
 * four crops. A row per hidden attribute would be four controls a reader never wants.
 */
export function slidesPanelAttrs(): string[] {
  const also: Record<string, string[]> = {
    goTo: ['goToKind', 'goToDeck'],
    cropTop: ['cropRight', 'cropBottom', 'cropLeft'],
    // A gradient and a flat shadow are what `fills` and `effects` fall back to, and the panel's
    // stack writes whichever the shape is using.
    /*
     * And the flat pair the stack writes when a shape has no list — plus `fill` itself, which has no
     * row: a shape's one colour *is* the first entry of the paint stack, so the swatch a reader
     * presses is `1번 채우기` rather than a separate 색 row. Declaring one was declaring a control
     * that is not there.
     */
    fills: ['fill', 'gradientFrom', 'gradientTo', 'gradientAngle', 'gradientKind'],
    effects: ['shadowColor', 'shadowBlur', 'shadowAngle', 'shadowDistance'],
    // The transition row sets how long it takes as well as what it is.
    effect: ['duration']
  };
  return [...new Set(SLIDES_PANEL.flatMap((row) => [row.attr, ...(also[row.attr] ?? [])]))];
}
