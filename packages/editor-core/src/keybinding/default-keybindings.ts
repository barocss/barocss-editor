import type { Keybinding } from '../keybinding';

/**
 * Default keyboard shortcuts for editor core
 * 
 * This list defines the default behavior of the editor,
 * and can be overridden at the user level.
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // Basic editing
  {
    key: 'Enter',
    command: 'insertParagraph',
    when: 'editorFocus && editorEditable'
    // source is automatically set to 'core' via setCurrentSource('core') in _registerDefaultKeybindings()
  },
  {
    key: 'Backspace',
    command: 'backspace',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Delete',
    command: 'deleteForward',
    when: 'editorFocus && editorEditable'
  },
  
  // Cursor movement
  {
    key: 'ArrowLeft',
    command: 'moveCursorLeft',
    when: 'editorFocus'
  },
  {
    key: 'ArrowRight',
    command: 'moveCursorRight',
    when: 'editorFocus'
  },
  {
    key: 'Shift+ArrowLeft',
    command: 'extendSelectionLeft',
    when: 'editorFocus',
    args: {}
  },
  {
    key: 'Shift+ArrowRight',
    command: 'extendSelectionRight',
    when: 'editorFocus',
    args: {}
  },
  // Word-level cursor movement (OS-specific)
  // macOS: Alt+ArrowLeft/Right, others: Ctrl+ArrowLeft/Right
  {
    key: 'Alt+ArrowLeft',
    command: 'moveCursorWordLeft',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Alt+ArrowRight',
    command: 'moveCursorWordRight',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Ctrl+ArrowLeft',
    command: 'moveCursorWordLeft',
    when: 'editorFocus && !isMac'
  },
  {
    key: 'Ctrl+ArrowRight',
    command: 'moveCursorWordRight',
    when: 'editorFocus && !isMac'
  },
  // Word-level range extension (OS-specific)
  {
    key: 'Alt+Shift+ArrowLeft',
    command: 'extendSelectionWordLeft',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Alt+Shift+ArrowRight',
    command: 'extendSelectionWordRight',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Ctrl+Shift+ArrowLeft',
    command: 'extendSelectionWordLeft',
    when: 'editorFocus && !isMac'
  },
  {
    key: 'Ctrl+Shift+ArrowRight',
    command: 'extendSelectionWordRight',
    when: 'editorFocus && !isMac'
  },
  
  // Select all
  {
    key: 'Mod+a',
    command: 'selectAll',
    when: 'editorFocus'
  },
  
  // Text style toggle
  {
    key: 'Mod+b',
    command: 'toggleBold',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+i',
    command: 'toggleItalic',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+u',
    command: 'toggleUnderline',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Shift+s',
    command: 'toggleStrikeThrough',
    when: 'editorFocus && editorEditable'
  },
  // Copy/paste/cut (integrated with CopyPasteExtension)
  {
    key: 'Mod+c',
    command: 'copy',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  {
    key: 'Mod+v',
    command: 'paste',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+x',
    command: 'cut',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  
  // Indent/outdent
  // Text indentation (used in text nodes like code blocks)
  {
    key: 'Tab',
    command: 'indentText',
    when: 'editorFocus && editorEditable && canIndentText'
  },
  {
    key: 'Shift+Tab',
    command: 'outdentText',
    when: 'editorFocus && editorEditable && canIndentText'
  },
  // Structural indentation (changes block node structure)
  {
    key: 'Tab',
    command: 'indentNode',
    when: 'editorFocus && editorEditable && canIndent'
  },
  {
    key: 'Shift+Tab',
    command: 'outdentNode',
    when: 'editorFocus && editorEditable && canIndent'
  },
  
  // History
  //
  // Deliberately NOT gated on historyCanUndo/historyCanRedo. The editor keeps its
  // own history while preventing most native edits, so the browser's undo stack
  // holds a different (and mostly empty) view of the document. If the binding
  // failed to resolve whenever our history was empty, the key would fall through
  // and the browser would run ITS undo — reverting DOM we never told it about and
  // desyncing it from the model. The key must always be consumed; the command
  // itself is a no-op when there is nothing to undo.
  {
    key: 'Mod+z',
    command: 'historyUndo',
    when: 'editorFocus'
  },
  {
    key: 'Mod+Shift+z',
    command: 'historyRedo',
    when: 'editorFocus'
  },
  {
    key: 'Mod+y',
    command: 'historyRedo',
    when: 'editorFocus'
  },
  
  // Block type conversion (Heading / Paragraph)
  {
    key: 'Mod+Alt+1',
    command: 'setHeading1',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Alt+2',
    command: 'setHeading2',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Alt+3',
    command: 'setHeading3',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Alt+0',
    command: 'setParagraph',
    when: 'editorFocus && editorEditable'
  },
  // List (bullet / ordered)
  {
    key: 'Mod+Shift+8',
    command: 'toggleBulletList',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Shift+7',
    command: 'toggleOrderedList',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+Shift+b',
    command: 'toggleBlockquote',
    when: 'editorFocus && editorEditable'
  },
  /*
   * Find & Replace **were here**, bound to two commands the editor registered as `() => true`. A
   * binding to a stub is worse than no binding: `Mod+f` resolved, `preventDefault` was called, the
   * stub ran, and the key was swallowed — so Word's own ⌘F, which opens a real find pane, stopped
   * working the moment the app stopped answering keys the engine had already claimed.
   *
   * A product with a find registers one and binds its own chord. See `editor.ts`.
   */

  // Block movement (up/down)
  {
    key: 'Alt+ArrowUp',
    command: 'moveBlockUp',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Alt+ArrowDown',
    command: 'moveBlockDown',
    when: 'editorFocus && editorEditable'
  },
  
  // Escape (clear selection or blur focus)
  {
    key: 'Escape',
    command: 'escape',
    when: 'editorFocus'
  }
];

