/**
 * What Word's toolbar consists of — not how it is drawn.
 *
 * No DOM here on purpose. The engine renders through either a DOM or a React
 * renderer, and a product that shipped its toolbar as DOM would force every host
 * to be a DOM host; one that shipped it as React would force React on all of
 * them. So the product says which controls exist, what each reads out of the
 * selection and what it runs, and a host draws that with whatever it likes —
 * plain elements, Radix, or a native menu bar.
 *
 * Every control answers a question about the selection and runs a command,
 * holding no state of its own: state it held could disagree with the document,
 * and a bold button that remembers being pressed is a button that lies after an
 * undo.
 *
 * The answers are three-valued. A selection across text that is partly bold is
 * indeterminate rather than off, and a style over two different blocks is
 * nothing rather than one of them — rendering either as definite invites a click
 * that silently reformats everything the user had selected.
 */
import type { MarkState, SelectionSummary } from '@barocss/editor-core';
import {
  choiceOptions,
  commandsIn,
  currentChoice,
  currentPaletteColor,
  iconsIn,
  markTypesIn,
  stateOfAttribute,
  stateOfMark,
  type ChoiceControl,
  type Control,
  type ControlGroup,
  type PaletteControl
} from '@barocss/office-controls';
import type { StyleResolver } from '@barocss/office-text';
import type { DocumentNode } from '@barocss/office-text';
import { WORD_FONT_CATALOGUE } from './fonts';
import type { ListKind } from './list-commands';
import { parseTableLook, type TableLook } from '@barocss/office-text';

/**
 * A control in Word's toolbar: the suite's `Control` plus what only a word
 * processor's controls need.
 *
 * `id`, `label`, `icon`, `command`, `payload` and `state` mean the same thing in
 * every product and are declared once, in `@barocss/office-controls`. They were
 * restated here, and restated again in Slides — so the shared half existed twice
 * and the two could disagree about it. What is left below is genuinely Word's:
 * all three are things the *host* has to answer because a selection summary
 * cannot.
 */
export interface ToolbarControl extends Control {
  /**
   * That this control turns a list of this kind on and off.
   *
   * Which kind a paragraph is in cannot be read from the selection alone — it
   * takes resolving the numbering definition the paragraph names, which needs
   * the document. So the control says what it is and the host answers, the same
   * way a font control asks what the text inherits.
   */
  listKind?: ListKind;
  /**
   * That this control switches one of the regions a table asks its style for.
   *
   * A table attribute, not a selection one: the caret is in a paragraph in a
   * cell, and what the table around it asks for is three walks up from there.
   * So again the control says what it is and the host answers.
   */
  lookFlag?: keyof TableLook;
  /**
   * That this control sets a cell attribute to a value, and is on while the cell
   * already has it.
   *
   * Read from the cell rather than from the selection for the same reason the
   * look flags are read from the table: the caret is in a paragraph inside it,
   * and a summary of the selection knows nothing about the box around it.
   */
  cellAttribute?: { key: string; value: string; whenUnset?: boolean };
}

/**
 * The marks Word's toolbar reads, and the commands it runs — its own inventory,
 * over the suite's counting.
 *
 * Kept as no-argument functions because that is how the checks read: "every mark
 * this toolbar names exists in the schema", "every command it names is
 * registered". The counting itself is `markTypesIn` / `commandsIn`, which both
 * products now share — each had written it, and each had to remember to include
 * its own palettes in the command list.
 */
export function toolbarMarkTypes(groups: ToolbarGroup[] = WORD_TOOLBAR): string[] {
  return markTypesIn(groups);
}

/**
 * The icons Word's controls ask for — the declaration, not the screen, which is what
 * lets `every-icon-has-a-picture` see a control on a tab nobody opened.
 */
export function toolbarIcons(groups: ToolbarGroup[] = WORD_TOOLBAR): string[] {
  return iconsIn(groups, [WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT, WORD_CELL_SHADING]);
}

