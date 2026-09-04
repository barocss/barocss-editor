import type { Editor } from '@barocss/editor-core';
import type { Control } from '@barocss/office-controls';
import { useControls, type ControlRow, type UseControlsOptions } from './use-controls';

/**
 * **훅을 `.map` 안에서 부를 수 없어서 생기는 일**, 여기서 한 번만 처리합니다.
 *
 * ## 이것이 없었을 때 무슨 일이 일어났나
 *
 * A ribbon draws groups, and each group's controls need their own `useControls` — which is a hook,
 * and a hook cannot be called inside a `.map`. So each app wrote a small component to hold the call:
 * Word grew a `GroupControls`, the deck grew a `GroupControls`, and the two were the same component
 * with different props. **Moving the logic into a package made every app grow a wrapper**, and the
 * ribbons came out *longer* than before — 634 → 664, 366 → 421, 454 → 511.
 *
 * That is the shared layer failing at its own job: it removed a duplication and created a smaller
 * one. So the wrapper lives here, as a render prop, and the apps go back to drawing.
 *
 * ```tsx
 * <ControlRows editor={editor} controls={group.controls} options={{ can, onRun, state }}>
 *   {(rows) =>
 *     rows.map((one) => (
 *       <ToolbarToggle key={one.key} id={one.key} label={one.says} state={one.state}
 *         shortcut={one.shortcut} disabled={one.disabled} onActivate={one.run}>
 *         <Icon name={one.control.icon ?? 'add'} />
 *       </ToolbarToggle>
 *     ))
 *   }
 * </ControlRows>
 * ```
 *
 * ## `options` 가 매 렌더 새 객체인 것에 대하여
 *
 * Written inline, it is — so the memo inside `useControls` recomputes on every render rather than
 * only when the selection moves. Left as it is and said out loud rather than papered over with a
 * `useMemo` the caller would have to remember: this is exactly what the code did before, the work is
 * four small map operations over a declared list, and a caller who measures a problem can hoist the
 * object. A component that silently required a memoised prop would be worse.
 */
export function ControlRows<C extends Control>({
  editor,
  controls,
  options,
  children
}: {
  editor: Editor;
  controls: readonly C[];
  options?: UseControlsOptions<C>;
  children: (rows: ControlRow<C>[]) => React.ReactNode;
}) {
  return <>{children(useControls(editor, controls, options))}</>;
}
