import type { Editor } from '@barocss/editor-core';
import { MenuAction } from '@barocss/office-ui';
import { NOTE_CONVERSIONS } from './block-actions';

export function NoteBlockActions({ editor, sid, onDismiss }: { editor: Editor; sid: string; onDismiss: () => void }) {
  const run = (command: string, kind?: string) => { void editor.executeCommand(command, { nodeId: sid, kind }); onDismiss(); };
  return <>
    {NOTE_CONVERSIONS.some(item => editor.canExecuteCommand('convertNoteBlock', { nodeId: sid, kind: item.kind })) &&
      <fieldset className="border-0 p-0 m-0"><legend className="px-3 py-1 text-xs opacity-60">블록 변환</legend>
        {NOTE_CONVERSIONS.map(item => <MenuAction key={item.kind} data-note-convert={item.kind}
          disabled={!editor.canExecuteCommand('convertNoteBlock', { nodeId: sid, kind: item.kind })}
          onClick={() => run('convertNoteBlock', item.kind)}>{item.label}</MenuAction>)}
      </fieldset>}
    {[
      ['duplicateNoteBlock', '복제'], ['indentNoteBlock', '들여쓰기'], ['outdentNoteBlock', '내어쓰기']
    ].map(([command, label]) => <MenuAction key={command} data-note-block-action={command}
      disabled={!editor.canExecuteCommand(command, { nodeId: sid })} onClick={() => run(command)}>{label}</MenuAction>)}
  </>;
}
