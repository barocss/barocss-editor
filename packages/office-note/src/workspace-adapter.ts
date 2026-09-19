export { readNoteFile as read, noteFileText as text } from './note-file';
export { getNoteSchemaDefinition as schema } from './note-schema';
export const create = () => ({ stype: 'note', attributes: { title: '새 노트' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] });
