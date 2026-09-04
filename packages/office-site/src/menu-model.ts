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

import { withHints } from '@barocss/office-controls';
import { SITE_KEYS } from './keymap';
import { BREAKPOINTS, type SiteWidth } from './breakpoints';
import { SITE_TOOLBAR } from './toolbar-model';
import {
  menuCommands,
  menuEntry,
  menuId,
  menusIn,
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
const DECLARED: SiteMenu[] = [
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
          { command: 'exportSite', label: '사이트 전체 내보내기' },
          /**
           * **Publishing**, which is 내보내기 *and a record that it happened*.
           *
           * Two entries rather than one, because they are two gestures: 내보내기 is *give me the
           * files*, which a reader does to look at something or to hand it to somebody, and 발행 is
           * *this is now the site*. Only the second is worth remembering, and only the second can
           * answer the question work asks — **is what is live the same as what I have?**
           */
          { command: 'publishSite', label: '발행하기' }
        ]
      },
      {
        id: 'pages',
        items: [
          { command: 'insertPage', label: '새 페이지' },
          { command: 'duplicatePage', needs: 'page', label: '페이지 복제' },
          /*
           * **A new entry of a template**, which is how a blog is used: the template draws everything
           * around the words, and the page holds only what this entry says. `insertPage` copies the
           * chrome off the page it follows, which would give an entry two headers — so it is its own
           * command rather than a flag, the same reason `duplicatePage` is not `insertPage` with an
           * argument.
           *
           * No `needs: 'page'`: what it needs is a **template**, which the rail's component list is
           * where a reader picks. The entry lands at the end of the site, like a new page.
           */
          { command: 'insertEntry', label: '템플릿으로 페이지 만들기…' },
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
        /*
         * **Anywhere**, and it is the one group in 편집 that is: a reader who deletes a page in 관리
         * wants it back the same way a reader who deletes a card does. The document's history is the
         * document's, wherever they are standing.
         */
        id: 'history',
        items: [
          { command: 'undo', label: '실행 취소' },
          { command: 'redo', label: '다시 실행' }
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
        /* Blocks, and a block is on a canvas — `pasteBlocks` and `selectAllBlocks` say so already. */
        where: 'canvas',
        items: [
          /*
           * **The block ones**, which is what this menu is for: a menubar acts on what a reader has
           * selected, and in this product that is a block far more often than it is a run of text.
           *
           * They used to be the shared kit's `cut`/`copy`/`paste` — the *text* ones — so with a card
           * held all three were greyed, correctly and uselessly: ⌘D was the only way to get a second
           * copy of anything and there was no way at all to move a block between pages. The text
           * three are still bound, by the **platform**, inside a paragraph; a builder that
           * intercepted ⌘C there would be a builder that broke copying.
           */
          { command: 'cutBlocks', label: '잘라내기' },
          { command: 'copyBlocks', label: '복사' },
          { command: 'pasteBlocks', label: '붙여넣기', needs: 'page' },
          /*
           * And this one **is** the app's, on a command written for it. It used to run the kit's
           * `selectAll`, and a browser found what that does here: with a card selected, ⌘A cleared
           * the selection. See `selectAllBlocks`.
           */
          { command: 'selectAllBlocks', label: '모두 선택', needs: 'page' },
          /*
           * And the way **out**, beside the way to everything, because they are the same question.
           *
           * The rail already tells a reader how to go in — one press for the outer block, two for
           * what is inside it. Coming back out was `Escape` in a key handler nobody declared, which
           * climbed only while the reader happened to be inside a drill and otherwise threw the
           * whole selection away. Here it is a sentence a reader can find without knowing the key,
           * which is the point of a menu.
           */
          { command: 'selectParent', label: '담고 있는 블록 선택' }
        ]
      },
      {
        id: 'blocks',
        where: 'canvas',
        items: [
          { command: 'duplicateBlocks', label: '복제' },
          { command: 'groupBlocks', label: '묶기' },
          { command: 'ungroupBlocks', label: '묶음 풀기' },
          { command: 'removeBlocks', label: '삭제' },
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
          { command: 'moveBlockDown', label: '아래로 옮기기' },
          /*
           * **The arrow keys**, which move a block that places itself by a pixel — a distance no
           * pointer can ask for. Here as well as on the keys, because a chord nobody can discover is
           * a chord only the person who wrote it knows about: this menu is where a reader finds out
           * the arrows do anything at all.
           *
           * One entry rather than eight. The four directions and the ten-pixel step are the same
           * gesture said four and two ways, and a menu with eight rows of *1px 왼쪽으로* is a menu
           * nobody reads to the end. The chord beside it says the rest.
           */
          { command: 'nudgeBlock', payload: { axis: 'x', by: -15 }, label: '놓인 블록 밀기' }
        ]
      },
      /*
       * **찾기 was here and has been taken out**, which is the honest half of a fault a browser found.
       *
       * `editor-core` registers `find` as `execute: () => true` with `canExecute: () => true` — a
       * stub. So the entry lit up, ran, and drew nothing, every time, and no check could see it: the
       * harness asks whether every command has a surface and never whether a surface has a command
       * that does anything. A menu entry that always works and never does anything is worse than a
       * missing one, because a reader stops believing the rest of the menu.
       *
       * It comes back the day this product has a find of its own. See `BACKLOG.md` — the stub itself
       * is the deck's and Word's problem too, and Word's ⌘F runs it right now.
       */
      {
        /* Made **from** a selection, so there has to be one — which means a canvas. */
        id: 'components',
        where: 'canvas',
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
    /*
     * **Canvas only.** Every entry here puts a block on a page, and in 관리 there is no page — so
     * the menu opened with twelve permanently-greyed rows over a table of pages.
     */
    where: 'canvas',
    blocks: [
      /*
       * **`needs: 'page'` on every one of them**, and without it the whole menu was dead.
       *
       * Measured on a freshly opened site with nothing selected: twelve entries in 삽입, **twelve
       * greyed**. An insert lands *after what is selected*, and with nothing selected it lands at the
       * end of the page a reader is looking at — which the model has no notion of and should not grow
       * one, so the app says it. The rail's 추가 has been passing it since the day it was written;
       * this menu was not, so from a fresh document every entry refused.
       *
       * The same fault `duplicatePage` and `removePage` had, in the same file, for the same reason —
       * *an entry that can never be enabled is worse than one that is not there* — and it recurred
       * because these are derived from the toolbar, where the app supplies the page a different way.
       */
      {
        id: 'containers',
        items: SITE_TOOLBAR.filter((one) => one.group === 'insert' && one.puts === 'container').map(
          (one) => ({ command: one.command, label: one.makes ?? one.label, needs: 'page' })
        )
      },
      {
        id: 'blocks',
        items: SITE_TOOLBAR.filter((one) => one.group === 'insert' && one.puts === 'block').map(
          (one) => ({ command: one.command, label: one.makes ?? one.label, needs: 'page' })
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
  /**
   * **표** — the one menu whose entries are not attributes and never could be.
   *
   * A row goes above or below *this cell*; a panel row writes a value and there is no value here to
   * write. Every word processor puts these in a menu for the same reason, and this product already
   * decided where a command that is not a property lives when the ribbon's 정렬 group was made.
   *
   * **No `needs`** on any of them, and that is the field saying what it is for: `needs` is what the
   * *app* has to supply because the model cannot know it — which page is open. A table command asks
   * the editor's own selection for the cell the caret is in, so there is nothing to hand it.
   *
   * With the caret anywhere but in a table all eight grey, which is the extension's `canExecute`
   * doing its job. Greying rather than hiding: a menu that appears and disappears is one a reader
   * cannot learn the shape of, and that is the complaint every tool that hides them gets.
   */
  {
    id: 'table',
    label: '표',
    /* Same, and more obviously so: these act on the cell a caret is in. */
    where: 'canvas',
    blocks: [
      {
        id: 'rows',
        items: [
          { command: 'insertRowAbove', label: '위에 행 넣기' },
          { command: 'insertRowBelow', label: '아래에 행 넣기' },
          { command: 'deleteRow', label: '행 지우기' }
        ]
      },
      {
        id: 'columns',
        items: [
          { command: 'insertColumnLeft', label: '왼쪽에 열 넣기' },
          { command: 'insertColumnRight', label: '오른쪽에 열 넣기' },
          { command: 'deleteColumn', label: '열 지우기' }
        ]
      },
      {
        id: 'cells',
        items: [
          { command: 'mergeCells', label: '셀 합치기' },
          /*
           * And the one of the eight that asks more than a cell: `splitCell` refuses a cell that is
           * not merged, because there is nothing to split. It greys where the other seven do not,
           * which is the extension's own guard doing its job rather than this menu knowing about it.
           */
          { command: 'splitCell', label: '셀 나누기' }
        ]
      }
    ]
  },
  {
    id: 'view',
    label: '보기',
    /*
     * **How the reader is looking at a canvas** — which boards, how far away, and whether they are
     * previewing. A management screen has none of those: no boards, no zoom, and nothing to preview
     * until a page is opened.
     */
    where: 'canvas',
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
          /*
           * **Built from the document's widths**, which is what `siteMenusFor` is for: the three were
           * written out here, so a site with a fourth had a board nothing could turn off and a menu
           * that lied about what it was showing. `SITE_MENUS` is this list with the default three in
           * it, which is what every caller that has no document gets.
           */
          ...BREAKPOINTS.map((one) => ({ view: `frames.${one.id}`, label: one.label }))
        ]
      },
      {
        id: 'frameSets',
        items: [{ view: 'frames.all', label: '폭 모두 보기' }]
      },
      {
        /*
         * How far away the reader is standing. On the toolbar's right today as a `ZoomControl`, which
         * is right for a *pointer* — a reader who wants 120% drags — and useless for a reader who
         * wants 100% exactly, or who is on a keyboard. Both, the way every tool of this kind does.
         */
        id: 'zoom',
        items: [
          { view: 'zoom.in', label: '확대' },
          { view: 'zoom.out', label: '축소' },
          { view: 'zoom.reset', label: '실제 크기' },
          { view: 'zoom.fit', label: '화면에 맞춤' }
        ]
      },
      {
        id: 'preview',
        items: [
          { view: 'preview', label: '미리보기', hint: 'Esc로 나가기' },
          /*
           * **와이어프레임**, which is a `view` for the same reason 미리보기 is: it changes how the
           * reader is looking rather than what their site says, so it is not a command and there is
           * nothing in the document to undo.
           *
           * Asked as a choice between a filter and a separate editor, and it is neither — a separate
           * editor would be a second document to keep in step, which is the work that makes a plan
           * and a design drift apart. See `wireframe.ts` for the whole argument and for the three
           * things a browser had to settle.
           */
          { view: 'wireframe', label: '와이어프레임' },
          /**
           * **글 고치기**, which is a view for the same reason the other two are: it changes what the
           * reader may do rather than what the site says, and there is nothing in the document to
           * undo.
           *
           * A mode and **not a permission**, which is worth being precise about: there are no accounts
           * here, so *this person may only write* cannot be enforced and must not be claimed. What a
           * reader gets is a mode they chose — and most of the damage a writer does to a layout is
           * done by accident, so a mode stops all of it. See `writing.ts`.
           */
          { view: 'writing', label: '글 고치기' }
        ]
      }
    ]
  }
];

/**
 * …and the same menus with each entry's **chord filled in from the key map**.
 *
 * The hints used to be typed above, beside the labels, and a browser found what that costs: eleven
 * of the fourteen printed chords were keys this product did not answer. A hint is the product
 * promising the reader can stop opening the menu, and a promise restated in a second place is a
 * promise that stops being kept.
 *
 * An entry with no binding gets nothing rather than a guess, which is the honest way for a menu to
 * describe a key that does not work — and a typed `hint` still wins, for the one entry that is a
 * note rather than a chord (미리보기's *Esc로 나가기*).
 */
export const SITE_MENUS: SiteMenu[] = withHints(DECLARED, SITE_KEYS);

/**
 * **What a press of the right button offers**, which is the gesture every builder has and this had
 * none of.
 *
 * Declared here rather than written into the board's JSX, for the reason this file exists: a menu
 * written in a component is a menu no check can read, and `every-command-can-be-reached` asks the
 * *product* what a reader can run. Every command below is already on the menubar — this is the same
 * list, cut down to what somebody who has just pressed on a block actually wants, in the order they
 * want it.
 *
 * **Nothing new.** A context menu that offered a command the menubar did not would be a second place
 * to keep the truth about what this product does; one that offered *everything* would be the menubar
 * again, drawn over the page, which is what makes most of them useless.
 *
 * The blocks are the four things a reader does to a block they are pointing at: take it somewhere,
 * make another, change what it is, get rid of it. `needs` and each command's own guard decide what is
 * greyed — the same answer the menubar gets, from the same place.
 */
export const SITE_CONTEXT: SiteMenuBlock[] = [
  {
    id: 'clipboard',
    items: [
      { command: 'cutBlocks', label: '잘라내기' },
      { command: 'copyBlocks', label: '복사' },
      { command: 'pasteBlocks', label: '붙여넣기', needs: 'page' },
      { command: 'duplicateBlocks', label: '복제' }
    ]
  },
  {
    id: 'order',
    items: [
      { command: 'moveBlockUp', label: '위로 옮기기' },
      { command: 'moveBlockDown', label: '아래로 옮기기' }
    ]
  },
  {
    id: 'become',
    items: [
      /*
       * **묶기 first**, above 컴포넌트로 만들기, because it is the lighter of the two and the one a
       * reader reaches for far more often: a group is a frame that keeps these blocks together on
       * this page, a component is a shape reused across pages. Offering the heavier one first is how
       * a builder ends up with twelve one-off components.
       */
      { command: 'groupBlocks', label: '묶기' },
      { command: 'ungroupBlocks', label: '묶음 풀기' },
      { command: 'createComponentFrom', label: '컴포넌트로 만들기' },
      { command: 'detachComponent', label: '컴포넌트 해제' },
      { command: 'selectParent', label: '담고 있는 블록 선택' }
    ]
  },
  {
    id: 'remove',
    items: [{ command: 'removeBlocks', label: '삭제' }]
  }
];

/** Every command the menubar can run — the harness's question, answered by the model. */
export function siteMenuCommands(menus: SiteMenu[] = SITE_MENUS): string[] {
  return menuCommands(menus);
}

/** One entry, by the id the menubar hands back. */
/**
 * The menubar for a document that declares its **own** widths.
 *
 * One block of it is a fact about the document rather than about the product — one entry per board —
 * so the whole bar is a function of the list, and `SITE_MENUS` is this called with the default three.
 * The app passes the document's, so a width a reader adds arrives with its own entry rather than
 * needing one written here.
 *
 * Everything else is identical, and deliberately so: a menubar that reshuffled itself as a document
 * changed would be a menubar nobody could learn.
 */
/**
 * **어디에 서 있느냐** — the two places this product has.
 *
 * `관리` is a list of pages, datasets, components, publishes and files, with no canvas anywhere in
 * it; `편집` is a page with blocks on it. Half the menubar means nothing on the first, and greying
 * it is not the answer — a bar whose middle three are permanently grey has stopped saying anything.
 */
export type SitePlace = 'admin' | 'page';

/**
 * The menubar for a place, and for a document's own widths.
 *
 * The two questions are asked together because they are asked together: the app knows both, and a
 * bar assembled from one and then filtered by the other is a bar built in two places.
 */
export function siteMenusIn(place: SitePlace, widths: SiteWidth[] = BREAKPOINTS): SiteMenu[] {
  return menusIn(siteMenusFor(widths), place === 'page' ? 'canvas' : 'anywhere');
}

export function siteMenusFor(widths: SiteWidth[] = BREAKPOINTS): SiteMenu[] {
  return SITE_MENUS.map((menu) =>
    menu.label !== '보기'
      ? menu
      : {
          ...menu,
          blocks: menu.blocks.map((block) =>
            block.id !== 'frames'
              ? block
              : {
                  ...block,
                  items: widths.map((one) => ({ view: `frames.${one.id}`, label: one.label }))
                }
          )
        }
  );
}

export function siteMenuEntry(id: string, menus: SiteMenu[] = SITE_MENUS): SiteMenuEntry | undefined {
  return menuEntry(menus, id);
}

/** And the id an entry is drawn with, so the app and the model agree on one name. */
export function siteMenuId(menu: SiteMenu, block: SiteMenuBlock, index: number): string {
  return menuId(menu, block, index);
}