export function toolbarCommands(groups: ToolbarGroup[] = WORD_TOOLBAR): string[] {
  return commandsIn(groups, [WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT, WORD_CELL_SHADING]);
}


/** A group of controls, drawn together with a separator between groups. */
/** A run of Word's controls. The shape is the suite's; the controls are Word's. */
export type ToolbarGroup = ControlGroup<ToolbarControl>;

/**
 * Reading a mark and reading a block attribute — the suite's, under local names.
 *
 * Both were written here with the same bodies as Slides' copies of them, which is
 * two products disagreeing waiting to happen. Aliased rather than spelled out at
 * every use, because `mark('bold')` reads better in a hundred-line declaration
 * than the longer name does.
 */
const mark = stateOfMark;
const attribute = stateOfAttribute;

/**
 * The choice and palette readers: the suite's, re-exported because Word's own
 * ribbon reads its declarations with them and one import is kinder than two.
 *
 * The *types* are not re-exported. They were `ChoiceControl` and `PaletteControl`
 * here, which is how Slides came to import its own font box's type from
 * `@barocss/office-word` — a product depending on a sibling product for a shape
 * neither owns. Callers name them `ChoiceControl` and `PaletteControl` from
 * `@barocss/office-controls`, so there is one name for one thing.
 */
export { choiceOptions, currentChoice, currentPaletteColor };

