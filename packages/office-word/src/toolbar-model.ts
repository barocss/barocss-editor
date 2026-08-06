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

export interface ToolbarControl {
  id: string;
  label: string;
  /** What the button shows. */
  icon: string;
  command: string;
  payload?: Record<string, unknown>;
  /** How to read this control's state out of the selection. */
  state?: ((summary: SelectionSummary) => MarkState) & { markType?: string };
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
      }
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
      }
    ]
  }
];

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

