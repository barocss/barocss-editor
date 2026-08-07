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
import { markState } from '@barocss/editor-core';
import type { StyleResolver } from './style-resolver';
import type { DocumentNode } from './document-access';
import { WORD_FONT_CATALOGUE } from './fonts';
import type { ListKind } from './list-commands';

export interface ToolbarControl {
  id: string;
  label: string;
  /** What the button shows. */
  icon: string;
  command: string;
  payload?: Record<string, unknown>;
  /** How to read this control's state out of the selection. */
  state?: ((summary: SelectionSummary) => MarkState) & { markType?: string };
  /**
   * That this control turns a list of this kind on and off.
   *
   * Which kind a paragraph is in cannot be read from the selection alone — it
   * takes resolving the numbering definition the paragraph names, which needs
   * the document. So the control says what it is and the host answers, the same
   * way a font control asks what the text inherits.
   */
  listKind?: ListKind;
}

/**
 * The marks the toolbar reads, so a schema can be asked whether they exist.
 *
 * The toolbar curates rather than mirroring: a schema with forty marks does not
 * make a usable toolbar, and Word's own shows a dozen. But what it curates has
 * to be real, and this is what lets a test say so.
 */
export function toolbarMarkTypes(groups: ToolbarGroup[] = WORD_TOOLBAR): string[] {
  return groups
    .flatMap((group) => group.controls)
    .map((control) => control.state?.markType)
    .filter((type): type is string => typeof type === 'string');
}

/** The commands the toolbar runs, so the same can be asked of an editor. */
export function toolbarCommands(groups: ToolbarGroup[] = WORD_TOOLBAR): string[] {
  return [...new Set(groups.flatMap((group) => group.controls).map((control) => control.command))];
}

/** A group of controls, drawn together with a separator between groups. */
export interface ToolbarGroup {
  id: string;
  controls: ToolbarControl[];
}

/**
 * Reads a mark: on when it covers everything, mixed when it covers some.
 *
 * The mark's name is recorded on the control as well, so that the schema can be
 * asked whether it exists. A control naming a mark the schema does not define
 * is a button that is always off — it reads something nothing ever writes — and
 * that is a mistake nobody notices, because an off button looks like an off
 * button.
 */
const mark = (type: string) => {
  const read = (summary: SelectionSummary): MarkState => markState(summary, type);
  read.markType = type;
  return read as ((summary: SelectionSummary) => MarkState) & { markType: string };
};

/**
 * Reads a block attribute: on when every block agrees on this value, mixed when
 * they disagree.
 *
 * Disagreement has to be visible. An alignment button that showed "off" for a
 * selection of a left-aligned and a centred paragraph would tell the user
 * neither is centred, which is false.
 */
const attribute = (key: string, value: unknown) => (summary: SelectionSummary): MarkState => {
  if (summary.mixedAttributes.includes(key)) return 'mixed';
  return summary.blockAttributes[key] === value ? 'on' : 'off';
};

export const WORD_TOOLBAR: ToolbarGroup[] = [
  {
    id: 'history',
    controls: [
      { id: 'undo', label: 'Undo', icon: '↶', command: 'historyUndo' },
      { id: 'redo', label: 'Redo', icon: '↷', command: 'historyRedo' }
    ]
  },
  {
    id: 'character',
    controls: [
      { id: 'bold', label: 'Bold', icon: 'B', command: 'toggleBold', state: mark('bold') },
      { id: 'italic', label: 'Italic', icon: 'I', command: 'toggleItalic', state: mark('italic') },
      {
        id: 'underline',
        label: 'Underline',
        icon: 'U',
        command: 'toggleUnderline',
        state: mark('underline')
      },
      {
        id: 'strike',
        label: 'Strikethrough',
        icon: 'S',
        command: 'toggleStrikeThrough',
        state: mark('strikethrough')
      },
      {
        id: 'superscript',
        label: 'Superscript',
        icon: 'x²',
        command: 'toggleSuperscript',
        state: mark('superscript')
      },
      {
        id: 'subscript',
        label: 'Subscript',
        icon: 'x₂',
        command: 'toggleSubscript',
        state: mark('subscript')
      },
      {
        id: 'small-caps',
        label: 'Small capitals',
        icon: 'ᴀ',
        command: 'toggleSmallCaps',
        state: mark('smallCaps')
      },
      {
        // Word's highlighter is a colour picker; this is its default colour,
        // which is the one the button in Word applies when clicked rather than
        // opened.
        id: 'highlight',
        label: 'Highlight',
        icon: '▨',
        command: 'toggleHighlight',
        payload: { color: 'yellow' },
        state: mark('highlight')
      }
    ]
  },
  {
    id: 'list',
    controls: [
      { id: 'bullet-list', label: 'Bulleted list', icon: '•', command: 'toggleBulletList', listKind: 'bullet' },
      { id: 'ordered-list', label: 'Numbered list', icon: '1.', command: 'toggleOrderedList', listKind: 'ordered' },
      { id: 'outdent', label: 'Decrease indent', icon: '⇤', command: 'outdentText' },
      { id: 'indent', label: 'Increase indent', icon: '⇥', command: 'indentText' }
    ]
  },
  {
    id: 'paragraph',
    controls: [
      {
        id: 'align-left',
        label: 'Align left',
        icon: '⟸',
        command: 'alignLeft',
        state: attribute('alignment', 'left')
      },
      {
        id: 'align-center',
        label: 'Centre',
        icon: '⟺',
        command: 'alignCenter',
        state: attribute('alignment', 'center')
      },
      {
        id: 'align-right',
        label: 'Align right',
        icon: '⟹',
        command: 'alignRight',
        state: attribute('alignment', 'right')
      },
      {
        id: 'align-justify',
        label: 'Justify',
        icon: '☰',
        command: 'alignJustify',
        state: attribute('alignment', 'justify')
      }
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
export interface ToolbarChoice {
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
}

/** The fonts offered, drawn from the catalogue; see fonts.ts for what is in it. */
export const WORD_FONTS: ToolbarChoice = {
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
export const WORD_FONT_SIZES: ToolbarChoice = {
  id: 'font-size',
  label: 'Size',
  command: 'setFontSize',
  key: 'size',
  markType: 'fontSize',
  attr: 'size',
  options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((points) => ({
    value: points * 2,
    label: String(points)
  }))
};

/**
 * The value a choice control should show, or nothing when the selection does not
 * agree on one.
 *
 * Nothing rather than a guess: showing one of two fonts in a selection that
 * spans both would apply it to the whole selection on the next change.
 */
export function currentChoice(
  choice: ToolbarChoice,
  summary: SelectionSummary,
  inherited?: () => string | number | undefined
): string | null {
  if (summary.mixedMarks.includes(choice.markType)) return null;

  const value = summary.markAttributes?.[choice.markType]?.[choice.attr];
  if (value !== undefined && value !== null) return String(value);

  // No mark is not the same as no value. Almost no text in a Word document
  // carries direct font formatting — it inherits from its style, and its
  // style's parent, and the document defaults. A box that showed "—" for a
  // paragraph plainly set in Georgia would be saying the selection disagrees
  // with itself when it agrees perfectly, which is the one thing that state is
  // supposed to mean.
  const resolved = inherited?.();
  return resolved === undefined ? null : String(resolved);
}

/**
 * What a choice control resolves to for a block, following the style cascade.
 *
 * Word's own font box works this way: it shows what the text *is*, not whether
 * someone typed it in directly.
 */
export function inheritedChoice(
  choice: ToolbarChoice,
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