export const WORD_TOOLBAR: ToolbarGroup[] = [
  {
    id: 'history',
    controls: [
      { id: 'undo', label: 'Undo', icon: 'undo', command: 'historyUndo' },
      { id: 'redo', label: 'Redo', icon: 'redo', command: 'historyRedo' }
    ]
  },
  {
    id: 'character',
    controls: [
      { id: 'bold', label: 'Bold', icon: 'bold', command: 'toggleBold', state: mark('bold') },
      { id: 'italic', label: 'Italic', icon: 'italic', command: 'toggleItalic', state: mark('italic') },
      {
        id: 'underline',
        label: 'Underline',
        icon: 'underline',
        command: 'toggleUnderline',
        state: mark('underline')
      },
      {
        id: 'strike',
        label: 'Strikethrough',
        icon: 'strike',
        command: 'toggleStrikeThrough',
        state: mark('strikethrough')
      },
      {
        id: 'superscript',
        label: 'Superscript',
        icon: 'superscript',
        command: 'toggleSuperscript',
        state: mark('superscript')
      },
      {
        id: 'subscript',
        label: 'Subscript',
        icon: 'subscript',
        command: 'toggleSubscript',
        state: mark('subscript')
      },
      {
        id: 'small-caps',
        label: 'Small capitals',
        icon: 'small-caps',
        command: 'toggleSmallCaps',
        state: mark('smallCaps')
      },
      {
        // Word's highlighter is a colour picker; this is its default colour,
        // which is the one the button in Word applies when clicked rather than
        // opened.
        id: 'highlight',
        label: 'Highlight',
        icon: 'highlight',
        command: 'toggleHighlight',
        payload: { color: 'yellow' },
        state: mark('highlight')
      }
    ]
  },
  {
    id: 'list',
    controls: [
      { id: 'bullet-list', label: 'Bulleted list', icon: 'bullet-list', command: 'toggleBulletList', listKind: 'bullet' },
      { id: 'ordered-list', label: 'Numbered list', icon: 'ordered-list', command: 'toggleOrderedList', listKind: 'ordered' },
      { id: 'outdent', label: 'Decrease indent', icon: 'outdent', command: 'outdentText' },
      { id: 'indent', label: 'Increase indent', icon: 'indent', command: 'indentText' }
    ]
  },
  {
    id: 'paragraph',
    controls: [
      {
        id: 'align-left',
        label: 'Align left',
        icon: 'align-left',
        command: 'alignLeft',
        state: attribute('alignment', 'left')
      },
      {
        id: 'align-center',
        label: 'Centre',
        icon: 'align-center',
        command: 'alignCenter',
        state: attribute('alignment', 'center')
      },
      {
        id: 'align-right',
        label: 'Align right',
        icon: 'align-right',
        command: 'alignRight',
        state: attribute('alignment', 'right')
      },
      {
        id: 'align-justify',
        label: 'Justify',
        icon: 'align-justify',
        command: 'alignJustify',
        state: attribute('alignment', 'justify')
      }
    ]
  },
  /**
   * Review.
   *
   * No `state` on any of them. Whether tracking is on is a property of the
   * document, not of the selection, and the selection summary is the only thing
   * a control's state can be read from — a button claiming to know is a button
   * that would be lying half the time. Whether each can run is answered by the
   * command instead, which is where the answer actually is: Accept is
   * unavailable exactly when there is no change to accept.
   */
  /**
   * Layout: putting blocks side by side without drawing a table to do it.
   *
   * Deliberately next to the table group, because these are the two answers to
   * the same question and a reader should meet them together. A table is for
   * data with rows and columns that mean something; a frame is for a page whose
   * *arrangement* is two columns of text or a row of cards, which is a thing
   * word processors have always made people fake with an invisible table.
   *
   * Three controls rather than one with a menu: each is a layout a reader can
   * point at, and "insert frame" followed by "now choose" is two decisions where
   * there was one. The payload is the whole difference between them.
   *
   * No `state`, and for the table group's reason — inserting is never "on".
   */
  /**
   * A **drawing**: a canvas in the page, with shapes on it.
   *
   * Beside the layout group because both are about *placing* rather than typing, and apart from it
   * because a frame arranges blocks in the flow while these are shapes at coordinates — two ideas a
   * reader would otherwise have to tell apart by pressing them.
   *
   * One control per shape rather than one 도형 button with a menu, for the reason the deck's insert
   * group gives and the conformance check enforces: a command named as though it puts a node in the
   * document has to say *which* node, and "it depends" is the answer that check exists to refuse.
   *
   * There is no separate "insert a canvas" button here. A reader who presses 사각형 means a
   * rectangle in their document; the canvas is where it has to live, and the command makes one when
   * there is none. `insertDrawing` is a command all the same — a reader who wants the surface first
   * has one, and the check that asks what each insert produces needs it.
   *
   * No text box: Word draws its canvas as an `<svg>` and has no `textFrame` renderer, so the
   * command would put a node in the document that nothing draws. The harness said so before it
   * could ship; see `canvas-insert-commands.ts`.
   */
  {
    id: 'drawing',
    controls: [
      { id: 'insert-rectangle', label: 'Rectangle', icon: 'insert-rectangle', command: 'insertRectangle' },
      { id: 'insert-ellipse', label: 'Ellipse', icon: 'insert-ellipse', command: 'insertEllipse' },
      { id: 'insert-line', label: 'Line', icon: 'insert-line', command: 'insertLine' },
      { id: 'insert-drawing', label: 'Drawing', icon: 'insert-frame', command: 'insertDrawing' }
    ]
  },
  /**
   * What a **set** of shapes is for: lining it up, spreading it out, and saying what is in front.
   *
   * Its own group beside the drawing's, because these are the controls that are dead until more
   * than one thing is selected — and a reader who has selected two shapes should find them
   * together rather than hunting along a row of insert buttons.
   *
   * Every one of them greys out on its own answer rather than on a rule written here: aligning
   * wants two shapes, distributing wants three (with two the gaps are equal by definition), and
   * ordering wants one.
   */
  {
    id: 'arrange',
    controls: [
      { id: 'align-shapes-left', label: 'Align left', icon: 'align-boxes-left', command: 'alignShapesLeft' },
      { id: 'align-shapes-centre', label: 'Align centre', icon: 'align-boxes-centre', command: 'alignShapesCentre' },
      { id: 'align-shapes-right', label: 'Align right', icon: 'align-boxes-right', command: 'alignShapesRight' },
      { id: 'align-shapes-top', label: 'Align top', icon: 'align-boxes-top', command: 'alignShapesTop' },
      { id: 'align-shapes-middle', label: 'Align middle', icon: 'align-boxes-middle', command: 'alignShapesMiddle' },
      { id: 'align-shapes-bottom', label: 'Align bottom', icon: 'align-boxes-bottom', command: 'alignShapesBottom' },
      {
        id: 'distribute-shapes-h',
        label: 'Distribute horizontally',
        icon: 'distribute-h',
        command: 'distributeShapesHorizontally'
      },
      {
        id: 'distribute-shapes-v',
        label: 'Distribute vertically',
        icon: 'distribute-v',
        command: 'distributeShapesVertically'
      },
      { id: 'bring-shapes-front', label: 'Bring to front', icon: 'bring-front', command: 'bringShapesToFront' },
      { id: 'bring-shapes-forward', label: 'Bring forward', icon: 'bring-forward', command: 'bringShapesForward' },
      { id: 'send-shapes-backward', label: 'Send backward', icon: 'send-backward', command: 'sendShapesBackward' },
      { id: 'send-shapes-back', label: 'Send to back', icon: 'send-back', command: 'sendShapesToBack' }
    ]
  },
  {
    id: 'layout',
    controls: [
      {
        id: 'frame-row',
        label: 'Side by side',
        icon: 'frame-row',
        command: 'insertFrame',
        payload: { layoutMode: 'row', columns: 2 }
      },
      {
        id: 'frame-column',
        label: 'Stacked',
        icon: 'frame-column',
        command: 'insertFrame',
        payload: { layoutMode: 'column', columns: 2 }
      },
      {
        id: 'frame-grid',
        label: 'Grid',
        icon: 'frame-grid',
        command: 'insertFrame',
        payload: { layoutMode: 'grid', columns: 4 }
      }
    ]
  },

  /**
   * Tables.
   *
   * No `state` on any of them: a table command is never "on", it either applies
   * here or it does not — and whether it does is the command's own answer, given
   * by canExecute. Outside a table every one of them is unavailable, which is
   * what a reader of the toolbar should see.
   */
  {
    id: 'table',
    controls: [
      { id: 'row-above', label: 'Insert row above', icon: 'row-above', command: 'insertRowAbove' },
      { id: 'row-below', label: 'Insert row below', icon: 'row-below', command: 'insertRowBelow' },
      { id: 'row-delete', label: 'Delete row', icon: 'row-delete', command: 'deleteRow' },
      { id: 'column-left', label: 'Insert column left', icon: 'column-left', command: 'insertColumnLeft' },
      { id: 'column-right', label: 'Insert column right', icon: 'column-right', command: 'insertColumnRight' },
      { id: 'column-delete', label: 'Delete column', icon: 'column-delete', command: 'deleteColumn' },
      { id: 'cells-merge', label: 'Merge cells', icon: 'merge-cells', command: 'mergeCells' },
      { id: 'cell-split', label: 'Split cell', icon: 'split-cell', command: 'splitCell' },
      // Which regions of its style the table wants. They are switches on the
      // table and not formatting of their own: with no table style applied they
      // are still meaningful, and become visible the moment one is.
      {
        id: 'look-header-row',
        label: 'Header row',
        icon: 'header-row',
        command: 'toggleTableLook',
        payload: { flag: 'firstRow' },
        lookFlag: 'firstRow'
      },
      {
        id: 'look-first-column',
        label: 'First column',
        icon: 'first-column',
        command: 'toggleTableLook',
        payload: { flag: 'firstColumn' },
        lookFlag: 'firstColumn'
      },
      {
        id: 'look-banded-rows',
        label: 'Banded rows',
        icon: 'banded-rows',
        command: 'toggleTableLook',
        payload: { flag: 'bandedRows' },
        lookFlag: 'bandedRows'
      },
      // Where the text sits in the cell, and which way it runs. Both were things
      // a document could state and a user could not.
      {
        id: 'cell-align-top',
        label: 'Align top',
        icon: 'align-cell-top',
        command: 'setCellVerticalAlign',
        payload: { align: 'top' },
        cellAttribute: { key: 'verticalAlign', value: 'top', whenUnset: true }
      },
      {
        id: 'cell-align-middle',
        label: 'Align middle',
        icon: 'align-cell-middle',
        command: 'setCellVerticalAlign',
        payload: { align: 'center' },
        cellAttribute: { key: 'verticalAlign', value: 'center' }
      },
      {
        id: 'cell-align-bottom',
        label: 'Align bottom',
        icon: 'align-cell-bottom',
        command: 'setCellVerticalAlign',
        payload: { align: 'bottom' },
        cellAttribute: { key: 'verticalAlign', value: 'bottom' }
      },
      {
        // No payload: the button moves to the next direction, as Word's does.
        id: 'cell-text-direction',
        label: 'Text direction',
        icon: 'text-direction',
        command: 'setCellTextDirection'
      },
      /**
       * Shading is a *palette* — `WORD_CELL_SHADING` — and not four buttons here.
       *
       * It was four: three fills and a way back to none, with a comment saying a
       * colour picker was a second dialog to build before the common case worked
       * at all. That was true of the picker and not of the *control*: text colour
       * was the same shape and had nothing at all, so one palette written once
       * answers both, and neither is three colours a reader has to accept.
       */
    ]
  },
  {
    id: 'review',
    controls: [
      { id: 'track-changes', label: 'Track changes', icon: 'track-changes', command: 'toggleTrackChanges' },
      // One button, two directions: an equation becomes the line it came from,
      // and a line that describes an equation becomes one.
      { id: 'math-linear', label: 'Linear', icon: 'math', command: 'toggleMathLinear' },
      { id: 'prev-revision', label: 'Previous change', icon: 'previous', command: 'previousRevision' },
      { id: 'next-revision', label: 'Next change', icon: 'next', command: 'nextRevision' },
      { id: 'accept-revision', label: 'Accept', icon: 'accept', command: 'acceptRevision' },
      { id: 'reject-revision', label: 'Reject', icon: 'reject', command: 'rejectRevision' },
      { id: 'accept-all-revisions', label: 'Accept all', icon: 'accept-all', command: 'acceptAllRevisions' },
      { id: 'reject-all-revisions', label: 'Reject all', icon: 'reject-all', command: 'rejectAllRevisions' }
    ]
  }
];

