import { useEffect, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { Controls } from '@barocss/office-editor-ui';
import { FloatingSurface, Icon, IconButton } from '@barocss/office-ui';
import { noteControlsIn } from './toolbar-model';

export const additionalFormattingCommands = new Set(['toggleSuperscript', 'toggleSubscript', 'clearFormatting']);
export function AdditionalFormattingControl({ editor, selection }: { editor: Editor; selection: ModelSelection | null }) {
  const hold = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const key = JSON.stringify(selection);
  useEffect(() => setOpen(false), [key]);
  return <div ref={hold}>
    <IconButton label="추가 서식" pressed={open} preserveFocus onClick={() => setOpen(value => !value)}><Icon name="more" size={14} /></IconButton>
    <FloatingSurface open={open} at={hold.current?.getBoundingClientRect() ?? null} portalRoot={hold.current} variant="menu" prefer="below" align="end" aria-label="추가 서식" ownedElements={[hold]} onDismiss={() => setOpen(false)} className="min-w-36">
      <Controls editor={editor} controls={noteControlsIn('mark').filter(item => additionalFormattingCommands.has(item.command))} appearance="menu" mark="note-control" onRun={control => {
        if (selection) editor.selectionManager.setSelection(selection);
        void editor.executeCommand(control.command, control.payload); setOpen(false);
      }} />
    </FloatingSurface>
  </div>;
}
