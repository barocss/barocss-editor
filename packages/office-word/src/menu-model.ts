/**
 * What Word's **menubar** offers, as data.
 *
 * ## The division, and why Word needs it most of the three
 *
 * Counted on 2026-08-27: Word draws **71 toolbar controls in one flat strip**, two rows deep, with no
 * group labels and no tabs — and **72 keyboard shortcuts** whose only home was a tooltip, which
 * teaches a shortcut to the reader who has already found the button.
 *
 * A **menubar** holds what acts on the *document and the application*: print, find, which panes are
 * open, how far the reader is zoomed. Things done occasionally, which need to be **found**. A
 * **toolbar** holds what acts on the *selection* — bold, a list, a border — done constantly, which
 * need to be **reached**. One strip cannot be both, and 71 controls is what happens when it tries.
 *
 * ## What this file made reachable
 *
 * `window.wordPrintPages`. Printing a document is the oldest item in the oldest menu in the oldest
 * kind of application there is, and here it was a `beforeprint` hook and an object on `window` —
 * parked there for want of anywhere to put it. The site builder's export was in exactly the same
 * position and for the same reason, which is what makes it a pattern rather than an oversight.
 *
 * 찾기 was keyboard-only: bound to a chord, in no menu and on no button, so a reader who did not
 * already know the chord could not find it at all.
 */
import {
  taughtKeys,
  menuCommands,
  menuEntry,
  menuId,
  type MenuBlockModel,
  type MenuEntryModel,
  type MenuModel,
  withHints
} from '@barocss/office-controls';
import { WORD_KEYS } from './word-keymap';

export type WordMenuEntry = MenuEntryModel;
export type WordMenuBlock = MenuBlockModel;
export type WordMenu = MenuModel;

/**
 * The menus, in the order a reader meets them.
 *
 * 파일 first, because that is where it is in every application a reader has used, and a reader
 * looking for *how do I print this* looks there before they look anywhere else.
 */
const DECLARED: WordMenu[] = [
  {
    id: 'file',
    label: '파일',
    blocks: [
      /**
       * **새로 만들기 · 열기 · 저장** — 이 메뉴가 인쇄 하나뿐이던 자리.
       *
       * Word 는 오늘까지 문서를 지킬 수 없었다. 앱이 부팅에 샘플을 싣고, 독자가 쓴 것은
       * 새로고침에 사라졌고, 갖고 있는 파일을 열 방법이 없었다. 덱은 셋 다 할 수 있었다 —
       * 덱이 그 전부를 혼자 만들었기 때문이다.
       *
       * 셋 다 **`view`** 이지 명령이 아니다. 파일을 고르는 것도, 브라우저에게 내려받기를
       * 시키는 것도, 문서를 통째로 바꾸는 것도 문서가 할 줄 아는 일이 아니다 — 인쇄가 그런
       * 것과 같은 이유다.
       */
      {
        id: 'document',
        items: [
          { view: 'file.new', label: '새 문서' },
          { view: 'file.open', label: '열기…' },
          { view: 'file.save', label: '저장' }
        ]
      },
      {
        /*
         * A **view** rather than a command, and that is the honest shape: printing is the browser's,
         * hooked at `beforeprint` so that ⌘P and a print asked for programmatically both get a
         * document laid out in pages. What the app does for this entry is call `window.print()`,
         * which is not something the document knows how to do.
         */
        id: 'print',
        items: [{ view: 'print', label: '인쇄', hint: '⌘P' }]
      }
    ]
  },
  {
    id: 'edit',
    label: '편집',
    blocks: [
      {
        id: 'history',
        items: [
          { command: 'historyUndo', label: '실행 취소' },
          { command: 'historyRedo', label: '다시 실행' }
        ]
      },
      {
        /*
         * Keyboard-only until now: bound to a chord, on no button and in no menu, so a reader who
         * did not already know the chord could not find it. Which is the failure a menubar exists to
         * prevent — a shortcut is a *second* way to reach something, never the only one.
         */
        id: 'find',
        items: [{ view: 'find', label: '찾기' }]
      }
    ]
  },
  {
    /**
     * **서식** — 메뉴바에 없던 메뉴.
     *
     * 파일·편집·보기 셋뿐이었다. 리본이 글꼴과 문단 정렬을 답하고 있었으므로 오랫동안 그것으로
     * 되었지만, **대화상자를 여는 것은 리본이 하기 어려운 일**이다: 리본의 컨트롤은 한 번의
     * 누름이 곧 한 번의 변경인 것들이고, 테두리는 네 변과 모양과 두께와 색을 함께 정한 뒤에야
     * 한 번 바뀐다.
     *
     * 그래서 `view` 다. 대화상자를 여는 것은 문서가 할 줄 아는 일이 아니다 — 인쇄와 같다.
     */
    id: 'format',
    label: '서식',
    blocks: [
      {
        id: 'paragraph',
        items: [
          { view: 'dialog.spacing', label: '문단 간격…' },
          { view: 'dialog.borders', label: '테두리 및 음영…' }
        ]
      },
      {
        /*
         * **자기 묶음이다.** 앞의 둘은 문단에 쓰고 이것은 **구역**에 쓴다 — 커서가 어느 문단에
         * 있든 바뀌는 것은 그 문단이 든 페이지 전체다. 메뉴에서 줄 하나 띄우는 것이 그 차이를
         * 말하는 가장 싼 방법이고, Word 도 그렇게 나눈다.
         */
        id: 'page',
        items: [{ view: 'dialog.page', label: '페이지 설정…' }]
      }
    ]
  },
  {
    id: 'view',
    label: '보기',
    blocks: [
      {
        /*
         * Which panes are open. The app's, not the document's — whether a reader has the outline
         * showing is not a fact about what they wrote, and a command for it would be telling the
         * harness something exists that does not.
         */
        id: 'panes',
        items: [
          { view: 'outline', label: '개요' },
          { view: 'comments', label: '댓글' }
        ]
      },
      {
        id: 'zoom',
        items: [
          { view: 'zoom.in', label: '확대' },
          { view: 'zoom.out', label: '축소' },
          { view: 'zoom.reset', label: '실제 크기' }
        ]
      }
    ]
  }
];

