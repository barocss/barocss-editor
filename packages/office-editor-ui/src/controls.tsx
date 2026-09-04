import type { Editor } from '@barocss/editor-core';
import type { Control, KeyModel } from '@barocss/office-controls';
import { Icon } from '@barocss/office-icons';
import { Tip } from '@barocss/office-ui';
import { useControls } from './use-controls';

/**
 * **컨트롤들, 그려진 채로** — the five things every product's toolbar does, written once.
 *
 * ## 다섯 가지 중 넷은 제품과 무관하다
 *
 * ```
 * 1. 에디터를 구독한다        useRevision(watchAnswers(editor))       제품 무관
 * 2. 선언을 읽는다            SITE_TOOLBAR / NOTE_TOOLBAR / …          제품마다 다름
 * 3. 에디터에 물어본다        canExecuteCommand, markState             제품 무관
 * 4. 원시 부품으로 그린다     office-ui                                제품 무관
 * 5. 누르면 명령을 실행한다   preventDefault → executeCommand          제품 무관
 * ```
 *
 * So the list arrives as a prop and everything else lives here. Three ribbons had this five times
 * over between them, and the only reason one of them could not draw all four products is that the
 * four declarations were four types — which they no longer are.
 *
 * ## `onMouseDown` 이 `preventDefault` 하는 이유
 *
 * The single most important line, and the one every product wrote for itself. A button takes the
 * focus on `mousedown` and the selection goes with it; every command here reads the model's
 * selection, which survives — but a body that visibly loses its caret each time a reader presses
 * 굵게 is a body that reads as broken.
 *
 * ## 상자는 부르는 쪽의 몫입니다
 *
 * This returns a fragment, not a container. A note's bar is one flex row of marks, a separator and
 * blocks; the site's ribbon is `ToolbarGroup`s with rules between them. Wrapping the buttons in a
 * `<div>` here would put a box in the middle of both, and the layout is exactly the part that is
 * each product's own. What is shared is the button.
 *
 * ## 상태는 마크에서 읽고, 없으면 안 그린다
 *
 * `data-state` and `aria-pressed` are drawn only for a control that declares a `mark`. A toggle with
 * no state is a control that does something and never says what — a reader presses 굵게 and has to
 * look at the words to find out whether they turned it on or off. A control that toggles nothing —
 * an insert, a delete — has no state to draw and drawing one would be a lie.
 */
export interface ControlsProps<C extends Control = Control> {
  editor: Editor;
  /** What to draw. A product's own list, or a slice of one. */
  controls: readonly C[];
  /**
   * Whether a control may run right now — defaults to asking the editor.
   *
   * A prop because a product sometimes knows more than the editor does: the site's 글 고치기 mode
   * refuses commands the editor would happily run, and hiding that in this component would be this
   * package learning a product's vocabulary.
   */
  can?: (control: C) => boolean;
  /** What a press does — defaults to running the control's command with its payload. */
  onRun?: (control: C) => void;
  /** The `data-` attribute each button carries, so a product's own checks can find them. */
  mark?: string;
  /** How large the pictures are. */
  iconSize?: number;
  /** The product's key bindings, so each control can say which chord runs it. */
  keys?: KeyModel[];
  apple?: boolean;
}

export function Controls<C extends Control>({
  editor,
  controls,
  can,
  onRun,
  keys,
  apple,
  mark = 'chrome-control',
  iconSize = 13
}: ControlsProps<C>) {
  const rows = useControls(editor, controls, { can, onRun, keys, apple });

  return (
    <>
      {rows.map((one) => (
        <Tip key={one.key} label={one.says} shortcut={one.shortcut}>
          <button
            type="button"
            aria-label={one.says}
            aria-keyshortcuts={one.shortcut}
            disabled={one.disabled}
            aria-pressed={one.control.mark ? one.state === 'on' : undefined}
            data-state={one.control.mark ? one.state : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={one.run}
            {...{ [`data-${mark}`]: one.key }}
          >
            {/* The picture, or the word for a control that has none — see `Control.icon`. */}
            {one.control.icon ? <Icon name={one.control.icon} size={iconSize} /> : one.label}
          </button>
        </Tip>
      ))}
    </>
  );
}
