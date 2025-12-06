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
  {
    key: 'Mod+z',
    command: 'historyUndo',
    when: 'editorFocus && historyCanUndo'
  },
  {
    key: 'Mod+Shift+z',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo'
  },
  {
    key: 'Mod+y',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo'
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

