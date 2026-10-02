import type { RefObject } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { ContextToolbar, Controls } from '@barocss/office-editor-ui';
import { Icon, MenuAction, SecondaryPopup } from '@barocss/office-ui';
import { siteControlsIn } from '@barocss/office-site';
import { useSiteSelectionTarget } from './object-tools';

const PRIMARY = siteControlsIn('text').filter(one => ['toggleBold', 'toggleItalic'].includes(one.command));
const SECONDARY = siteControlsIn('text').filter(one => ['toggleUnderline', 'toggleStrikeThrough'].includes(one.command));

/** Site keeps its commands and ownership; the shared toolbar measures the actual text range. */
export function TextSurface({ editor, mode, active = true, scope, portalRoot, ownerKey = '', onFullTools }: {
  editor: Editor;
  mode: 'select' | 'text';
  active?: boolean;
  scope?: RefObject<HTMLElement | null>;
  portalRoot?: HTMLElement | null;
  /** Current page/component/scope/writing lifetime, supplied by the product. */
  ownerKey?: string;
  onFullTools?: () => void;
}) {
  const shown = active && mode === 'text';
  return <ContextToolbar key={ownerKey} editor={editor} controls={[]} active={shown} compact
    scope={scope} portalRoot={portalRoot} label="선택한 글 서식" data-site-selection-chrome="text">
    {(selection) => <TextTools editor={editor} selection={selection} active={shown}
      scope={scope} ownerKey={ownerKey} onFullTools={onFullTools} />}
  </ContextToolbar>;
}

function TextTools({ editor, selection, active, scope, ownerKey, onFullTools }: {
  editor: Editor;
  selection: ModelSelection | null;
  active: boolean;
  scope?: RefObject<HTMLElement | null>;
  ownerKey: string;
  onFullTools?: () => void;
}) {
  const target = useSiteSelectionTarget(editor, selection, ownerKey, active, scope);
  const can = (one: (typeof PRIMARY)[number]) => target.current() && editor.canExecuteCommand(one.command, one.payload);
  const run = (one: (typeof PRIMARY)[number]) => {
    // Ask current authority before restoring a retained target or running a command.
    if (!can(one)) return;
    void editor.executeCommand(one.command, one.payload);
  };
  return <>
    <Controls editor={editor} controls={PRIMARY} can={can} onRun={run} appearance="contextual" mark="site-text-control" />
    <SecondaryPopup triggerLabel="글 서식 더 보기" label="추가 글 서식" variant="menu" disabled={!target.current()}>
      <Controls editor={editor} controls={SECONDARY} can={can} onRun={run} appearance="menu" mark="site-text-control" />
      {onFullTools && <MenuAction onClick={() => { if (target.current()) onFullTools(); }}>
        <Icon name="type-url" size={16} /><span>링크 및 삽입 도구</span>
      </MenuAction>}
    </SecondaryPopup>
  </>;
}
