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

import {
  panelAttrs,
  panelCommands,
  panelGroupsFor,
  panelRowsFor,
  type PanelRow
} from '@barocss/office-controls';

/**
 * The kinds of control the deck's panel draws.
 *
 * The first five are `office-controls`' `CommonPanelControl`, which `office-ui`'s `PropertySheet`
 * draws unaided; the last three are a **canvas's** own. Closed, so a reader of this file has seen
 * them all and the panel's switch stays total.
 */
export type SlidesPanelControl =
  | 'text'
  | 'number'
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

/** A row of the deck's panel — `office-controls`' shape, with this product's kinds. */
export type SlidesPanelRow = PanelRow<SlidesPanelControl> & { tab: SlidesPanelTab };

/**
 * Every box a reader selects on a slide.
 *
 * Only for the rows that write a **node** rather than an attribute — a motion track, a part's
 * binding — where there is nothing for the schema to be asked about. Everything else asks it.
 */
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

/**
 * A row, with the short name a reader reads and the long one a screen reader does.
 *
 * They differ more often than they look like they should — 맞춤 against 교차 축 맞춤, 열 against 열
 * 수 — because a label sits beside fifteen others in a narrow column and an accessible name has to
 * be unique in the whole panel. `label` defaults to the accessible name, which is right for most
 * rows and wrong loudly rather than quietly for the rest.
 */
const row = (
  attr: string,
  ariaLabel: string,
  control: SlidesPanelControl,
  rest: Partial<SlidesPanelRow> & { command: string; group: string }
): SlidesPanelRow => ({
  tab: 'style',
  label: ariaLabel,
  ...rest,
  attr,
  ariaLabel,
  control
});

const geometry = (attr: string, ariaLabel: string, control: SlidesPanelControl = 'length'): SlidesPanelRow =>
  row(attr, ariaLabel, control, { command: 'setBoxGeometry', group: '배치' });

const paint = (attr: string, ariaLabel: string, control: SlidesPanelControl): SlidesPanelRow =>
  row(attr, ariaLabel, control, { command: 'setBoxStyle', group: '채우기와 선' });

