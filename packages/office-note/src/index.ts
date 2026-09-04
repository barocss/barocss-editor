/**
 * **한 편의 글** — the schema, the kit and the editing session a body of prose needs.
 *
 * ## Why this is a package
 *
 * Because a body was a corner of the site builder, and the corner leaked. A 서식 있는 글 column's
 * value was edited by a second view over **the same editor and the same store** — which bought one
 * selection, one history and every mark command for free, and was written down as the reason it was
 * done that way.
 *
 * What it also bought was a body whose toolbar *is* the page builder's. The caret in a blog post
 * moved the ribbon behind the drawer's scrim; the undo of a paragraph and the undo of a page were
 * one stack; and the bar over the body read the page's declarations to decide what to offer.
 * Reported as *이걸 페이지 빌더랑 같이 쓰게 되면 상당히 복잡해질 것 같아* — the correct reading:
 * writing a post and arranging a page are two jobs.
 *
 * ## And what it reuses, which is nearly all of it
 *
 * Measured before a line was written. Renderers register **globally by stype**, and `office-text`
 * already draws every block a body holds. So this package declares *which* of them a body may
 * contain, and a kit to edit one with — and the nodes stay the shared vocabulary, which is why a
 * card in a site can draw a note's blocks with the site's own renderers.
 *
 * A note is a different **document**, not a different vocabulary.
 */
export {
  NOTE_BLOCKS,
  NOTE_CONTENT,
  getNoteSchemaDefinition,
  type NoteBlock
} from './note-schema';

export { createNoteEditor, createNoteExtensions, noteSlashItems } from './note-kit';
export { openNote, openNoteTree, noteTreeOf, type NoteSession } from './session';
export { createNoteElementCommands, NOTE_INSERTS } from './element-commands';
export { noteRegistry, registerNoteRenderers, registerNoteStandalone } from './renderers';
export { NOTE_PICKED, NOTE_PICKED_WRITTEN, NOTE_WRITTEN, cellAt, holdsWriting, isPicked, pickedAt } from './selection';
export { NOTE_ACTS, NOTE_FIELDS, NOTE_MOVES, actsFor, fieldsFor, fileSrc, type NoteAct, type NoteField } from './block-model';

export { NOTE_TOOLBAR, noteControlsIn, type NoteControl } from './toolbar-model';

/*
 * **The component is `@barocss/office-note/view`**, and the split is a layering fact rather than a
 * packaging preference.
 *
 * `office-site` imports this root for one thing — `NOTE_CONTENT`, so *what a body may hold* is said
 * once — and a schema has no business dragging a React view and a DOM editor in behind it. It did:
 * the site's model package pulled `editor-view-dom` into every Node process that imported it, and
 * the browser suite stopped collecting because that build is CommonJS.
 *
 * The same line `office-ui` is on the other side of.
 */

/**
 * **노트의 키맵** — 둘이고, 그 짧음이 이 제품이 무엇인지 말한다. `note-keymap.ts` 를 보라.
 */
export { NOTE_KEYBINDINGS } from './note-keymap';
