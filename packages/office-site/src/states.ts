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
export type StateId = 'hover' | 'focus';

export interface StateKind {
  id: StateId;
  /** What a panel calls it. */
  label: string;
  /** The CSS that asks the question — the browser's own, never a class this product invents. */
  selector: string;
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
  { id: 'focus', label: '키보드', selector: ':focus-visible', title: '키보드로 초점이 갔을 때' }
];

export const STATE_IDS: readonly StateId[] = STATES.map((one) => one.id);

/** What a state's CSS is, or nothing when the id is not one of ours. */
export function selectorFor(state: StateId): string | undefined {
  return STATES.find((one) => one.id === state)?.selector;
}

/** What a state changes, by what a page is *painted* with — see the header for why not layout. */
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
  'opacity'
];

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
  const paint = new Set(STATEABLE);
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
    for (const name of Object.keys(scope)) {
      if (name === 'states' || name === 'overrides')
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸는데, 그것은 값이 아니라 목록입니다`);
      else if (!paint.has(name))
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸면 블록이 포인터 아래에서 벗어납니다`);
      else if (known.size > 0 && !known.has(name))
        faults.push(`'${id}'에서 '${name}'을(를) 바꾸는데, 이 블록에는 없는 속성입니다`);
    }
  }
  return faults;
}
