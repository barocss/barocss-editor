export * from './panel';
import {
  markAttribute,
  markState,
  type MarkState,
  type SelectionSummary
} from '@barocss/editor-core';

/**
 * What a control is, and how it reads a selection.
 *
 * ## The layer that was missing
 *
 * A control in this suite is three separate things, and they were two packages:
 *
 * 1. **A drawing** — a button, a dropdown, a swatch grid. `office-ui`, which is
 *    pure UI: it takes a value and a state, reports a change, and has never heard
 *    of an editor.
 * 2. **A declaration** — which command this control runs, what goes in the
 *    payload, which mark it reads its state from. Plus the small amount of glue
 *    that turns that declaration into the value the drawing needs. **This file.**
 * 3. **The declarations themselves** — `WORD_TOOLBAR`, `SLIDES_TOOLBAR`, and each
 *    product's own way of resolving what it means (Word's style cascade, a deck's
 *    current slide). The product packages.
 *
 * The middle one had no home, so it lived in `office-word` — and Slides imported
 * its own toolbar's vocabulary from Word. Measured before this existed:
 *
 * - `apps/slide/src/ribbon.tsx` took `ToolbarChoice`, `ToolbarPalette`,
 *   `choiceOptions`, `currentChoice` and `currentPaletteColor` from
 *   `@barocss/office-word`, so a deck's font box was a Word type.
 * - `SlidesToolbarControl` was a copy of `ToolbarControl` with three fields added,
 *   and `SlidesToolbarGroup` a copy of `ToolbarGroup`.
 * - The two helpers that build a state reader — `mark(type)` and
 *   `attribute(key, value)` — were written twice with **identical bodies**, once
 *   in each product's toolbar model.
 * - So were the inventory functions each product's tests use to ask "does an
 *   editor register every command my toolbar names".
 *
 * Which is the ordinary consequence of a missing layer: the shared thing goes to
 * whichever package existed first, and the second product either imports from its
 * sibling or writes it again. Both happened here.
 *
 * ## Why not `office-ui`, and why not `editor-core`
 *
 * Not `office-ui`, because this reads a `SelectionSummary`: a package whose rule
 * is that its components work from props alone cannot hold something that knows
 * how a host announces its state. Not `editor-core`, because a *control* is
 * chrome vocabulary and the document layer should not grow a notion of one.
 * Reading a selection is the editor's own business, though — so the actual read
 * lives there as `markAttribute`, and what is here is the declaration and the
 * glue.
 *
 * No React, no DOM. Everything in this file is testable in milliseconds, which is
 * the other reason it is not in the chrome.
 */

/**
 * A control that runs a command, and may show whether it is on.
 *
 * The common core of every product's controls. A product extends it rather than
 * copying it:
 *
 * ```ts
 * export interface SlideControl extends Control {
 *   needsSlide?: boolean;   // a deck's commands take a slideId
 * }
 * ```
 *
 * so the fields that mean the same thing in every product are declared once and a
 * product adds only what is genuinely its own.
 */
export interface Control {
  id: string;
  label: string;
  /**
   * Which **act** this control performs, as a name in the shared icon table.
   *
   * A name rather than the control's own id, because an icon is about what
   * pressing it does: a slide and a shape are duplicated by the same act, so both
   * say `duplicate` and the chrome holds one drawing. It is also what keeps the
   * shared chrome from having to learn a product's vocabulary — see
   * `@barocss/office-icons`.
   */
  icon: string;
  command: string;
  /** Fixed arguments, because the control's own label says which case it is. */
  payload?: Record<string, unknown>;
  /**
   * Which **attributes** pressing this writes.
   *
   * `command` and `payload` say what runs; they do not say what changes. A toolbar that declares
   * `setAlignment` has said nothing about `alignment`, and the two are different questions with
   * different answers — one command writes twenty-four fields in the site builder and one attribute
   * here. Until this existed, the only surface that could answer *"can a reader set this value"* was
   * a product's property panel, and Word has none: its chrome is a ribbon and a ruler.
   *
   * Read by `every-property-can-be-edited`, which asks exactly that. Empty or absent means the
   * control writes nothing a schema declares — a zoom, a find, a view switch — which is a real
   * answer and not a gap.
   */
  writes?: string[];

