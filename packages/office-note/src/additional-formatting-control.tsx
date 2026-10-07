import { isNative2NoteEditor } from './session';
import { useEffect, useState, type ReactNode } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { useControls } from '@barocss/office-editor-ui';
import { Icon } from '@barocss/office-icons';
import { MenuAction, SecondaryPopup } from '@barocss/office-ui';
import { noteControlsIn } from './toolbar-model';

export const additionalFormattingCommands = new Set(['toggleUnderline', 'toggleStrikeThrough', 'toggleCode', 'toggleSuperscript', 'toggleSubscript', 'clearFormatting']);
export function AdditionalFormattingControl({ editor, selection, children }: { editor: Editor; selection: ModelSelection | null; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const key = JSON.stringify(selection);
  useEffect(() => setOpen(false), [key]);
  const rows = useControls(editor, noteControlsIn('mark', isNative2NoteEditor(editor) ? 'strike' : 'strikethrough').filter(item => additionalFormattingCommands.has(item.command)), {
    onRun: control => {
      if (selection) editor.selectionManager.setSelection(selection);
      void editor.executeCommand(control.command, control.payload); setOpen(false);
    }
  });
  return <SecondaryPopup triggerLabel="추가 서식" label="추가 서식" open={open} onOpenChange={setOpen} variant="menu" className="min-w-36">
      {rows.map(row => <MenuAction key={row.key} aria-label={row.says} disabled={row.disabled}
        role={row.control.mark ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={row.control.mark ? (row.state === 'mixed' ? 'mixed' : row.state === 'on') : undefined}
        selected={row.state === 'on'} data-note-control={row.key} data-state={row.control.mark ? row.state : undefined} onClick={row.run}>
        <Icon name={row.control.icon} size={16} /><span>{row.label}</span>
      </MenuAction>)}
      {children}
  </SecondaryPopup>;
}