/**
 * …and the same menus with each entry's **chord filled in from what Word binds**.
 *
 * Both lists — the engine's `WORD_KEYBINDINGS` and the app's `WORD_VIEW_KEYS` — because a reader does
 * not care which layer answers a press. What they do care about is that the chord printed beside a
 * label is one the product answers, and a browser found three that were not: ⌘+, ⌘- and ⌘0 were all
 * taught in 보기 and none of them did anything.
 *
 * ⌘P stays typed above, and it is the only one: printing is the browser's, so that chord is a fact
 * about the platform rather than a binding Word could derive.
 *
 * **In which alphabet is the caller's to say, and that is why this takes an argument.**
 *
 * It used to be a `const` that called `withHints(DECLARED, taughtKeys(WORD_KEYS))`, and `withHints`
 * defaulted `apple` to `true`. So every menubar in all three products printed `⌘` on every platform —
 * and `apps/site` printed the *toolbar* right and the *menubar* wrong on the same screen, because the
 * ribbon asks `onApple()` and the menubar read this constant. Being a `const` made it worse than a
 * wrong default: the platform was decided once, at import.
 *
 * The toolbar already had the shape this now follows — `controlRows(editor, TOOLBAR, { keys, apple })`.
 * The model declares what the menus offer; the **surface** writes the chord in the reader's alphabet.
 */
export function wordMenus(apple: boolean): WordMenu[] {
  return withHints(DECLARED, taughtKeys(WORD_KEYS), apple);
}

/**
 * The menus with no chords written on them.
 *
 * What the model can state without knowing who is reading. Everything that asks *what does this
 * menubar offer* — the command sweep, the spec numbers, the harness — wants this one.
 */
export const WORD_MENUS: WordMenu[] = DECLARED;

/** Every command the menubar can run — the harness's question, answered by the model. */
export function wordMenuCommands(menus: WordMenu[] = WORD_MENUS): string[] {
  return menuCommands(menus);
}

/** One entry, by the id the menubar hands back. */
export function wordMenuEntry(id: string, menus: WordMenu[] = WORD_MENUS): WordMenuEntry | undefined {
  return menuEntry(menus, id);
}

/** And the id an entry is drawn with, so the app and the model agree on one name. */
export function wordMenuId(menu: WordMenu, block: WordMenuBlock, index: number): string {
  return menuId(menu, block, index);
}