  /**
   * How to read this control's state out of the selection.
   *
   * A function rather than a mark name, because not every control's state is a
   * mark — a list button resolves a numbering definition, an alignment button
   * reads a block attribute. `markType` rides along on the function so a test can
   * ask which marks a toolbar claims to know without calling it.
   */
  state?: ((summary: SelectionSummary) => MarkState) & { markType?: string };
}

/** A run of controls, drawn together with a separator before the next. */
export interface ControlGroup<C extends Control = Control> {
  id: string;
  controls: C[];
  /**
   * That this group is **contextual** — drawn only when there is something for it to act on — and
   * what that context is.
   *
   * ## Why a toolbar needs this at all
   *
   * Measured in Word on 2026-08-27, with a caret in an ordinary paragraph: of 69 toolbar controls,
   * **arrange was 12 of 12 disabled and table was 15 of 15**. Everything else was live. So 39% of
   * the strip was two rows of glyphs that could do nothing, on screen always, and the second row
   * exists because of them.
   *
   * Every serious editor answers this the same way and has for twenty years — Word's own *Table
   * Tools* appear when the caret is in a table and go when it leaves. The strip shows what the
   * selection can be asked.
   *
   * ## Why it is declared and not inferred
   *
   * "Hide a group where nothing can run" is nearly the right rule and would have hidden almost the
   * whole toolbar: measured with **nothing** selected, `character`, `list`, `paragraph`, `drawing`
   * and `layout` are all wholly disabled too. A reader who has just opened a document would meet an
   * empty bar that fills in when they click, which is worse than the problem.
   *
   * The difference is that those are disabled for want of a *selection* and these are disabled for
   * want of a *kind* of one. That is a fact about the product, so the product says it.
   */
  when?: 'shape' | 'table';
}

/**
 * A control that offers one of a list of values, and reads the current one from a
 * mark — a font, a size, a line height.
 */
export interface ChoiceControl {
  id: string;
  label: string;
  command: string;
  /** The payload field the chosen value goes in. */
  key: string;
  /** The mark this reads, so the current value can be shown. */
  markType: string;
  /** Where the value sits in the mark's attributes. */
  attr: string;
  options: { value: string | number; label: string }[];
  /**
   * How a value the presets do not list is shown, when it is not the value
   * itself. A font size is stored in half-points and read in points.
   */
  labelOf?: (value: string) => string;
  /** Which attributes choosing a value writes — see `Control.writes`. */
  writes?: string[];
}

/**
 * A control that opens a set of colours.
 *
 * Distinct from a `ChoiceControl`, which is a list of named values and reads a
 * mark. A colour is neither: the set on offer is a convenience rather than the
 * whole domain — any colour is valid — and what it applies to may be a mark on
 * the text or an attribute on a container. So a palette says which command it
 * runs and where the colour goes in the payload, and leaves the drawing to a host
 * that knows what a swatch looks like.
 */
export interface PaletteControl {
  id: string;
  label: string;
  icon: string;
  command: string;
  /** The payload field the colour goes in. */
  key: string;
  /** The command that takes the colour away again, where there is one. */
  clearCommand?: string;
  /** The mark the current colour is read from, for a colour that is a mark. */
  markType?: string;
  attr?: string;
  /** Or the attribute it is read from, for a colour that is a container's. */
  cellAttribute?: string;
  swatches: { value: string; label: string }[];
  /** Which attributes choosing a value writes — see `Control.writes`. */
  writes?: string[];
}

/**
 * A state reader for a control whose state is a **mark** — bold, italic, code.
 *
 * Three-valued, because a selection that is half bold is in neither state and
 * drawing it as off turns one click into a silent reformat of the other half.
 * `markType` is attached so a test can ask a toolbar which marks it names.
 *
 * It was this exact function, twice, in two products' toolbar models.
 */
export function stateOfMark(
  type: string
): ((summary: SelectionSummary) => MarkState) & { markType: string } {
  const read = (summary: SelectionSummary): MarkState => markState(summary, type);
  read.markType = type;
  return read as ((summary: SelectionSummary) => MarkState) & { markType: string };
}

/**
 * And for a control whose state is a **block attribute** — alignment, direction.
 *
 * No `markType`, because there is no mark: a test asking which marks a toolbar
 * names should not be told about alignment.
 */