/**
 * A control that picks a value rather than turning something on and off.
 *
 * Font and size are not toggles: they answer "which one", and the answer can be
 * "the blocks disagree", which is a third state a toggle has no room for. The
 * command takes the chosen value in its payload under `key`.
 */

/** The fonts offered, drawn from the catalogue; see fonts.ts for what is in it. */
export const WORD_FONTS: ChoiceControl = {
  id: 'font-family',
  label: 'Font',
  command: 'setFontFamily',
  key: 'family',
  markType: 'fontFamily',
  attr: 'family',
  options: WORD_FONT_CATALOGUE.map((entry) => ({ value: entry.family, label: entry.family }))
};

/**
 * The sizes offered, in Word's unit.
 *
 * Half-points, because that is what a .docx stores and what the renderer reads a
 * number as — 22 is eleven point. The labels are points, because that is what a
 * writer means by "eleven".
 */
export const WORD_FONT_SIZES: ChoiceControl = {
  id: 'font-size',
  label: 'Size',
  command: 'setFontSize',
  key: 'size',
  markType: 'fontSize',
  attr: 'size',
  options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((points) => ({
    value: points * 2,
    label: String(points)
  })),
  /**
   * The document stores half-points and a reader reads points, so a size that is
   * not one of the presets has to be turned back before it is shown. Named on
   * the model because the model is what knows the unit — an app that divided by
   * two would be an app that knew a `.docx` detail.
   */
  labelOf: (value) => String(Number(value) / 2)
};


