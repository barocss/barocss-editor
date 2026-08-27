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
  menuCommands,
  menuEntry,
  menuId,
  type MenuBlockModel,
  type MenuEntryModel,
  type MenuModel
} from '@barocss/office-controls';

export type WordMenuEntry = MenuEntryModel;
export type WordMenuBlock = MenuBlockModel;
export type WordMenu = MenuModel;

/**
 * The menus, in the order a reader meets them.
 *
 * 파일 first, because that is where it is in every application a reader has used, and a reader
 * looking for *how do I print this* looks there before they look anywhere else.
 */
export const WORD_MENUS: WordMenu[] = [
  {
    id: 'file',
    label: '파일',
    blocks: [
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
          { command: 'historyUndo', label: '실행 취소', hint: '⌘Z' },
          { command: 'historyRedo', label: '다시 실행', hint: '⇧⌘Z' }
        ]
      },
      {
        /*
         * Keyboard-only until now: bound to a chord, on no button and in no menu, so a reader who
         * did not already know the chord could not find it. Which is the failure a menubar exists to
         * prevent — a shortcut is a *second* way to reach something, never the only one.
         */
        id: 'find',
        items: [{ view: 'find', label: '찾기', hint: '⌘F' }]
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
          { view: 'zoom.in', label: '확대', hint: '⌘+' },
          { view: 'zoom.out', label: '축소', hint: '⌘-' },
          { view: 'zoom.reset', label: '실제 크기', hint: '⌘0' }
        ]
      }
    ]
  }
];

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
