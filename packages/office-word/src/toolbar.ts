/**
 * Word's toolbar.
 *
 * Every control here answers a question about the selection and runs a command
 * — nothing else. It holds no state of its own, because state it held would be
 * state that could disagree with the document: a bold button that remembers
 * being pressed is a button that lies after an undo.
 *
 * The three-valued answer is the whole point. A selection across text that is
 * partly bold gets an indeterminate button rather than an off one, and a style
 * dropdown over two different styles shows nothing rather than one of them.
 * Rendering either as a definite value invites a click that silently reformats
 * everything the user had selected.
 */
import type { Editor, MarkState, SelectionSummary } from '@barocss/editor-core';
import { markState } from '@barocss/editor-core';

export interface ToolbarControl {
  id: string;
  label: string;
  /** What the button shows. */
  icon: string;
  command: string;
  payload?: Record<string, unknown>;
  /** How to read this control's state out of the selection. */
  state?: (summary: SelectionSummary) => MarkState;
}

/** A group of controls, drawn together with a separator between groups. */
export interface ToolbarGroup {
  id: string;
  controls: ToolbarControl[];
}

/** Reads a mark: on when it covers everything, mixed when it covers some. */
const mark = (type: string) => (summary: SelectionSummary): MarkState => markState(summary, type);

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

export interface WordToolbar {
  element: HTMLElement;
  /** Redraw from the editor's current selection. */
  refresh(): void;
  destroy(): void;
}

/**
 * Build the toolbar and keep it in step with the editor.
 *
 * Refreshed on selection and content changes rather than on a timer: those are
 * the only two things that can change the answer, and redrawing on anything
 * else is work the user cannot see.
 */
export function createWordToolbar(editor: Editor, host: HTMLElement): WordToolbar {
  const element = host.ownerDocument.createElement('div');
  element.className = 'w-toolbar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Formatting');

  const buttons = new Map<string, { control: ToolbarControl; el: HTMLButtonElement }>();

  const select = host.ownerDocument.createElement('select');
  select.className = 'w-toolbar-style';
  select.setAttribute('aria-label', 'Paragraph style');
  // An entry for "the blocks disagree", which cannot be chosen — picking it
  // would mean asking for a style called nothing.
  const mixedOption = host.ownerDocument.createElement('option');
  mixedOption.value = '';
  mixedOption.textContent = '—';
  mixedOption.disabled = true;
  select.appendChild(mixedOption);

  for (const style of WORD_STYLES) {
    const option = host.ownerDocument.createElement('option');
    option.value = style.id;
    option.textContent = style.label;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    const style = WORD_STYLES.find((entry) => entry.id === select.value);
    if (style) void editor.run(style.command);
  });
  element.appendChild(select);

  for (const group of WORD_TOOLBAR) {
    const groupEl = host.ownerDocument.createElement('div');
    groupEl.className = 'w-toolbar-group';
    groupEl.dataset.group = group.id;

    for (const control of group.controls) {
      const button = host.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'w-toolbar-button';
      button.dataset.control = control.id;
      button.textContent = control.icon;
      button.title = control.label;
      button.setAttribute('aria-label', control.label);

      // Pointer down rather than click: a click moves focus out of the editor
      // first, and the selection the command needs goes with it.
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        void editor.run(control.command, control.payload);
      });

      groupEl.appendChild(button);
      buttons.set(control.id, { control, el: button });
    }

    element.appendChild(groupEl);
  }

  const refresh = (): void => {
    const summary = editor.getSelectionSummary();

    for (const { control, el } of buttons.values()) {
      const state = control.state?.(summary) ?? 'off';
      el.dataset.state = state;
      // `aria-pressed="mixed"` is what a screen reader needs to say
      // "partially pressed"; a plain false would state something untrue.
      el.setAttribute('aria-pressed', state === 'on' ? 'true' : state === 'mixed' ? 'mixed' : 'false');
      el.disabled = !editor.canRun(control.command, control.payload);
    }

    const style = currentStyle(summary);
    select.value = style ?? '';
    select.dataset.mixed = style === null ? 'true' : 'false';
  };

  const onChange = () => refresh();
  editor.on('editor:selection.model', onChange);
  editor.on('editor:content.change', onChange);
  refresh();

  host.insertBefore(element, host.firstChild);

  return {
    element,
    refresh,
    destroy: () => {
      editor.off('editor:selection.model', onChange);
      editor.off('editor:content.change', onChange);
      element.remove();
    }
  };
}