/**
 * A control that opens a set of colours.
 *
 * Distinct from `ChoiceControl`, which is a list of named values and reads a
 * mark. A colour is neither: the set on offer is a convenience rather than the
 * whole domain — any colour is valid — and what it applies to may be a mark on
 * the text or an attribute on a cell. So a palette says which command it runs
 * and where the colour goes in the payload, and leaves the drawing to a host
 * that knows what a swatch looks like.
 *
 * Two exist. Both are commands that were already registered and reachable by
 * nothing: `setFontColor` has been in the kit since the kit had marks, and this
 * word processor could not change the colour of its text.
 */

/**
 * The colours offered, and why these.
 *
 * Word's own theme colours and its standard row, which is what a reader
 * recognises — and a small set on purpose: a palette of forty is a colour picker
 * with extra steps, and the point of the swatches is that the common answer is
 * one press away. Anything else is the free field beside them.
 */
const THEME_SWATCHES: { value: string; label: string }[] = [
  { value: '000000', label: 'Black' },
  { value: '404040', label: 'Dark grey' },
  { value: '808080', label: 'Grey' },
  { value: 'D9D9D9', label: 'Light grey' },
  { value: 'FFFFFF', label: 'White' },
  { value: 'C00000', label: 'Dark red' },
  { value: 'FF0000', label: 'Red' },
  { value: 'ED7D31', label: 'Orange' },
  { value: 'FFC000', label: 'Yellow' },
  { value: '70AD47', label: 'Green' },
  { value: '2F5496', label: 'Dark blue' },
  { value: '4472C4', label: 'Blue' },
  { value: '9DC3E6', label: 'Light blue' },
  { value: 'D9E2F3', label: 'Pale blue' },
  { value: '7030A0', label: 'Purple' }
];

