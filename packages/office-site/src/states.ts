/**
 * What a block says **while a pointer is on it**, or while the keyboard is in it.
 *
 * ## Why this is the shape of an override, and why it is not one
 *
 * The map is `overrides`' map, deliberately: a state holds **only what differs**, everything else is
 * still the block's own answer, and the same two faults are checkable against the same declared
 * attributes. A reader who has learned one has learned the other, and `responsive.ts` already argued
 * why a map is allowed here where `componentBind` refused one — it names attributes of *this* node,
 * so the schema can check it.
 *
 * What makes it a different thing is **when the answer is known**. A width is known before the page
 * is drawn: three boards, three breakpoints, and each view resolves its own — which is why an
 * override never becomes CSS in the editor, only in the export's media queries. A pointer is not
 * known at any point a renderer runs. There is no moment at which a document can be resolved "as
 * hovered", because the hovering is the visitor's and happens after everything has been drawn.
 *
 * So a state is the first thing in this product that must be **published as a rule** rather than
 * resolved into a drawing. That is the finding, and it is worth the paragraph: every other value on
 * a page is a value, and this one is a promise about a value.
 *
 * ## Why a state is not per-width
 *
 * A card that lifts under the pointer lifts at 390 as well as at 1280 — the gesture is the same
 * gesture. Making the map two levels deep (`{ hover: { mobile: {...} } }`) would have bought the one
 * case nobody has asked for and cost every reader the question "which of these two do I set". The
 * cascade runs base → this width's overrides → this state, in that order, so a state has the last
 * word over a width and a width still applies underneath it.
 *
 * The day a hover genuinely has to differ at one width, it takes an `overrides` **inside** the
 * state — the same map one level down, no new mechanism — rather than a second map here.
 *
 * ## What a state may not say
 *
 * Anything that changes **layout**. Not by a rule in this file — by the arithmetic: a `:hover` that
 * changed `layoutMode` or `padding` would move the thing out from under the pointer, the pointer
 * would then not be on it, and the browser would draw the two states alternately for as long as the
 * visitor held still. Every layout tool that has allowed it has produced that flicker. So the panel
 * offers paint and nothing else, and `stateFaults` says so for a document that arrives another way.
 */
import type { BreakpointId } from './breakpoints';
import { attrsAt } from './responsive';

/** A state a page can be in under a visitor's hands. */
export type StateId = 'hover' | 'focus' | 'open';

export interface StateKind {
  id: StateId;
  /** What a panel calls it. */
  label: string;
  /** The CSS that asks the question — the browser's own, never a class this product invents. */
  selector: string;
  /**
   * And what goes **in front** of the block's own selector, for a state whose evidence is not on the
   * block itself.
   *
   * `hover` and `focus` are questions about the block, so they are suffixes and this is empty. Being
   * open is a question about a **checkbox**, because that is where a browser keeps a fact a visitor
   * decided — so the rule is `switch:checked + block`, and the switch's half comes first.
   */
  before?: string;
  /** Why a reader would set it, for the panel's title. */
  title: string;
}

/**
 * The states a page may state, and the CSS each one is.
 *
 * `:focus-visible` rather than `:focus`, and the difference is a real one a published page is judged
 * on: `:focus` fires on a mouse click too, so a card styled for the keyboard flashes its focus ring
 * at every visitor who clicks it. `:focus-visible` is the browser's own answer to "did this focus
 * come from the keyboard", which is the question a designer meant.
 */
export const STATES: readonly StateKind[] = [
  { id: 'hover', label: '포인터', selector: ':hover', title: '포인터가 올라갔을 때' },
  { id: 'focus', label: '키보드', selector: ':focus-visible', title: '키보드로 초점이 갔을 때' },
  /**
   * **열림** — the one state a visitor *decides* rather than one they happen into.
   *
   * ## Why a page needs a third
   *
   * A navigation bar is two designs and this model could already say that: the wide menu hides at
   * `mobile`, the hamburger hides above it, both in `overrides`, and every placement of the
   * component follows. What it could not say is what happens when the hamburger is **pressed** —
   * and a hamburger that does not open is a picture of a menu.
   *
   * The same one mechanism answers an accordion, a tab strip, a 더보기 and a filter drawer. Every
   * one of them is *a visitor asked for more of this block*, and every one of them was going to be
   * asked for separately.
   *
   * ## Why it is a state and not a script
   *
   * `hover` and `focus` are published as a **promise about a value** rather than as a value, because
   * the hovering happens after the drawing has finished. Being open is the same shape one step
   * further: it happens after the drawing *and* it is remembered. A checkbox remembers it, which is
   * why this ships as CSS and not as JavaScript — see `export-html.ts`.
   *
   * ## Why the switch goes *before* the block and not inside it
   *
   * Both work as CSS. Only one of them can be reached from a keyboard. A block that is open-only —
   * a menu, an accordion's body — is `display: none` when closed, and a checkbox inside it is inside
   * that `none`: a pointer can still toggle it through its label, and a **Tab key cannot reach it at
   * all**, because an unrendered control is not in the focus order. The switch sits outside the
   * thing it opens, always rendered, so 열림 is one Tab and one Space away.
   *
   * `+` rather than `:has()` for a smaller reason worth having: the rule then names two elements
   * that are next to each other, which is a thing a reader can find in the markup by looking.
   */
  {
    id: 'open',
    label: '열림',
    selector: '',
    before: '.st-open-switch:checked + ',
    title: '방문자가 열었을 때'
  }
];

