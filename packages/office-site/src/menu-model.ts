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
        id: 'blocks',
        items: [
          { command: 'duplicateBlocks', label: '복제', hint: '⌘D' },
          { command: 'removeBlocks', label: '삭제', hint: 'Delete' }
        ]
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
          { view: 'frames.desktop', label: '데스크톱만' },
          { view: 'frames.all', label: '세 폭 모두' }
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