/** The colour of the text itself. */
export const WORD_TEXT_COLOR: PaletteControl = {
  id: 'font-color',
  label: 'Text colour',
  icon: 'font-color',
  command: 'setFontColor',
  key: 'color',
  clearCommand: 'removeFontColor',
  markType: 'fontColor',
  attr: 'color',
  swatches: THEME_SWATCHES
};

/**
 * The colour behind the text — the highlighter.
 *
 * Its own swatches: a highlighter's colours are the pen colours, and offering
 * the theme's dark blues as a highlight gives a reader a way to make their own
 * text unreadable in one press. The last is white, which is what a highlighter
 * has instead of nothing when the text sits on a coloured shape.
 *
 * `setHighlight`, not `toggleHighlight`: the toggle takes a colour but toggles,
 * so pressing yellow on green text would take the highlight off rather than
 * turning it yellow. The toggle stays on the toolbar as the one-press
 * highlighter; this is the choice of colour, the same pair as bold and a font.
 */
export const WORD_TEXT_HIGHLIGHT: PaletteControl = {
  id: 'highlight-color',
  label: 'Highlight colour',
  icon: 'highlight',
  command: 'setHighlight',
  key: 'color',
  clearCommand: 'removeHighlight',
  markType: 'highlight',
  attr: 'color',
  swatches: [
    { value: 'FFFF00', label: 'Yellow' },
    { value: 'A5F3A0', label: 'Green' },
    { value: '7FDBFF', label: 'Turquoise' },
    { value: 'FF9AD5', label: 'Pink' },
    { value: 'FFC08A', label: 'Orange' },
    { value: 'D9D9D9', label: 'Grey' },
    { value: 'C7B9FF', label: 'Violet' },
    { value: 'FFFFFF', label: 'White' }
  ]
};

/** The colour behind a block of cells. */
export const WORD_CELL_SHADING: PaletteControl = {
  id: 'cell-shading',
  label: 'Cell shading',
  icon: 'shading',
  command: 'setCellShading',
  key: 'fill',
  // No separate clear command: `setCellShading` with no fill writes an empty
  // one, which is how this schema says "none" — see the command.
  cellAttribute: 'shadingFill',
  swatches: THEME_SWATCHES
};