export const STATE_IDS: readonly StateId[] = STATES.map((one) => one.id);

/** What a state's CSS is, or nothing when the id is not one of ours. */
export function selectorFor(state: StateId): string | undefined {
  return STATES.find((one) => one.id === state)?.selector;
}

/**
 * One block's selector, in one state — the only place the two halves are put together.
 *
 * Both notations ask this: the published page names blocks by `data-b` and the board by
 * `data-bc-sid`, and neither of them should have to know that one state is a suffix and another is a
 * prefix. It was a suffix everywhere until 열림 arrived, and the day a caller kept its own `+` was
 * the day the two notations could disagree about it.
 */
export function selectorIn(where: string, state: StateId): string {
  const kind = STATES.find((one) => one.id === state);
  if (!kind) return where;
  return `${kind.before ?? ''}${where}${kind.selector}`;
}

/**
 * What a **held** state may change — paint, and nothing that moves anything. See the header.
 *
 * `open` is the exception and the reason this is now two lists: a held state flickers if it moves
 * the thing out from under the pointer, and a remembered one cannot, because nothing is holding it.
 * A menu that appears is the whole point of being open. See `stateableIn`.
 */
export const STATEABLE: readonly string[] = [
  // The flat colour, and the **colour** of the line around it — `frameCss`'s two.
  //
  // `strokeWidth` is deliberately absent where `stroke` is here: a border is drawn inside the box
  // (`box-sizing: border-box`), so on a block whose height is its content's a wider border on hover
  // reflows the text inside it. The pattern that works is the one every design system uses — a
  // border of the final width in the base, transparent, and only its colour in the state.
  'fill',
  'stroke',
  // The longer answers to the same question — `paintCss`'s, in the deck's vocabulary.
  'gradientFrom',
  'gradientTo',
  'gradientAngle',
  'gradientKind',
  'backgroundImage',
  'backgroundFit',
  'backgroundOpacity',
  'shadowColor',
  'shadowBlur',
  'shadowDistance',
  'shadowAngle',
  'cornerRadius',
  'cornerTopLeft',
  'cornerTopRight',
  'cornerBottomRight',
  'cornerBottomLeft',
  /*
   * And **how much of it comes through**, which is the commonest hover a page has: a card that lifts
   * to full and a picture that brightens under the pointer are both this one number. Safe here for
   * the reason `strokeWidth` is not — opacity moves nothing, so a block cannot fade itself out from
   * under the pointer.
   */
  'opacity',
  /*
   * And the two of the new effects that a state may safely change.
   *
   * `blend` mixes and moves nothing, and `overlay` is a sheet drawn inside the box — both are the
   * same kind of promise as a colour. **`rotate` and `backdropBlur` are deliberately not here**, and
   * the reason is the one `strokeWidth` gives two paragraphs up: a box that turns under the pointer
   * moves its own corners out from under it, the pointer is then not on it, and the browser draws
   * the two states alternately for as long as a visitor holds still. A frosting is safe to move but
   * costs a repaint of everything behind it on every pointer move, which is a promise this product
   * should not make lightly.
   */
  'overlay',
  'overlayOpacity',
  'blend'
];

/**
 * What an **open** state may change — everything a held state may, and the three that move things.
 *
 * `visible` is the one that matters: a menu that is not there and then is. `layoutMode` and `gap`
 * come with it because a strip of links that becomes a column is the same gesture, and a reader who
 * can make it appear and cannot make it stack has been given half the design.
 *
 * A held state may change none of these, and the reason is arithmetic rather than taste: a `:hover`
 * that moved its own block would move it out from under the pointer, the pointer would then not be
 * on it, and the browser would draw the two states alternately for as long as the visitor held
 * still. Being open is remembered, so nothing is being held and nothing alternates.
 */
export const OPENABLE: readonly string[] = [
  ...STATEABLE,
  'visible',
  'layoutMode',
  /* Both gaps, because a strip that becomes a grid when it opens spaces its lines as well. */
  'gap',
  'gapCross'
];

/** What this state may change — see `STATEABLE` and `OPENABLE` for why they differ. */
export function stateableIn(state: StateId): readonly string[] {
  return state === 'open' ? OPENABLE : STATEABLE;
}

/** What a node states in each state, keyed by state. */
export type StateMap = Partial<Record<StateId, Record<string, unknown>>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** What a node says in each state, or nothing when it says nothing. */
export function statesOf(attrs: Record<string, unknown> | undefined): StateMap {
  const map = attrs?.states;
  if (!isRecord(map)) return {};

  const kept: StateMap = {};
  for (const id of STATE_IDS) {
    const scope = map[id];
    if (isRecord(scope) && Object.keys(scope).length > 0) kept[id] = scope;
  }
  return kept;
}

