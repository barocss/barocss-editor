import type { Keybinding } from '@barocss/editor-core';
import type { KeyModel } from '@barocss/office-controls';

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
  /**
   * Word's increase and decrease indent.
   *
   * These named `indentNode`/`outdentNode`, which nest one block inside
   * another and only act on a node type the schema marks `indentable` — and
   * nothing here marks one, because a Word list is a paragraph carrying a
   * numbering level rather than a nested node. So Ctrl+M did nothing at all.
   *
   * `indentText` is what the ribbon's indent buttons run: half an inch of
   * `indentLeft` on a paragraph, and a numbering level on a list item, which is
   * what Word's Ctrl+M does in each case.
   */
  { key: 'Mod+m', command: 'indentText', when: 'editorFocus' },
  { key: 'Mod+Shift+m', command: 'outdentText', when: 'editorFocus' },

  /**
   * Tab means three different things, and Word decides by where the caret is.
   *
   * In a list it is a level. At the very start of a paragraph it is that
   * paragraph's first-line indent. Anywhere else in the text it is a tab
   * character — which this could not produce at all, though the schema has had a
   * `tab` node with a renderer and full tab-stop layout the whole time. Tab in
   * the middle of a sentence moved the whole paragraph half an inch instead.
   *
   * Written to exclude each other rather than to be tried in order: within one
   * source the registry runs the binding registered *last*, so an order these
   * relied on would be an order a later edit could silently change — including
   * against the table and equation bindings below, where Tab means moving to
   * the next cell or the next slot and nothing else.
   */
  { key: 'Tab', command: 'indentText', when: 'editorFocus && inList && !inTable && !inEquation' },
  { key: 'Shift+Tab', command: 'outdentText', when: 'editorFocus && inList && !inTable && !inEquation' },
  { key: 'Tab', command: 'indentFirstLine', when: 'editorFocus && !inList && atBlockStart && !inTable && !inEquation' },
  { key: 'Shift+Tab', command: 'outdentFirstLine', when: 'editorFocus && !inList && atBlockStart && !inTable && !inEquation' },
  { key: 'Tab', command: 'insertTab', when: 'editorFocus && !inList && !atBlockStart && !inTable && !inEquation' },

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
  // Scoped hard: only when the text just before the caret is an equation
  // waiting to be built. A Space bound any wider is a Space that never reaches
  // the document, because the dispatcher prevents the key whether the command
  // ran or not.
  { key: 'Space', command: 'buildUpMath', when: 'editorFocus && canBuildUpMath' },
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
  /**
   * Delete takes the table away — but only when the *table* is what is selected.
   *
   * `tableSelected` and not `inTable`: with a caret in a cell these keys delete a
   * character, and binding them on "somewhere in a table" would make Backspace
   * the most destructive key in the product. The handle at a table's corner is
   * the only way to get into this state, which is what makes the binding safe to
   * have at all.
   */
  { key: 'Delete', command: 'deleteTable', when: 'editorFocus && tableSelected' },
  { key: 'Backspace', command: 'deleteTable', when: 'editorFocus && tableSelected' },

  // ── What is on a drawing ───────────────────────────────────────────────────
  /**
   * The same rule the table above follows, for the same reason: `shapesSelected`, not "there is a
   * drawing in this document". With a caret in a paragraph, Delete is a character — and a binding
   * that forgot the difference would be the most destructive key in the product.
   */
  { key: 'Delete', command: 'deleteShapes', when: 'editorFocus && shapesSelected' },
  { key: 'Backspace', command: 'deleteShapes', when: 'editorFocus && shapesSelected' },
  /**
   * Getting back to writing, which measured as **nothing at all**: with a shape selected, a letter
   * went nowhere and Enter did nothing. Safe, because the engine refuses a character that has no
   * caret to go to — and dead, because Enter means *give me a line* everywhere else in a document.
   *
   * Enter makes one after the drawing and puts the caret in it; Escape only moves the caret, because
   * a reader who has finished with a drawing does not want an empty paragraph to delete afterwards.
   */
  { key: 'Enter', command: 'insertParagraphAfterDrawing', when: 'editorFocus && shapesSelected' },
  { key: 'Escape', command: 'leaveDrawing', when: 'editorFocus && shapesSelected' },
  /**
   * A nudge is one pixel, or a tenth of an inch with Shift held — the deck's own steps, because a
   * reader who has learned one has learned the other.
   *
   * Written out rather than one binding that reads the Shift key, which is the lesson the deck's
   * key map records: a chord that matched with or without a modifier made `Shift+ArrowRight` match
   * *nothing*, and a coarse nudge silently did not happen.
   *
   * **`Up`, not `ArrowUp`.** The engine normalises an arrow's name before it looks a binding up
   * (`getKeyString`), so a map written the way the browser spells it matches nothing at all — which
   * is what the first version of these four did, silently, while the caret moved instead. The deck
   * spells them `ArrowUp` because it matches its own chords rather than going through the registry.
   */
  { key: 'Left', command: 'moveShapes', args: { dx: -15, dy: 0 }, when: 'editorFocus && shapesSelected' },
  { key: 'Right', command: 'moveShapes', args: { dx: 15, dy: 0 }, when: 'editorFocus && shapesSelected' },
  { key: 'Up', command: 'moveShapes', args: { dx: 0, dy: -15 }, when: 'editorFocus && shapesSelected' },
  { key: 'Down', command: 'moveShapes', args: { dx: 0, dy: 15 }, when: 'editorFocus && shapesSelected' },
  { key: 'Shift+Left', command: 'moveShapes', args: { dx: -144, dy: 0 }, when: 'editorFocus && shapesSelected' },
  { key: 'Shift+Right', command: 'moveShapes', args: { dx: 144, dy: 0 }, when: 'editorFocus && shapesSelected' },
  { key: 'Shift+Up', command: 'moveShapes', args: { dx: 0, dy: -144 }, when: 'editorFocus && shapesSelected' },
  { key: 'Shift+Down', command: 'moveShapes', args: { dx: 0, dy: 144 }, when: 'editorFocus && shapesSelected' },

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
  //
  // `Mod+f` was here, bound to `find`, and it ran nothing while Word's *menu* opened a real pane
  // through `view: 'find'`: one label, two behaviours, and the keyboard was the one that did
  // nothing. It is a view binding now, below, where the thing it opens actually lives.
  //
  // **The reason written here was wrong**, and the correction is worth more than the fix was:
  // `editor-core` registers no `find`, and `FindReplaceExtension` has been complete since the day it
  // was written. What was true is that **nothing installed it** — not this kit, not the deck's, not
  // the site's — which from a keyboard looks exactly like reaching a stub. Word has its own pane and
  // does not need the extension; the note mattered because the site deleted its 찾기 entry over it.
  { key: 'Mod+h', command: 'replace', when: 'editorFocus' }
];

