import type { Keybinding } from '@barocss/editor-core';
import { TABLE_CELL_KEYBINDINGS } from '@barocss/extensions';
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
  /*
   * **엔진이 이미 묶은 것은 여기서 다시 적지 않는다 — 열여섯을 걷었다.**
   *
   * `editor-core` 의 `DEFAULT_KEYBINDINGS` 가 마흔을 묶고 **모든 제품이 그것을 받는다**:
   * Enter·Backspace·화살표·⌘B/I/U·⌘⇧S·목록·들여쓰기·제목·인용·undo/redo·복사/잘라내기/붙여넣기·
   * 전체선택. 그런데 이 파일이 그 중 **열여덟을 다시 적고 있었고, 가드가 더 약했다**:
   *
   * | | 엔진 | 여기 |
   * |---|---|---|
   * | ⌘B·⌘I·⌘U·제목·목록·붙여넣기 | `editorFocus && editorEditable` | `editorFocus` |
   * | ⌘C·⌘X | `editorFocus && editorEditable && !selectionEmpty` | `editorFocus` |
   *
   * 레지스트리는 **출처로 충돌을 풀고 제품 바인딩이 이긴다.** 그러므로 다시 적는 순간 그 자리의
   * 규칙이 제품 것으로 갈리고, 여기서는 그것이 `editorEditable` 을 **떨어뜨리는** 것이었다.
   * `executeCommand` 도 `canExecute` 도 편집 가능 여부를 안 묻는다(재봤다) — 그 키들의 유일한
   * 편집 가드가 `when` 이다.
   *
   * **살아 있는 결함은 아니다:** 이 저장소의 어느 제품도 `editable: false` 를 쓰지 않는다. 읽기
   * 전용을 처음 내는 날의 결함이었다.
   *
   * 걷은 열여섯 중 둘(`Tab`/`Shift+Tab` → `indentText`/`outdentText`)은 **되돌렸다** — 아래에 그
   * 이유가 있다.
   *
   * **표에서의 `Tab`/`Shift+Tab` 은 여기서 선언하지 않는다.** 어느 도구에서나 같은 것이고, 그것을
   * 만드는 `nextCell`·`previousCell` 을 등록하는 것이 공용 `TableExtension` 이므로 그 옆에 있다.
   * 여기 두 줄로 적혀 있었고 그래서 **표를 가진 넷 중 Word 만 Tab 이 통했다** — 노트에서 표 안의
   * Tab 은 아무 일도 하지 않았다.
   *
   * 아래의 `Mod+Alt+i` 류는 Word 의 발명이므로 Word 에 남는다.
   */
  ...TABLE_CELL_KEYBINDINGS,

  // ── Headings and paragraph styles ──────────────────────────────────────────
  { key: 'Mod+Alt+4', command: 'setHeading4', when: 'editorFocus' },
  { key: 'Mod+Alt+5', command: 'setHeading5', when: 'editorFocus' },
  { key: 'Mod+Alt+6', command: 'setHeading6', when: 'editorFocus' },

  // ── Character formatting ───────────────────────────────────────────────────
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
  /*
   * **이 둘은 엔진 기본과 키도 명령도 같지만 재진술이 아니다.** 엔진은 `canIndentText` 로 묻고
   * Word 는 `inList && !inTable && !inEquation` 으로 묻는다 — 아래의 `Tab` 갈래 넷(`indentFirstLine`
   * · `insertTab` · `nextCell` · `nextMathSlot`)이 서로를 배제하도록 짜여 있고, 그 갈래의 첫 칸이
   * 이것이다. 엔진 것에 맡기면 갈래가 반쪽이 된다.
   *
   * `editorEditable` 은 **검사가 찾아서 더했다** — 엔진의 것은 걸고 이쪽은 안 걸고 있었고, 제품
   * 바인딩이 이기므로 그건 조건이 사라진다는 뜻이었다. 들여쓰기는 편집이다.
   */
  { key: 'Tab', command: 'indentText', when: 'editorFocus && editorEditable && inList && !inTable && !inEquation' },
  { key: 'Shift+Tab', command: 'outdentText', when: 'editorFocus && editorEditable && inList && !inTable && !inEquation' },

  { key: 'Tab', command: 'indentFirstLine', when: 'editorFocus && !inList && atBlockStart && !inTable && !inEquation' },
  { key: 'Shift+Tab', command: 'outdentFirstLine', when: 'editorFocus && !inList && atBlockStart && !inTable && !inEquation' },
  { key: 'Tab', command: 'insertTab', when: 'editorFocus && !inList && !atBlockStart && !inTable && !inEquation' },

  // ── Lists ──────────────────────────────────────────────────────────────────
  { key: 'Mod+Shift+l', command: 'toggleBulletList', when: 'editorFocus' },

  // ── Insertion ──────────────────────────────────────────────────────────────
  { key: 'Mod+k', command: 'toggleLink', when: 'editorFocus' },
  { key: 'Mod+Enter', command: 'insertPageBreak', when: 'editorFocus' },
  { key: 'Mod+Shift+Enter', command: 'insertColumnBreak', when: 'editorFocus' },
  /*
   * **Not bound here.** Shift+Enter arrives as a `beforeinput` of type `insertLineBreak` and the input
   * handler answers it, which is the rule this repository already settled: beforeinput writes typing.
   * The binding named a command nobody registers, so it had never fired — two mechanisms on one key,
   * with one of them a name. `insertHardBreak` (a `hardBreak` node, which is what OOXML's `<w:br/>`
   * is) is the better document and is left for the day the input handler hands the key over rather
   * than both trying: see `docs/BACKLOG.md`.
   */
  { key: 'Mod+Alt+f', command: 'insertFootnote', when: 'editorFocus' },
  { key: 'Mod+Alt+d', command: 'insertEndnote', when: 'editorFocus' },
  { key: 'Mod+Alt+m', command: 'insertComment', when: 'editorFocus' },

  // ── Tables ─────────────────────────────────────────────────────────────────
  // Tab is cell navigation only inside a table; elsewhere it indents, which is
  // why these are gated rather than registered globally.
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
  /* `replaceText`, which is the command's name. `replace` was nobody's, so ⌘H did nothing. */
  { key: 'Mod+h', command: 'replaceText', when: 'editorFocus' }
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
 * **Word 가 선언하는 것** — 크롬 키(⌘F 처럼 화면을 여는 것)와 제품 바인딩.
 *
 * **엔진이 묶은 마흔은 여기 없다** — 모든 제품이 그것을 받으므로 제품이 적을 것이 아니다(규칙 1).
 * 메뉴가 가르칠 목록은 `taughtKeys(WORD_KEYS)` 가 만든다: 이것에 엔진 것을 더한 것이다.
 *
 * 그 구분이 없던 동안 메뉴가 ⌘Z 를 가르친 것은 `WORD_KEYBINDINGS` 가 엔진 것을 **다시 적고
 * 있었기** 때문이고, 재진술 열여섯을 걷어내자 **메뉴에서 ⌘Z 가 사라졌다.** `docs/specs/keybindings.md`.
 */
export const WORD_KEYS: KeyModel[] = [...WORD_VIEW_KEYS, ...WORD_KEYBINDINGS];