const line = (attr: string, ariaLabel: string, control: SlidesPanelControl): SlidesPanelRow =>
  row(attr, ariaLabel, control, {
    command: 'setConnector',
    group: '연결선'
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
  { attr: 'locked', command: 'setBoxLocked', group: '배치', tab: 'style', label: '잠금', ariaLabel: '잠금', control: 'toggle' },
  /*
   * Where pressing it goes, in a deck being presented. Three attributes and one control: a reader
   * picks a destination and the command works out whether that is a slide, a named place or another
   * deck — which is why `goToKind` and `goToDeck` have no row of their own.
   */
  { attr: 'goTo', command: 'setBoxJump', group: '배치', tab: 'style', label: '누르면 이동', ariaLabel: '누르면 이동', control: 'choice' },

  // ── The arrangement a frame imposes on what is in it ───────────────────────
  { attr: 'layoutMode', command: 'setFrameLayout', group: '배치', tab: 'style', label: '배치 방향', ariaLabel: '배치 방향', control: 'choice' },
  { attr: 'gap', command: 'setFrameLayout', group: '배치', tab: 'style', label: '간격', ariaLabel: '간격', control: 'length', when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  { attr: 'padding', command: 'setFrameLayout', group: '배치', tab: 'style', label: '안쪽 여백', ariaLabel: '안쪽 여백', control: 'length', when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  // `교차 축 맞춤`, not `맞춤` — the browser check is what caught the difference, which is the whole
  // reason a declaration read out of JSX needs one.
  { attr: 'alignItems', command: 'setFrameLayout', group: '배치', tab: 'style', label: '맞춤', ariaLabel: '교차 축 맞춤', control: 'choice', when: { attr: 'layoutMode', is: ['row', 'column', 'grid'] } },
  {
    attr: 'columns',
    command: 'setFrameLayout',
    group: '배치',
    tab: 'style',
    // `열 수`, not `열` — the row's *label* is 열 and its accessible name is not, which is exactly
    // the kind of difference a declaration read out of JSX gets wrong and a browser check catches.
    label: '열', ariaLabel: '열 수',
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
  { attr: 'layoutStretch', command: 'setBoxLayout', group: '배치', tab: 'style', label: '가득', ariaLabel: '프레임 가득 채우기', control: 'toggle', inside: 'arrangedFrame' },
  { attr: 'layoutGrow', command: 'setBoxLayout', group: '배치', tab: 'style', label: '늘리기', ariaLabel: '남은 공간 늘리기', control: 'toggle', inside: 'arrangedFrame' },

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
  { attr: 'cornerRadius', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', label: '둥글기', ariaLabel: '모서리 둥글기', control: 'length' },
  { attr: 'cornerTopLeft', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', label: '왼쪽 위', ariaLabel: '왼쪽 위 모서리', control: 'length' },
  { attr: 'cornerTopRight', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', label: '오른쪽 위', ariaLabel: '오른쪽 위 모서리', control: 'length' },
  { attr: 'cornerBottomRight', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', label: '오른쪽 아래', ariaLabel: '오른쪽 아래 모서리', control: 'length' },
  { attr: 'cornerBottomLeft', command: 'setBoxStyle', group: '채우기와 선', tab: 'style', label: '왼쪽 아래', ariaLabel: '왼쪽 아래 모서리', control: 'length' },

  // ── 텍스트 — a box that holds words ────────────────────────────────────────
  { attr: 'verticalAlign', command: 'setBoxStyle', group: '텍스트', tab: 'style', label: '세로 맞춤', ariaLabel: '세로 맞춤', control: 'choice' },
  { attr: 'textInset', command: 'setBoxStyle', group: '텍스트', tab: 'style', label: '안쪽 여백', ariaLabel: '텍스트 안쪽 여백', control: 'length' },

  // ── 그림 ───────────────────────────────────────────────────────────────────
  { attr: 'fit', command: 'setBoxStyle', group: '그림', tab: 'style', label: '맞춤', ariaLabel: '그림 맞춤', control: 'choice' },
  /*
   * One control for four attributes, and it is a *gesture* rather than a form: the crop is dragged
   * on the picture and the panel offers the way back out of it. Four number rows would be four ways
   * to make a picture disappear.
   */
  { attr: 'cropTop', command: 'cropPicture', group: '그림', tab: 'style', label: '자르기', ariaLabel: '자르기 원래대로', control: 'toggle' },

  // ── 연결선 ─────────────────────────────────────────────────────────────────
  /*
   * Four of these were wrong until a connector was put in front of the browser check: `경로`, not
   * `연결선 모양`; `흐름`, not `화살표`; `구부리기`, not `휘어짐`. The sample deck holds no
   * connector, so the check had been passing by having nothing to look at — the failure this whole
   * harness is named after, in the file written to stop it.
   */
  line('kind', '경로', 'choice'),
  line('flow', '흐름', 'choice'),
  line('bend', '구부리기', 'length'),
  /*
   * A count and a way back, not a control: bends are placed on the line itself, so the panel's job
   * is to say how many there are (a bend hidden behind a shape looks like no bend) and to undo them
   * all at once. Shown once there is one — see `when`.
   */
  { ...line('waypoints', '경유점', 'list'), when: { attr: 'waypoints' } },
  line('label', '이름표', 'text'),
  line('startLabel', '시작 이름표', 'text'),
  line('endLabel', '끝 이름표', 'text'),
  /*
   * How a label is drawn, shown once there **is** one: three controls about the styling of text that
   * does not exist yet is three controls a reader has to work out are inert.
   */
  { ...line('labelBold', '이름표 굵게', 'toggle'), when: { attr: 'label' } },
  { ...line('labelColor', '이름표 색', 'colour'), when: { attr: 'label' } },
  { ...line('labelSize', '이름표 크기', 'length'), when: { attr: 'label' } },
  /*
   * The shape of each end, which the conformance exemption said was **owed** — and it has been on
   * the panel all along, as 시작 모양 and 끝 모양. A prose claim about a React tree, wrong in the
   * direction that costs most: somebody would have built a control that already existed. It is the
   * exact fault this whole file exists to stop, committed in the file that stops it.
   */
  line('startCap', '시작 모양', 'choice'),
  line('endCap', '끝 모양', 'choice'),

  // ── 문서 변수 연결 ─────────────────────────────────────────────────────────
  /*
   * One declared row and many on screen: which attributes a box may bind is `BINDABLE_ROWS`, and how
   * many rows that produces is a fact about the *node type* and the variables the document holds.
   * The declaration says the shape — this attribute, this command, this kind — the way the site's 값
   * row does.
   */
  { attr: 'varBinds', command: 'setVarBind', group: '문서 변수 연결', tab: 'style', label: '변수', ariaLabel: '문서 변수', control: 'binds' },
  /*
   * And the same question asked of a **definition's part**, which is a different command because the
   * answer is kept in a different place: a shape's binding is the shape's, and a part's binding is a
   * `componentBind` node inside the definition, so that every placement of it is bound too.
   */
  { attr: 'componentBind', writes: 'child', command: 'setComponentBind', group: '컴포넌트 부품', tab: 'style', label: '부품 변수', ariaLabel: '부품 문서 변수', control: 'binds', inside: 'component' },

  // ── 모션 — what a box does, as opposed to what it is ───────────────────────
  /*
   * The node the schema actually has, which is `motionTrack` — a box's steps live on one, and the
   * row adds a step to it. `motion` was the word in my head and not the word in the schema, and the
   * test that reads this file is what said so.
   */
  { attr: 'motionTrack', writes: 'child', command: 'addBoxesMotion', group: '모션', tab: 'motion', label: '모션 추가', ariaLabel: '모션 추가', control: 'list' },
  /*
   * `startsWith`, not `playback` — and the correction is worth keeping, because it is what a
   * declaration written from memory looks like when something checks it. The row asks *when a film
   * starts relative to the step before it*, which is a motion-track attribute; `autoplay`,
   * `controls`, `loop` and `muted` are the media's own and this panel offers none of them.
   */
  { attr: 'startsWith', writes: 'child', command: 'setBoxPlayback', group: '재생', tab: 'motion', label: '시작', ariaLabel: '재생 시작', control: 'choice', on: ['mediaVideo', 'mediaAudio'] },
  /*
   * A slide's transition is not on a box at all — it is a `motion` node on the slide, which is why
   * the row's `on` names the surface and its command takes a `slideId`. `effect` and `duration` are
   * the two things it writes.
   */
  { attr: 'effect', writes: 'child', command: 'setSlideTransition', group: '화면 전환', tab: 'motion', label: '화면 전환', ariaLabel: '화면 전환', control: 'choice', on: ['surface'] }
];

/**
 * The rows for one node type, in one pane, in the order the panel draws them.
 *
 * A row with no `on` applies to every **box on a slide**, which is what this product means by
 * "anything" — the site builder means every block, and the shared helper takes the question rather
 * than guessing so that the two cannot answer each other's.
 */
export function slidesPanelRows(
  stype: string | undefined,
  tab?: SlidesPanelTab,
  /**
   * Whether a node type declares an attribute.
   *
   * The panel has always asked this — `declares('layoutMode')` is what gates the 배치 group — and a
   * declaration that replaced it with hand-written lists got 27 entries wrong. Optional so that a
   * *test* can read the rows without a schema; the app always passes one.
   */
  declares?: (stype: string, attr: string) => boolean
): SlidesPanelRow[] {
  return panelRowsFor(SLIDES_PANEL, stype, tab, { declares, anything: (one) => BOXES.includes(one) });
}

/** The groups a pane has, in order, with their rows. */
export function slidesPanelGroups(
  stype: string | undefined,
  tab: SlidesPanelTab,
  declares?: (stype: string, attr: string) => boolean
) {
  return panelGroupsFor(slidesPanelRows(stype, tab, declares));
}

/** Every command the panel can run — the deck's third answer to "what can a reader reach". */
export function slidesPanelCommands(): string[] {
  return panelCommands(SLIDES_PANEL);
}

/**
 * Every attribute the panel can set, including the ones a row writes without naming.
 *
 * A destination picker writes `goTo`, `goToKind` and `goToDeck` together because a reader chooses
 * one thing and the command works out which of the three it was; a crop reset writes all four crops.
 * A row per hidden attribute would be controls nobody wants.
 */
export function slidesPanelAttrs(): string[] {
  return panelAttrs(SLIDES_PANEL, {
    goTo: ['goToKind', 'goToDeck'],
    cropTop: ['cropRight', 'cropBottom', 'cropLeft'],
    // The flat pair and the flat shadow are what `fills` and `effects` fall back to, and the panel's
    // stack writes whichever the shape is using. `fill` has no row: a shape's one colour *is* the
    // stack's first entry.
    fills: ['fill', 'gradientFrom', 'gradientTo', 'gradientAngle', 'gradientKind'],
    effects: ['shadowColor', 'shadowBlur', 'shadowAngle', 'shadowDistance'],
    // The transition row sets how long it takes as well as what it is.
    effect: ['duration']
  });
}