/** Whether this node promises anything at all — the cheap question, asked per node per export. */
export function hasStates(attrs: Record<string, unknown> | undefined): boolean {
  return Object.keys(statesOf(attrs)).length > 0;
}

/**
 * **What this block opens**, or nothing — the gesture half of 열림.
 *
 * A `partId`, and `'self'` where a block opens itself. The durable name rather than a sid, which is
 * `componentBind`'s rule and for its reason: a sid is given out at load, so nothing written down can
 * hold one. Resolved inside the page or the definition the opener is in, so every placement of a
 * navigation bar opens **its own** menu without anything being told there are several.
 */
export function opensOf(attrs: Record<string, unknown> | undefined): string | undefined {
  const said = attrs?.opens;
  return typeof said === 'string' && said.length > 0 ? said : undefined;
}

/** Whether this opener has **already been pressed** when the page loads — see the schema. */
export function opensAtRest(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.openAtRest === true;
}

/**
 * Whether only one thing inside this block may be open at a time — a checkbox or a **radio**.
 *
 * A fact about a set, so it lives on the container that holds the openers. The export walks up from
 * each opener to the nearest block that says this; everything under one such block shares a radio
 * name, and the browser does the rest.
 */
export function opensOneOf(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.opensOne === true;
}

/**
 * The attributes this node is **drawn with** at one width, in one state.
 *
 * Base, then the width, then the state — so a state has the last word and a width still applies
 * under it. Given `undefined` for the state this is exactly `attrsAt`, which is what makes the
 * before-and-after diff the rules are built from a comparison of one function against itself.
 */
export function attrsInState(
  attrs: Record<string, unknown> | undefined,
  breakpoint: BreakpointId,
  state?: StateId
): Record<string, unknown> {
  const at = attrsAt(attrs, breakpoint);
  if (!state) return at;

  const scope = statesOf(attrs)[state];
  if (!scope) return at;

  const merged = { ...at, ...scope };
  // Neither map is an attribute anything draws with. `attrsAt` takes its own off; this takes the
  // other, once, rather than in every renderer that would otherwise be handed a key it has no
  // answer for.
  delete merged.overrides;
  delete merged.states;
  return merged;
}

/**
 * The states a node would have after saying one thing in one of them.
 *
 * Pure, and returned rather than written, so the command has one thing to put in a transaction and a
 * test can hold the arithmetic without an editor — `withOverride`'s contract, for the same reasons.
 * `undefined` takes the statement off, and a state with nothing left in it is removed.
 */
export function withState(
  attrs: Record<string, unknown> | undefined,
  state: StateId,
  name: string,
  value: unknown
): StateMap {
  const states: StateMap = { ...statesOf(attrs) };
  const scope: Record<string, unknown> = { ...(states[state] ?? {}) };

  if (value === undefined) delete scope[name];
  else scope[name] = value;

  if (Object.keys(scope).length === 0) delete states[state];
  else states[state] = scope;

  return states;
}

/** Which attributes this state changes — what a panel marks, so a reader can see it is not the base. */
export function statedIn(
  attrs: Record<string, unknown> | undefined,
  state: StateId | undefined
): string[] {
  if (!state) return [];
  return Object.keys(statesOf(attrs)[state] ?? {}).sort();
}

/**
 * What is wrong with a node's states, against what that node declares.
 *
 * Three faults, and each one is a thing a document can arrive holding: a state no browser has, an
 * attribute this node does not have — the check `overrideFaults` makes, for the same reason — and an
 * attribute that is not paint, which is the flicker the header describes rather than a matter of
 * taste.
 */
export function stateFaults(
  attrs: Record<string, unknown> | undefined,
  declared: Iterable<string>
): string[] {
  const map = attrs?.states;
  if (map === undefined) return [];
  if (!isRecord(map)) return ['states is not a map of states'];

  const known = new Set(declared);
  const faults: string[] = [];

  for (const [id, scope] of Object.entries(map)) {
    if (!STATE_IDS.includes(id as StateId)) {
      faults.push(`'${id}' 상태는 그려지지 않습니다`);
      continue;
    }
    if (!isRecord(scope)) {
      faults.push(`'${id}'에 적힌 것이 설정이 아닙니다`);
      continue;
    }
    /*
     * Asked **per state**, which is the difference 열림 made: the same attribute is a fault in one
     * state and the point of another. A `visible` on hover is the flicker the header describes; a
     * `visible` on open is a menu appearing, and a check that called it a fault would have made the
     * state unusable while reporting itself clean.
     */
    const allowed = new Set(stateableIn(id as StateId));
    for (const name of Object.keys(scope)) {
      if (name === 'states' || name === 'overrides')
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸는데, 그것은 값이 아니라 목록입니다`);
      else if (!allowed.has(name))
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸면 블록이 포인터 아래에서 벗어납니다`);
      else if (known.size > 0 && !known.has(name))
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸는데, 이 블록에는 없는 속성입니다`);
    }
  }
  return faults;
}
