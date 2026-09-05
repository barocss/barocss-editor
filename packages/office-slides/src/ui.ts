/**
 * **이 제품의 React 부품** — `@barocss/office-slides/ui`.
 *
 * 루트(`.`)는 **모델**이고 Node 에서도 읽혀야 한다 — 검사와 하네스가 브라우저 없이 묻는다.
 * 루트에 React 뷰를 두면 모델만 원하는 쪽이 DOM 까지 끌고 오고, 그러면 Node 가
 * *Named export 'EditorViewDOM' not found* 로 죽는다. `office-site` 에서 실제로 그랬고
 * **283개짜리 브라우저 회차가 통째로 안 돌았다.**
 *
 * 문을 조각마다가 아니라 **경계마다** 두는 이유는 `docs/specs/architecture.md` 에 있다:
 * 경계는 *React 가 필요한가* 이지 *어느 조각인가* 가 아니다.
 *
 * React 는 **peerDependency** 다 — 어느 React 를 쓸지는 호스트가 정한다.
 *
 * ## 무엇이 여기에 없나
 *
 * `app.tsx` 와 `main.tsx` — **조립과 부트스트랩**. 어느 판을 어느 순서로 세우고 무엇을 무엇에
 * 연결하는가는 앱의 일이고, 그것이 앱이 하는 유일한 일이다.
 */
/* 무대 — 덱이 그려지는 곳, 그 위의 포인터, 그리고 보여주기. */
export { Stage, type StageProps } from './stage';
export { SelectionOverlay, type SelectionOverlayProps } from './overlay';
export { Present, type PresentProps } from './present';
export { Presenter, type PresenterProps } from './presenter';
export { PresenterWindow, type PresenterWindowProps } from './presenter-window';

/* 주변의 판들 — 무엇이 있고, 어디에 있고, 언제 움직이나. */
export { Ribbon, type RibbonProps } from './ribbon';
export { Filmstrip, type FilmstripProps } from './filmstrip';
export { Thumbnail, type ThumbnailProps } from './thumbnail';
export { LayerPanel, type LayerPanelProps } from './layer-panel';
export { Properties, type PropertiesProps } from './properties';
export { TimelinePane, type TimelinePaneProps } from './timeline-pane';
export { NotesPane, type NotesPaneProps } from './notes';
export { ComponentPanel, type ComponentPanelProps } from './component-panel';
export { AuditPanel, type AuditPanelProps } from './audit-panel';
export { FindBar, type FindBarProps } from './find-bar';
export { DeckMapView, type DeckMapViewProps } from './deck-map-view';

/* 판 안의 부품 — 스택과 갤러리. */
export {
  EffectList,
  PaintList,
  type EffectListProps,
  type PaintListProps
} from './paint-panel';
export {
  ComboGallery,
  PathGallery,
  PresetGallery,
  type ComboGalleryProps,
  type PathGalleryProps,
  type PresetGalleryProps
} from './preset-gallery';

/* 대화 상자와 파일. */
export {
  SlideLayoutDialog,
  SlideSizeDialog,
  TemplateDialog,
  ThemeDialog,
  type SlideLayoutDialogProps,
  type SlideSizeDialogProps,
  type TemplateDialogProps,
  type ThemeDialogProps
} from './deck-dialogs';
export { LibraryDialog, type LibraryDialogProps } from './library-dialog';
export {
  FileActions,
  type DeckFileActions,
  type FileActionsProps
} from './file-actions';

/**
 * 문서를 구독하는 훅 — React 의 것이므로 여기다.
 *
 * 읽기 자체는 `deck.ts` 에 있고(`.` 로 나간다), 이 셋은 *언제 다시 읽나* 뿐이다.
 */
export { useDeck, useNote, useRevision } from './deck-model';