export function stateOfAttribute(
  key: string,
  value: unknown
): (summary: SelectionSummary) => MarkState {
  return (summary: SelectionSummary): MarkState => {
    // Mixed before equal: a selection covering a left-aligned and a centred
    // paragraph agrees on neither, and reporting `off` would make one click
    // re-align both.
    if (summary.mixedAttributes.includes(key)) return 'mixed';
    return summary.blockAttributes[key] === value ? 'on' : 'off';
  };
}

/**
 * The options a choice control should offer, with the current value among them.
 *
 * A size the presets do not offer is still the size. A deck's layouts are set in
 * whatever the designer chose — 54pt for this one's titles — and the control
 * offers a dozen round numbers; a value outside them left the box blank, which
 * reads as *the selection disagrees with itself* when it agrees perfectly.
 *
 * The one function here that reads nothing at all: a declaration and a value in,
 * a list out. It is here rather than in the chrome only because the declaration
 * is here.
 */
export function choiceOptions(
  choice: ChoiceControl,
  current: string | null
): { id: string; label: string }[] {
  const options = choice.options.map((option) => ({
    id: String(option.value),
    label: option.label
  }));

  if (current === null || options.some((option) => option.id === current)) return options;

  return [{ id: current, label: choice.labelOf?.(current) ?? current }, ...options];
}

/**
 * The value a choice control should show, or nothing when the selection does not
 * agree on one.
 *
 * `inherited` is asked only when the selection carries no mark of its own, and it
 * is a function so the work of resolving it is not done for a selection that
 * answers directly. **No mark is not the same as no value**: almost no text in a
 * word processor carries direct font formatting — it comes down a style cascade —
 * so a box that showed "—" for a paragraph plainly set in Georgia would be saying
 * the selection disagrees with itself when it agrees perfectly. How that cascade
 * resolves is the product's, which is why it comes in rather than being done here.
 */
export function currentChoice(
  choice: ChoiceControl,
  summary: SelectionSummary,
  inherited?: () => string | number | undefined
): string | null {
  /**
   * Disagreement is an answer, and it beats anything inherited.
   *
   * Asked separately because `markAttribute` returns nothing for two different
   * reasons — the selection disagrees, or it carries no mark at all — and only
   * the second is a reason to go looking for what the text inherits. Writing this
   * as "no direct value, so ask the style" made a selection spanning two fonts
   * show the style's font, which says *this text is Georgia* about text that is
   * half Georgia. Word's own test caught it, which is the argument for moving
   * shared code with its tests still pointing at it.
   */
  if (markState(summary, choice.markType) === 'mixed') return null;

  const direct = markAttribute(summary, choice.markType, choice.attr);
  if (direct !== null) return direct;

  const resolved = inherited?.();
  return resolved === undefined || resolved === null ? null : String(resolved);
}

/**
 * The colour a palette should show as current, or nothing.
 *
 * Two places to read from and the declaration says which: a mark for text, an
 * attribute for a container. Neither is something a swatch grid knows about — it
 * draws colours and reports one back.
 */
