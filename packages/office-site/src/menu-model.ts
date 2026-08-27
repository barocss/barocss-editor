/**
 * What the site builder's **menubar** offers, as data.
 *
 * ## Why this is a model and not JSX
 *
 * The same reason `toolbar-model.ts` and `panel-model.ts` are, and this backlog has paid for the
 * lesson twice: *a surface that declares nothing is a surface the harness cannot see*. The menubar
 * is the **fourth** place a reader can reach a command — after the toolbar, the keyboard and the
 * panel — and it arrived carrying the one gesture this product is for.
 *
 * That gesture is the argument for the whole file. `exportSite` rendered every page of a document
 * for weeks and was reachable from `window.exportSite`, put there for the console and for tests, and
 * from **no control in the product**. `every-command-can-be-reached` counts commands and it was a
 * function, so nothing asked. It is a command now, and this is where a reader runs it.
 *
 * ## What belongs here rather than on the toolbar
 *
 * A menubar holds what acts on the **document and the application**; a toolbar holds what acts on
 * the **selection**. The division is not a convention to follow, it is the reason a toolbar stays
 * short: things a reader does occasionally need to be *findable*, and things they do constantly need
 * to be *reachable*, and one strip cannot be both without becoming the wall of glyphs Word's is.
 *
 * So: 파일 publishes and makes pages; 편집 is the document's history and the selection's fate; 보기 is
 * how the reader is looking rather than what they are looking at. Nothing here changes what a block
 * *is* — that is the panel's, and the toolbar's.
 */

import { SITE_TOOLBAR } from './toolbar-model';
import {
  menuCommands,
  menuEntry,
  menuId,
  type MenuBlockModel,
  type MenuEntryModel,
  type MenuModel
} from '@barocss/office-controls';

/**
 * A site's menus are `office-controls`' shape exactly.
 *
 * Three products each declaring their own `MenuEntry` interface is the fault this repository keeps
 * finding — *which* commands a product puts in 파일 is a fact about that product, and what a menu
 * entry **is** is the same everywhere.
 */
export type SiteMenuEntry = MenuEntryModel;
export type SiteMenuBlock = MenuBlockModel;
export type SiteMenu = MenuModel;

/**
 * The menus, in the order a reader meets them.
 *
 * Order is meaning here the way it is in `SITE_TOOLBAR`: 파일 first because that is where every
 * application's file menu is, and a reader looking for *how do I publish this* looks there before
 * they look anywhere else.
 */