/**
 * …and the keys that change **how the reader is looking** rather than the document.
 *
 * A second list because the engine's registry can only run **commands**, and none of these is one: a
 * zoom, a find pane and an outline are the app's, and a command for any of them would be telling the
 * harness something exists which does not. The menu model has said so with `view:` since it was
 * written; the key map had no way to.
 *
 * Which is exactly what a browser measured: ⌘+, ⌘- and ⌘0 were printed in 보기 beside their labels
 * and **none of the three did anything**, while pressing the entries worked. The chords were typed
 * beside the labels rather than read from a binding, so nothing could tell that no binding existed.
 *
 * ⌘P is not here on purpose. Printing is the **browser's** — the app hooks `beforeprint` so a
 * document laid out in pages comes out whichever way it was asked for — so the menu prints that one
 * chord itself, marked, and Word's test holds the marking to a written list.
 */
export const WORD_VIEW_KEYS: KeyModel[] = [{ key: 'Mod+f', view: 'find', label: '찾기' }];

/*
 * ## And the zoom is deliberately **not** bound, which the check is what settled
 *
 * The menu printed ⌘+, ⌘- and ⌘0 and nothing answered them, so the first repair was to bind them —
 * and `keyFaults` reported `Mod+=` bound twice. It is bound to **subscript**, twenty lines up, which
 * is Word's own shortcut and has been since long before this: `Ctrl+=` is subscript and
 * `Ctrl+Shift+=` is superscript in every version of it.
 *
 * So the invented chord was the wrong half of the pair, not the missing binding. Word has no keyboard
 * zoom — its zoom is a slider in the status bar and three entries in 보기 — and binding two thirds of
 * a zoom (⌘- and ⌘0, leaving ⌘+ to subscript) would be worse than none: a reader who can zoom out and
 * not in has found a bug rather than a shortcut.
 *
 * The menu prints nothing beside those three now, which is what an entry with no binding should say.
 */

/**
 * Everything Word binds, for the one question a menu asks of a key map: *is this chord real?*
 *
 * Both lists, because a reader does not care which layer answers a press. `WORD_KEYBINDINGS` is the
 * engine's — resolved against a caret, gated on `editorFocus` — and `WORD_VIEW_KEYS` is the app's.
 */
export const WORD_KEYS: KeyModel[] = [...WORD_VIEW_KEYS, ...WORD_KEYBINDINGS];
