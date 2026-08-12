import type { Keybinding } from '@barocss/editor-core';

/**
 * Word's key map.
 *
 * Keys live with the product, not the engine: `Mod+Alt+1` means "Heading 1" in a
 * word processor and nothing at all on a FigJam board. The engine ships a
 * general-purpose default; a product replaces it with its own conventions.
 *
 * `when` clauses use the editor's context. `editorFocus` gates everything — a
 * shortcut must not fire while the caret is elsewhere on the page — and
 * `inTable` gates the table bindings so Tab keeps its ordinary meaning outside
 * one.
 */
export const WORD_KEYBINDINGS: Keybinding[] = [
  // ── Headings and paragraph styles ──────────────────────────────────────────
  { key: 'Mod+Alt+1', command: 'setHeading1', when: 'editorFocus' },
  { key: 'Mod+Alt+2', command: 'setHeading2', when: 'editorFocus' },
  { key: 'Mod+Alt+3', command: 'setHeading3', when: 'editorFocus' },
  { key: 'Mod+Alt+4', command: 'setHeading4', when: 'editorFocus' },
  { key: 'Mod+Alt+5', command: 'setHeading5', when: 'editorFocus' },
  { key: 'Mod+Alt+6', command: 'setHeading6', when: 'editorFocus' },
  { key: 'Mod+Alt+0', command: 'setParagraph', when: 'editorFocus' },

  // ── Character formatting ───────────────────────────────────────────────────
  { key: 'Mod+b', command: 'toggleBold', when: 'editorFocus' },
  { key: 'Mod+i', command: 'toggleItalic', when: 'editorFocus' },
  { key: 'Mod+u', command: 'toggleUnderline', when: 'editorFocus' },
  { key: 'Mod+Shift+s', command: 'toggleStrikeThrough', when: 'editorFocus' },
  { key: 'Mod+Shift+h', command: 'toggleHighlight', when: 'editorFocus' },
  { key: 'Mod+=', command: 'toggleSubscript', when: 'editorFocus' },
  { key: 'Mod+Shift+=', command: 'toggleSuperscript', when: 'editorFocus' },
  // Word's "clear formatting"
  { key: 'Mod+Space', command: 'clearFormatting', when: 'editorFocus' },

  // ── Paragraph layout ───────────────────────────────────────────────────────
  { key: 'Mod+l', command: 'alignLeft', when: 'editorFocus' },
  { key: 'Mod+e', command: 'alignCenter', when: 'editorFocus' },
  { key: 'Mod+r', command: 'alignRight', when: 'editorFocus' },
  { key: 'Mod+j', command: 'alignJustify', when: 'editorFocus' },
  { key: 'Mod+m', command: 'indentNode', when: 'editorFocus' },
  { key: 'Mod+Shift+m', command: 'outdentNode', when: 'editorFocus' },

  // ── Lists ──────────────────────────────────────────────────────────────────
  { key: 'Mod+Shift+l', command: 'toggleBulletList', when: 'editorFocus' },
  { key: 'Mod+Shift+7', command: 'toggleOrderedList', when: 'editorFocus' },

  // ── Insertion ──────────────────────────────────────────────────────────────
  { key: 'Mod+k', command: 'toggleLink', when: 'editorFocus' },
  { key: 'Mod+Enter', command: 'insertPageBreak', when: 'editorFocus' },
  { key: 'Mod+Shift+Enter', command: 'insertColumnBreak', when: 'editorFocus' },
  { key: 'Shift+Enter', command: 'insertLineBreak', when: 'editorFocus' },
  { key: 'Mod+Alt+f', command: 'insertFootnote', when: 'editorFocus' },
  { key: 'Mod+Alt+d', command: 'insertEndnote', when: 'editorFocus' },
  { key: 'Mod+Alt+m', command: 'insertComment', when: 'editorFocus' },

  // ── Tables ─────────────────────────────────────────────────────────────────
  // Tab is cell navigation only inside a table; elsewhere it indents, which is
  // why these are gated rather than registered globally.
  { key: 'Tab', command: 'nextCell', when: 'editorFocus && inTable' },
  // Scoped to equations by context, not decided inside the command. The
  // dispatcher runs the first binding that matches and prevents the key either
  // way, so a binding that matched everywhere would swallow Tab in a table.
  { key: 'Tab', command: 'nextMathSlot', when: 'editorFocus && inEquation' },
  { key: 'Shift+Tab', command: 'previousMathSlot', when: 'editorFocus && inEquation' },
  { key: 'Shift+Tab', command: 'previousCell', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+i', command: 'insertRowBelow', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+Shift+i', command: 'insertRowAbove', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+j', command: 'insertColumnRight', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+Shift+j', command: 'insertColumnLeft', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+Backspace', command: 'deleteRow', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+Shift+Backspace', command: 'deleteColumn', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+u', command: 'mergeCells', when: 'editorFocus && inTable' },
  { key: 'Mod+Alt+Shift+u', command: 'splitCell', when: 'editorFocus && inTable' },

  // ── Review ─────────────────────────────────────────────────────────────────
  { key: 'Mod+Shift+e', command: 'toggleTrackChanges', when: 'editorFocus' },

  // ── History and clipboard ──────────────────────────────────────────────────
  // Not gated on historyCanUndo: the key must always be consumed, or the browser
  // runs its own undo over DOM the editor never told it about.
  { key: 'Mod+z', command: 'historyUndo', when: 'editorFocus' },
  { key: 'Mod+Shift+z', command: 'historyRedo', when: 'editorFocus' },
  { key: 'Mod+y', command: 'historyRedo', when: 'editorFocus' },
  { key: 'Mod+c', command: 'copy', when: 'editorFocus' },
  { key: 'Mod+x', command: 'cut', when: 'editorFocus' },
  { key: 'Mod+v', command: 'paste', when: 'editorFocus' },
  { key: 'Mod+a', command: 'selectAll', when: 'editorFocus' },

  // ── Search ─────────────────────────────────────────────────────────────────
  { key: 'Mod+f', command: 'find', when: 'editorFocus' },
  { key: 'Mod+h', command: 'replace', when: 'editorFocus' }
];
