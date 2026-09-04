/**
 * One way to draw Word's toolbar: plain elements.
 *
 * A reference rather than the only way. What the toolbar *is* lives in
 * toolbar-model, which knows nothing about the DOM, so a React host can render
 * the same controls with its own component kit and get the same behaviour.
 */
import type { Editor } from '@barocss/editor-core';
import { controlId } from '@barocss/office-controls';
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
      /*
       * `controlId` 로 묻는다. `Control.id` 가 선택적이 된 뒤로 여기가 `string | undefined` 를
       * `dataset` 과 `Map` 에 넣고 있었고, 그러면 id 를 안 적은 컨트롤이 전부 `undefined` 라는 한
       * 칸을 나눠 쓴다 — 마지막 것만 남고 나머지는 refresh 가 못 찾는다.
       */
      const id = controlId(control);
      button.dataset.control = id;
      // 아이콘 이름이 아이콘이 아니다: 글자로 그리면 이름이 그대로 보인다. 여기는 그림 없는 DOM
      // 툴바이므로 라벨을 쓰고, 이름은 `data-control` 이 갖는다.
      button.textContent = control.label;
      button.title = control.label;
      button.setAttribute('aria-label', control.label);

      // Pointer down rather than click: a click moves focus out of the editor
      // first, and the selection the command needs goes with it.
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        void editor.run(control.command, control.payload);
      });

      groupEl.appendChild(button);
      buttons.set(id, { control, el: button });
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