export const SITE_MENUS: SiteMenu[] = [
  {
    id: 'file',
    label: '파일',
    blocks: [
      {
        id: 'publish',
        items: [
          /*
           * The page first, because it is the gesture a reader makes far more often — they are
           * looking at one page and they want *that*. Two commands rather than one with a flag: a
           * keyboard can bind to one of them, and the harness can ask about each.
           */
          { command: 'exportPage', needs: 'page', label: '이 페이지 내보내기' },
          { command: 'exportSite', label: '사이트 전체 내보내기' }
        ]
      },
      {
        id: 'pages',
        items: [
          { command: 'insertPage', label: '새 페이지' },
          { command: 'duplicatePage', needs: 'page', label: '페이지 복제' },
          { command: 'removePage', needs: 'page', label: '페이지 삭제' }
        ]
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
          { command: 'undo', label: '실행 취소', hint: '⌘Z' },
          { command: 'redo', label: '다시 실행', hint: '⇧⌘Z' }
        ]
      },
      {
        /*
         * The four every application has had since before menus were called menus, and this product
         * had **none of them anywhere a reader could see**: `cut`, `copy`, `paste` and `selectAll`
         * are all registered and all keyboard-only. A shortcut is a second way to reach something,
         * and a reader on a laptop they borrowed has no first way.
         */
        id: 'clipboard',
        items: [
          { command: 'cut', label: '잘라내기', hint: '⌘X' },
          { command: 'copy', label: '복사', hint: '⌘C' },
          { command: 'paste', label: '붙여넣기', hint: '⌘V' },
          { command: 'selectAll', label: '모두 선택', hint: '⌘A' }
        ]
      },
      {
        id: 'blocks',
        items: [
          { command: 'duplicateBlocks', label: '복제', hint: '⌘D' },
          { command: 'removeBlocks', label: '삭제', hint: 'Delete' },
          /*
           * Ordering, which a page has instead of a z-order: a page stacks, so *forward* and *back*
           * mean **up** and **down**. Registered, bound to nothing, and on no control until now.
           *
           * They read the selection themselves, because they are **this product's** — the shared
           * kit's commands of the same name take a caret's range and move the block it is in, which
           * is the wrong sentence for a builder: clicking a card is how a reader *stops* being in
           * its text. Measured by pressing every entry with a card selected, where the shared pair
           * lit up, ran, and did nothing.
           */
          { command: 'moveBlockUp', label: '위로 옮기기' },
          { command: 'moveBlockDown', label: '아래로 옮기기' }
        ]
      },
      {
        id: 'find',
        items: [{ command: 'find', label: '찾기', hint: '⌘F' }]
      },
      {
        id: 'components',
        items: [
          { command: 'createComponentFrom', label: '컴포넌트로 만들기' },
          { command: 'detachComponent', label: '컴포넌트 해제' }
        ]
      }
    ]
  },

  /**
   * **삽입**, derived from the toolbar's own declaration rather than written again.
   *
   * The fifteen inserts are already declared once, in `SITE_TOOLBAR`, with their labels and the words
   * that say what each makes. A menu that listed them a second time would be the fifteenth and
   * sixteenth places this repository has found one declaration copied — and the copy is always the
   * one that stops being true.
   *
   * Two blocks, because a page is made of two kinds of thing: containers that hold, and blocks that
   * go in one. That distinction is `puts`, which the model already carries.
   */
  {
    id: 'insert',
    label: '삽입',
    blocks: [
      {
        id: 'containers',
        items: SITE_TOOLBAR.filter((one) => one.group === 'insert' && one.puts === 'container').map(
          (one) => ({ command: one.command, label: one.makes ?? one.label })
        )
      },
      {
        id: 'blocks',
        items: SITE_TOOLBAR.filter((one) => one.group === 'insert' && one.puts === 'block').map(
          (one) => ({ command: one.command, label: one.makes ?? one.label })
        )
      },
      {
        /*
         * And the two a *page* has that a document does not: a placement of a component, and a list
         * drawn once per row of a dataset. Both are on the rail, where the things they need — a
         * definition, a dataset — are listed; here they are findable by name.
         */
        id: 'data',
        items: [
          /*
           * **Views, because the choice is somewhere else.**
           *
           * These three were commands here and every one of them was greyed forever: `insertPlacement`
           * answers `canExecute` against a `componentId`, `insertDataList` against a dataset *and* a
           * definition, and `insertDataset` against neither — a menu has none of those to give, and
           * an entry that can never be enabled is worse than one that is not there. Measured by
           * pressing all 33 entries with a block selected, which is how they were found.
           *
           * So they point at the surface that can answer, which is what a menu does when the choice
           * lives elsewhere — 삽입 › 표 opens a grid picker in every word processor for the same
           * reason. The ellipsis is the convention that says so.
           */
          { view: 'rail.components', label: '컴포넌트 놓기…' },
          { view: 'rail.data', label: '데이터 목록 만들기…' }
        ]
      }
    ]
  },
  {
    id: 'view',
    label: '보기',
    blocks: [
      {
        /*
         * Which boards are on screen, and whether the reader is looking rather than building.
         *
         * **The app's, not the document's** — how many screens a reader has open is not a fact about
         * their site, which is why these carry no `command`. A menu entry that is a *view* setting is
         * the one kind that has nowhere else to live: the toolbar draws the board toggles today,
         * beside a tool mode and an object action, and that mixing is what this file exists to undo.
         *
         * Declared with a `view` id rather than a command so the harness is not told a command
         * exists that does not. What a `view` entry means is the app's to answer, once, in one
         * `switch` — the same contract `PropertySheet` has with a product's own control kinds.
         */
        id: 'frames',
        items: [
          /*
           * One entry per board, each a **setting a reader is in** rather than an action — which is
           * what the check mark says, and why they moved here off the toolbar. They were three
           * accent-bordered toggles beside 선택/텍스트, which is *one of these*, and nothing said
           * that turning all three off is allowed while turning both modes off is not.
           */
          { view: 'frames.desktop', label: '데스크톱' },
          { view: 'frames.tablet', label: '태블릿' },
          { view: 'frames.mobile', label: '모바일' }
        ]
      },
      {
        id: 'frameSets',
        items: [{ view: 'frames.all', label: '세 폭 모두 보기' }]
      },
      {
        /*
         * How far away the reader is standing. On the toolbar's right today as a `ZoomControl`, which
         * is right for a *pointer* — a reader who wants 120% drags — and useless for a reader who
         * wants 100% exactly, or who is on a keyboard. Both, the way every tool of this kind does.
         */
        id: 'zoom',
        items: [
          { view: 'zoom.in', label: '확대', hint: '⌘+' },
          { view: 'zoom.out', label: '축소', hint: '⌘-' },
          { view: 'zoom.reset', label: '실제 크기', hint: '⌘0' },
          { view: 'zoom.fit', label: '화면에 맞춤', hint: '⇧1' }
        ]
      },
      {
        id: 'preview',
        items: [{ view: 'preview', label: '미리보기', hint: 'Esc로 나가기' }]
      }
    ]
  }
];

/** Every command the menubar can run — the harness's question, answered by the model. */
export function siteMenuCommands(menus: SiteMenu[] = SITE_MENUS): string[] {
  return menuCommands(menus);
}

/** One entry, by the id the menubar hands back. */
export function siteMenuEntry(id: string, menus: SiteMenu[] = SITE_MENUS): SiteMenuEntry | undefined {
  return menuEntry(menus, id);
}

/** And the id an entry is drawn with, so the app and the model agree on one name. */
export function siteMenuId(menu: SiteMenu, block: SiteMenuBlock, index: number): string {
  return menuId(menu, block, index);
}
