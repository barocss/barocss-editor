/**
 * What the deck's **menubar** offers, as data.
 *
 * ## This product had already grown one, without having one
 *
 * Counted on 2026-08-27, in the deck's title bar: 새로 만들기 · 저장 · 열기 · 라이브러리 · 템플릿 ·
 * 크기 · 레이아웃 · 검사 · 지도 · 발표 · 스크롤 상영 · 전체 보기 — **twelve application-level
 * commands as equal-weight text buttons**, because there was nowhere else for them to go. That is
 * the shape a menubar takes in a product that does not have one, and it is evidence rather than
 * opinion: the same twelve were missing entirely from the other two products.
 *
 * A row of twelve buttons is worse than a menubar in three ways a reader feels. Nothing is grouped,
 * so 저장 sits beside 지도 with no sign that one is a file operation and the other is a way of
 * looking. Nothing is prioritised, so the twelfth is as loud as the first. And it does not scale —
 * the thirteenth has to displace something, which is how a title bar becomes a toolbar.
 *
 * ## Mostly views, and that is honest
 *
 * Most of the twelve open a dialog or change what is on screen: whether the reader is presenting,
 * whether the audit pane is up, how large the slide is drawn. None of those is a fact about the
 * deck, so none of them is a command — an entry that declared one would be telling the harness
 * something exists that does not. They carry `view`, which the app answers in one `switch`.
 *
 * The ones that *are* commands are the ones that change the document: the slide operations and the
 * history.
 */
import {
  menuCommands,
  menuEntry,
  menuId,
  type MenuBlockModel,
  type MenuEntryModel,
  type MenuModel
} from '@barocss/office-controls';

export type SlidesMenuEntry = MenuEntryModel;
export type SlidesMenuBlock = MenuBlockModel;
export type SlidesMenu = MenuModel;

export const SLIDES_MENUS: SlidesMenu[] = [
  {
    id: 'file',
    label: '파일',
    blocks: [
      {
        /*
         * The three a file menu has had since there were file menus.
         *
         * **Views, not commands**, and that is the honest shape: what a *file* is — a download, a
         * blob, a handle to something on disk — is the app's question, and the document does not
         * know a file exists. Opening one is not an edit either: it replaces the document and takes
         * the history with it, so there is no undo back to what was on screen.
         */
        id: 'document',
        items: [
          { view: 'file.new', label: '새로 만들기' },
          { view: 'file.open', label: '열기…' },
          { view: 'file.save', label: '저장', hint: '⌘S' }
        ]
      },
      {
        /*
         * **Where else a deck comes from.** A library row is the deck a reader can point at from
         * inside a document; a template is the deck they start from.
         */
        id: 'library',
        items: [
          { view: 'library', label: '덱 라이브러리' },
          { view: 'template', label: '템플릿에서 시작' }
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
          { command: 'historyUndo', label: '실행 취소', hint: '⌘Z' },
          { command: 'historyRedo', label: '다시 실행', hint: '⇧⌘Z' }
        ]
      },
      {
        id: 'slides',
        items: [
          { command: 'insertSlide', label: '새 슬라이드', hint: '⌘M' },
          { command: 'duplicateSlide', needs: 'slide', label: '슬라이드 복제' },
          { command: 'deleteSlide', needs: 'slide', label: '슬라이드 삭제' }
        ]
      },
      {
        id: 'boxes',
        items: [
          { command: 'duplicateBoxes', label: '복제', hint: '⌘D' },
          { command: 'deleteBoxes', label: '삭제', hint: 'Delete' }
        ]
      }
    ]
  },
  {
    id: 'slide',
    label: '슬라이드',
    blocks: [
      {
        /*
         * How the deck itself is set up — its shape, its layouts, its colours. Dialogs, all three,
         * and they were three of the twelve buttons.
         */
        id: 'setup',
        items: [
          { view: 'dialog.size', label: '슬라이드 크기' },
          { view: 'dialog.layout', label: '레이아웃 편집' },
          { view: 'dialog.theme', label: '테마 색' }
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
         * The two panes that read a deck rather than edit it: 검사 says what is wrong with it, 지도
         * says where its jumps go. Both were buttons in the title bar beside 저장.
         */
        id: 'panes',
        items: [
          { view: 'audit', label: '검사' },
          { view: 'map', label: '지도' },
          { view: 'focus', label: '전체 보기' }
        ]
      },
      {
        id: 'present',
        items: [
          { view: 'present', label: '처음부터 발표', hint: 'F5' },
          { view: 'scroll', label: '스크롤 상영' }
        ]
      }
    ]
  }
];

/** Every command the menubar can run — the harness's question, answered by the model. */
export function slidesMenuCommands(menus: SlidesMenu[] = SLIDES_MENUS): string[] {
  return menuCommands(menus);
}

/** One entry, by the id the menubar hands back. */
export function slidesMenuEntry(id: string, menus: SlidesMenu[] = SLIDES_MENUS): SlidesMenuEntry | undefined {
  return menuEntry(menus, id);
}

/** And the id an entry is drawn with, so the app and the model agree on one name. */
export function slidesMenuId(menu: SlidesMenu, block: SlidesMenuBlock, index: number): string {
  return menuId(menu, block, index);
}
