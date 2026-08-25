import type { Editor } from '@barocss/editor-core';
import { watchAnswers } from '@barocss/editor-core';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  ZoomControl,
  useRevision
} from '@barocss/office-ui';
import { BREAKPOINTS, type BreakpointId } from '@barocss/office-site';
import type { PointerMode } from './overlay';

/**
 * What a reader can do to the page, along the top.
 *
 * ## Every control asks the editor whether it can run
 *
 * `canExecute`, on every render, rather than a rule written here about when a section may be
 * inserted. The command already knows — it has to, because a key binding and a menu reach the same
 * command and a rule kept in a toolbar is a rule the keyboard does not follow. So a control that is
 * grey is grey because the command said no.
 *
 * ## Why the widths are a set of toggles and not a picker
 *
 * They are all on at once. That is the product's opening claim — a reader answering "what does this
 * look like on a phone" while they are still deciding what it says — and a picker would quietly make
 * it one-at-a-time again, which is the tool this is meant not to be.
 */
export function Ribbon({
  editor,
  mode,
  onMode,
  shown,
  onShown,
  zoom,
  onZoom,
  onFit
}: {
  editor: Editor;
  mode: PointerMode;
  onMode: (mode: PointerMode) => void;
  shown: BreakpointId[];
  onShown: (shown: BreakpointId[]) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  onFit: () => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  /*
   * `canExecuteCommand`, which is the editor's own name for it — asked on every render rather than
   * cached, because a control that remembers being available is wrong the moment something is
   * undone.
   */
  const can = (name: string) =>
    (editor as never as { canExecuteCommand?: (n: string) => boolean }).canExecuteCommand?.(name) ?? false;
  const run = (name: string, payload?: unknown) =>
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(name, payload);

  // Read so the enabled state is recomputed when the selection or the document moves.
  void revision;

  return (
    <Toolbar className="st-ribbon" label="사이트 도구">
      <ToolbarGroup id="mode">
        {/*
          The pointer's owner, said out loud.

          A reader gets here by double-clicking into text and leaves by pressing Escape, so the
          toggle is rarely the way it changes — but a mode nothing on screen names is a mode a reader
          cannot get out of when a gesture goes wrong.
        */}
        <ToolbarToggle
          id="mode-select"
          label="선택"
          state={mode === 'select' ? 'on' : 'off'}
          onActivate={() => onMode('select')}
        >
          선택
        </ToolbarToggle>
        <ToolbarToggle
          id="mode-text"
          label="텍스트"
          shortcut="Esc"
          state={mode === 'text' ? 'on' : 'off'}
          onActivate={() => onMode('text')}
        >
          텍스트
        </ToolbarToggle>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup id="insert">
        <ToolbarToggle
          id="insert-section"
          label="섹션 넣기"
          state="off"
          disabled={!can('insertSection')}
          onActivate={() => run('insertSection')}
        >
          섹션
        </ToolbarToggle>
        <ToolbarToggle
          id="insert-row"
          label="가로 스택 넣기"
          state="off"
          disabled={!can('insertRow')}
          onActivate={() => run('insertRow')}
        >
          가로
        </ToolbarToggle>
        <ToolbarToggle
          id="insert-grid"
          label="그리드 넣기"
          state="off"
          disabled={!can('insertGrid')}
          onActivate={() => run('insertGrid')}
        >
          그리드
        </ToolbarToggle>
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup id="widths">
        {BREAKPOINTS.map((one) => (
          <ToolbarToggle
            key={one.id}
            id={`width-${one.id}`}
            label={`${one.label} · ${one.width}px`}
            state={shown.includes(one.id) ? 'on' : 'off'}
            onActivate={() =>
              onShown(
                shown.includes(one.id) ? shown.filter((id) => id !== one.id) : [...shown, one.id]
              )
            }
          >
            {one.label}
          </ToolbarToggle>
        ))}
      </ToolbarGroup>

      <div className="st-ribbon-end">
        <ZoomControl zoom={zoom} onChange={onZoom} onFit={onFit} fitLabel="맞춤" />
      </div>
    </Toolbar>
  );
}
