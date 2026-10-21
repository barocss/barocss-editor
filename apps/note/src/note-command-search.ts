import { NOTE_TOOLBAR } from '@barocss/office-note';
import type { NoteCommandTarget } from '@barocss/office-note/view';
import type { SearchCommand } from '@barocss/office-ui';
import type { MessageKey, Translator } from '@barocss/shared';

export interface NoteSearchEntry extends SearchCommand { command?: string; view?: 'find' | 'outline' | 'insertion' }
const commandLabels = {
  "historyUndo": "note.commandSearch.historyUndo",
  "historyRedo": "note.commandSearch.historyRedo",
  "toggleBold": "note.commandSearch.toggleBold",
  "toggleItalic": "note.commandSearch.toggleItalic",
  "toggleUnderline": "note.commandSearch.toggleUnderline",
  "toggleStrikeThrough": "note.commandSearch.toggleStrikeThrough",
  "toggleCode": "note.commandSearch.toggleCode",
  "toggleSuperscript": "note.commandSearch.toggleSuperscript",
  "toggleSubscript": "note.commandSearch.toggleSubscript",
  "clearFormatting": "note.commandSearch.clearFormatting",
  "insertColumns2": "note.commandSearch.insertColumns2",
  "insertColumns3": "note.commandSearch.insertColumns3",
  "insertColumns4": "note.commandSearch.insertColumns4",
  "insertHeading": "note.commandSearch.insertHeading",
  "insertBodyText": "note.commandSearch.insertBodyText",
  "insertBulletList": "note.commandSearch.insertBulletList",
  "insertNumberList": "note.commandSearch.insertNumberList",
  "insertChecklist": "note.commandSearch.insertChecklist",
  "insertDetails": "note.commandSearch.insertDetails",
  "insertCallout": "note.commandSearch.insertCallout",
  "insertQuote": "note.commandSearch.insertQuote",
  "insertCode": "note.commandSearch.insertCode",
  "insertNoteDatabase": "note.commandSearch.insertNoteDatabase",
  "insertRule": "note.commandSearch.insertRule",
  "insertPicture": "note.commandSearch.insertPicture",
  "insertVideo": "note.commandSearch.insertVideo",
  "insertEmbed": "note.commandSearch.insertEmbed",
  "insertion": "note.commandSearch.insertion"
} as const satisfies Record<string, MessageKey>;
// Value-dependent table/math insertion stays in the existing native picker.
export function noteSearchEntries(t: Translator): NoteSearchEntry[] {
  return [
    { id: 'historyUndo', command: 'historyUndo', label: t(commandLabels.historyUndo), category: t('note.commandSearch.edit') },
    { id: 'historyRedo', command: 'historyRedo', label: t(commandLabels.historyRedo), category: t('note.commandSearch.edit') },
    ...NOTE_TOOLBAR.filter(control => !['insertTableBlock', 'insertMathBlock', 'insertMathInline'].includes(control.command))
      .map(control => ({ id: control.command, command: control.command,
        label: t(commandLabels[control.command as keyof typeof commandLabels]),
        category: t(control.group === 'mark' ? 'note.commandSearch.mark' : 'note.commandSearch.block') })),
    { id: 'insertion', view: 'insertion', label: t('note.commandSearch.insertion'), category: t('note.commandSearch.insert'), keywords: t('note.commandSearch.values') },
    { id: 'find', view: 'find', label: t('note.commandSearch.find'), category: t('note.commandSearch.document') },
    { id: 'outline', view: 'outline', label: t('note.commandSearch.outline'), category: t('note.commandSearch.document') }
  ];
}
export function noteSearchCommands(target: NoteCommandTarget | undefined, t: Translator): NoteSearchEntry[] {
  return noteSearchEntries(t).map(entry => ({ ...entry, disabled: !target?.isCurrent() ||
    (entry.command ? !target.editor.isEditable || !target.editor.canExecuteCommand(entry.command) :
      entry.view === 'insertion' && !target.editor.isEditable),
    disabledReason: t('note.commandSearch.unavailable') }));
}
