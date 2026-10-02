import { useEffect, useState, type ReactNode } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { Controls } from '@barocss/office-editor-ui';
import { SecondaryPopup } from '@barocss/office-ui';
import { noteControlsIn } from './toolbar-model';

export const additionalFormattingCommands = new Set(['toggleUnderline', 'toggleStrikeThrough', 'toggleCode', 'toggleSuperscript', 'toggleSubscript', 'clearFormatting']);
export function AdditionalFormattingControl({ editor, selection, children }: { editor: Editor; selection: ModelSelection | null; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const key = JSON.stringify(selection);
  useEffect(() => setOpen(false), [key]);
  return <SecondaryPopup triggerLabel="추가 서식" label="추가 서식" open={open} onOpenChange={setOpen} variant="menu" className="min-w-36">
      <Controls editor={editor} controls={noteControlsIn('mark').filter(item => additionalFormattingCommands.has(item.command))} appearance="menu" mark="note-control" onRun={control => {
        if (selection) editor.selectionManager.setSelection(selection);
        void editor.executeCommand(control.command, control.payload); setOpen(false);
      }} />
      {children}
  </SecondaryPopup>;
}