/**
 * What a choice control resolves to for a block, following the style cascade.
 *
 * Word's own font box works this way: it shows what the text *is*, not whether
 * someone typed it in directly.
 */
export function inheritedChoice(
  choice: ChoiceControl,
  styles: StyleResolver | undefined,
  block: DocumentNode | undefined
): string | number | undefined {
  if (!styles || !block) return undefined;
  const format = styles.resolveNode(block, 'character') as Record<string, unknown>;
  const value = format[choice.markType];
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;

  // A stylesheet writes a stack — `Georgia, serif` — where Word names one font
  // and lets the reader's machine substitute. The control offers font names, so
  // the first of the stack is the one it is showing; matching the whole string
  // would leave the box blank for text that is plainly set in Georgia.
  return value.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/**
 * Whether the selection is in a list of this kind.
 *
 * Three-valued like every other control: a selection covering a bulleted and a
 * plain paragraph is in neither state, and drawing it as off would turn one
 * click into a silent reformat of both.
 *
 * The kind is supplied rather than read, because answering it means resolving
 * the definition a paragraph names — the selection knows the name and not what
 * it means.
 */
export function listState(
  kind: ListKind,
  summary: SelectionSummary,
  currentKind: () => ListKind | null
): MarkState {
  if (summary.mixedAttributes.includes('numId')) return 'mixed';
  return currentKind() === kind ? 'on' : 'off';
}

/**
 * Whether a table asks its style for one of its regions.
 *
 * Two-valued, unlike a mark: a table either asks for its header row or it does
 * not, and a selection is in one table at a time. Off outside a table, where the
 * button is disabled anyway and there is nothing to be on about.
 */
export function tableLookState(
  flag: keyof TableLook,
  table: DocumentNode | undefined
): MarkState {
  if (!table) return 'off';
  return parseTableLook(table.attributes?.look)[flag] ? 'on' : 'off';
}

/**
 * Whether a cell already has the value a control sets.
 *
 * `whenUnset` is which of a group of controls speaks for a cell that says
 * nothing: a cell with no vertical alignment sits at the top, so the top button
 * is on for a cell nobody has touched — which is what the page shows.
 */
export function cellAttributeState(
  attribute: { key: string; value: string; whenUnset?: boolean },
  cell: DocumentNode | undefined
): MarkState {
  if (!cell) return 'off';
  const current = cell.attributes?.[attribute.key];
  if (typeof current !== 'string' || current.length === 0) {
    return attribute.whenUnset ? 'on' : 'off';
  }
  return current === attribute.value ? 'on' : 'off';
}

/** The styles the dropdown offers, and the command that applies each. */
export const WORD_STYLES: { id: string; label: string; command: string; stype: string; level?: number }[] = [
  { id: 'paragraph', label: 'Body text', command: 'setParagraph', stype: 'paragraph' },
  { id: 'heading1', label: 'Heading 1', command: 'setHeading1', stype: 'heading', level: 1 },
  { id: 'heading2', label: 'Heading 2', command: 'setHeading2', stype: 'heading', level: 2 },
  { id: 'heading3', label: 'Heading 3', command: 'setHeading3', stype: 'heading', level: 3 }
];

/**
 * Which style entry the selection is currently in, if the blocks agree.
 *
 * Nothing when they do not: a selection covering a heading and a paragraph is
 * in no single style, and showing one of them would apply it to both on the
 * next change.
 */
export function currentStyle(summary: SelectionSummary): string | null {
  if (summary.mixedAttributes.includes('stype') || summary.mixedAttributes.includes('level')) {
    return null;
  }

  const stype = summary.blockAttributes.stype;
  const level = summary.blockAttributes.level;
  const match = WORD_STYLES.find(
    (style) => style.stype === stype && (style.level === undefined || style.level === level)
  );
  return match?.id ?? null;
}