export function currentPaletteColor(
  palette: PaletteControl,
  summary: SelectionSummary,
  container?: { attributes?: Record<string, unknown> }
): string | null {
  if (palette.cellAttribute) {
    const value = container?.attributes?.[palette.cellAttribute];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
  if (!palette.markType || !palette.attr) return null;
  return markAttribute(summary, palette.markType, palette.attr);
}

/**
 * The marks a toolbar claims to read, so a test can ask whether they are real.
 *
 * A toolbar curates rather than mirroring — a schema with forty marks does not
 * make a usable toolbar, and Word's own shows a dozen — but what it curates has
 * to exist, and this is what lets a test say so.
 */
export function markTypesIn(groups: ControlGroup<Control>[]): string[] {
  return groups
    .flatMap((group) => group.controls)
    .map((control) => control.state?.markType)
    .filter((type): type is string => typeof type === 'string');
}

/**
 * The commands a toolbar runs, so the same can be asked of an editor.
 *
 * The palettes are a second argument rather than being left out. They are not
 * `Control`s — a colour is not one of a list — and omitting them would make this
 * list quietly incomplete, which is the one thing it exists not to be: a control
 * naming a command nothing registers is a button that silently does nothing, and
 * the check that catches it can only see what this returns.
 *
 * Both products had their own copy of this, and each had to remember to include
 * its own palettes.
 */
export function commandsIn(
  groups: ControlGroup<Control>[],
  palettes: PaletteControl[] = []
): string[] {
  const fromGroups = groups.flatMap((group) => group.controls).map((control) => control.command);
  const fromPalettes = palettes.flatMap((palette) =>
    [palette.command, palette.clearCommand].filter((name): name is string => !!name)
  );
  return [...new Set([...fromGroups, ...fromPalettes])];
}

/**
 * The icons a toolbar asks for, so the same can be asked of the icon table.
 *
 * ## Why this is not what the browser test already does
 *
 * Both products have a browser test asserting that nothing on screen fell back to
 * drawing its own name — `[data-icon-missing]`, which `Icon` marks. That test can only
 * see **what is on screen**: a control on a tab nobody opened, one that only appears
 * with a table selected, a palette inside a dialog, a row of a context menu. A model
 * declares those all the same way, and a name the icon table does not know is a button
 * with a word where its picture should be, discovered by a reader.
 *
 * So the names are collected from the *declaration* instead, where every control is
 * present whatever the screen is showing, and the question is answered in
 * milliseconds — see `every-icon-has-a-picture` in `@barocss/conformance`.
 *
 * The palettes are a second argument for the same reason `commandsIn` takes them: a
 * palette has an icon and is not a `Control`, so leaving them out would make this
 * quietly incomplete, which is the one thing a list like this exists not to be.
 */
export function iconsIn(
  groups: ControlGroup<Control>[],
  palettes: PaletteControl[] = []
): string[] {
  const fromGroups = groups.flatMap((group) => group.controls).map((control) => control.icon);
  const fromPalettes = palettes.map((palette) => palette.icon);
  return [...new Set([...fromGroups, ...fromPalettes])].filter(
    (name): name is string => typeof name === 'string' && name.length > 0
  );
}

/**
 * What the suite calls a canvas node, in the reader's words.
 *
 * ## Why it is here rather than in each product
 *
 * These are the node types the **shared** schema declares — a rectangle is a
 * rectangle whether it is on a slide, on a page, or on a board. Two products
 * naming them separately is two tables that can disagree about what a reader is
 * looking at, and the first one written had already fallen behind its schema:
 * `connector`, `component` and `instance` were declared and came out as the same
 * fallback word as everything else it did not know.
 *
 * It is the same shape of thing as the icon table — a name a chrome reads, keyed by
 * something the model declares — and it is here for the same reason: so a third
 * product gets the vocabulary without inheriting a product's own additions.
 *
 * ## What a product adds
 *
 * Its own node types, and only those. Slides declares `mediaVideo` and
 * `mediaAudio`; a board would declare whatever a board has. `nameOfNode` takes
 * them so a product does not have to spread this table by hand.
 *
 * ## No fallback, deliberately
 *
 * Nothing for a type the suite has no word for. A fallback makes a missing name
 * look like a name, and a list of six rows all reading "상자" is one a reader
 * cannot use *and* one the product cannot tell from a working list. See
 * `every-drawing-can-be-named` in `@barocss/conformance`, which exists to see
 * exactly that and can only see it because this returns nothing.
 */
export const CANVAS_NAMES: Record<string, string> = {
  rectangle: '사각형',
  ellipse: '타원',
  line: '선',
  path: '도형',
  picture: '그림',
  textFrame: '텍스트 상자',
  sticky: '메모',
  frame: '프레임',
  group: '그룹',
  /**
   * Declared in the shared schema and drawn by nothing yet.
   *
   * Named anyway: a document arriving from a tool that has them — `connector` is a
   * line that remembers what it joins, `instance` a copy that follows a
   * `component` — draws *something*, and a row a reader cannot act on is worse
   * than a row with an unfamiliar word in it.
   */
  connector: '연결선',
  component: '컴포넌트',
  instance: '인스턴스'
};

/** The suite's word for a node type, plus whatever this product adds. */
export function nameOfNode(
  stype: string | undefined,
  own: Record<string, string> = {}
): string | undefined {
  if (!stype) return undefined;
  return own[stype] ?? CANVAS_NAMES[stype];
}
export {
  menuCommands,
  menuEntry,
  menuFaults,
  menuId,
  type MenuBlockModel,
  type MenuEntryModel,
  type MenuModel
} from './menu';
export {
  chordFor,
  keyCommands,
  keyFaults,
  keyFor,
  keyLabel,
  matchesKey,
  withHints,
  type KeyModel
} from './keys';
