/**
 * One way to draw Word's toolbar: plain elements.
 *
 * A reference rather than the only way. What the toolbar *is* lives in
 * toolbar-model, which knows nothing about the DOM, so a React host can render
 * the same controls with its own component kit and get the same behaviour.
 */
import type { Editor } from '@barocss/editor-core';
import {
  currentStyle,
  WORD_STYLES,
  WORD_TOOLBAR,
  type ToolbarControl
} from './toolbar-model';

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
