import { useMemo } from 'react';
import { markState, type Editor, type MarkState, type SelectionSummary } from '@barocss/editor-core';
import { chordFor, controlId, keyLabel, type Control, type KeyModel } from '@barocss/office-controls';
import { useEditorRevision } from './revision';

/**
 * A control, answered — what a surface needs to draw one and nothing about how.
 *
 * `state` is `'off'` for a control that toggles nothing, not `undefined`: a surface that has to
 * decide what an absent state means is a surface making a decision this layer already made.
 */
export interface ControlRow<C extends Control = Control> {
  /** What it was declared as, for the cases a product still has to special-case. */
  control: C;
  /** Unique within its product — see `controlId`. */
  key: string;
  /** What a reader reads on it. */
  label: string;
  /** What a reader reads *about* it — the title if there is one, else the label. */
  says: string;
  /** The chord, already written the way this reader's platform writes one. */
  shortcut?: string;
  state: MarkState;
  disabled: boolean;
  run: () => void;
}

export interface UseControlsOptions<C extends Control> {
  /** The product's key bindings, so a control can say which chord runs it. */
  keys?: KeyModel[];
  /** `⌘` or `Ctrl` — a fact about the reader's platform, not about a control. */
  apple?: boolean;
  /** Whether a control may run now. Defaults to asking the editor with the control's payload. */
  can?: (control: C) => boolean;
  /** What a press does. Defaults to running the command with the payload. */
  onRun?: (control: C) => void;
  /**
   * What the control's state is — defaults to reading the mark it declares, or `'off'`.
   *
   * The third of the three escape hatches, and the one that earned itself: Word's ribbon answers
   * four ways. A list button resolves a numbering definition, a table-look button reads a flag off
   * the table the caret is in, a cell button reads an attribute, and everything else asks the
   * control's own `state` function. None of that is a mark, and none of it belongs in a package that
   * must not learn a product's vocabulary.
   */
  state?: (control: C, summary: SelectionSummary) => MarkState;
}

/**
 * **툴바가 하는 다섯 가지 중 넷** — 구독, 상태 읽기, 실행 가능 여부, 실행.
 *
 * ## 왜 컴포넌트가 아니라 훅인가
 *
 * Because the button is not shared and the logic is. Measured: the site's ribbon draws each control
 * as a `ToolbarToggle`, which is a `RadixToolbar.Button` and only lives inside a `RadixToolbar.Root`;
 * a note's bar is a plain `<div>` of plain `<button>`s with its own stylesheet. Both are right for
 * the chrome they are — a ribbon has roving focus across groups and a note's bar is one row — and a
 * shared component that rendered one of them would simply move the problem.
 *
 * What is identical in all four products is everything else:
 *
 * ```
 * 1. 에디터를 구독한다     useRevision(watchAnswers(editor))
 * 3. 상태를 읽는다         markState(summary, control.mark)
 * 3. 실행 가능한지 묻는다  canExecuteCommand(command, payload)
 * 5. 실행한다              executeCommand(command, payload)
 * ```
 *
 * …plus the chord, which every product looked up its own way. Four copies of four steps.
 *
 * ## `watchAnswers` 여야 하는 이유
 *
 * **The document or the selection moved.** Both, and it has to be both: a toggle's state is a fact
 * about the selection, and whether an insert may run is a fact about the document. Read once at
 * mount and never again is what a toolbar that never redraws looks like from outside — *nothing
 * happens* — and this repository has measured it that way more than once.
 */
export function useControls<C extends Control>(
  editor: Editor,
  controls: readonly C[],
  options: UseControlsOptions<C> = {}
): ControlRow<C>[] {
  const revision = useEditorRevision(editor);
  const { keys, apple, can, onRun, state } = options;

  return useMemo(
    // `revision` is the subscription: it is the reason this recomputes at all.
    () => controlRows(editor, controls, { keys, apple, can, onRun, state }),
    [editor, controls, keys, apple, can, onRun, state, revision]
  );
}

/**
 * The same answers, **without React** — which is where the logic actually lives.
 *
 * A hook cannot be checked without a renderer, and this repository's rule is that a thing worth
 * checking should be checkable in milliseconds. So the four steps are here and the hook is the
 * subscription around them: `useControls` decides *when* to ask and this decides *what the answer
 * is*.
 */
export function controlRows<C extends Control>(
  editor: Editor,
  controls: readonly C[],
  options: UseControlsOptions<C> = {}
): ControlRow<C>[] {
  const { keys, apple, can, onRun, state } = options;
  const summary = editor.getSelectionSummary();

  return controls.map((one) => ({
    control: one,
    key: controlId(one),
    label: one.label,
    says: one.title ?? one.label,
    /*
     * The binding first, the declaration second. A toolbar is where a reader *finds* a chord, and a
     * chord written on a control that the keymap has since moved is worse than none.
     */
    shortcut: keys
      ? keyLabel(chordFor(keys, { command: one.command }) ?? one.shortcut, apple)
      : one.shortcut,
    state: state
      ? state(one, summary)
      : one.mark
        ? markState(summary, one.mark)
        : ('off' as MarkState),
    disabled: can
      ? !can(one)
      : editor.canExecuteCommand(one.command, one.payload as never) !== true,
    run: () => (onRun ? onRun(one) : void editor.executeCommand(one.command, one.payload as never))
  }));
}
