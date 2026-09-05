import type { Editor } from '@barocss/editor-core';
import type { RendererRegistry } from '@barocss/dsl';
import type {
  Decorator,
  DecoratorGenerator,
  DecoratorManager,
  RemoteDecoratorManager,
  PatternDecoratorConfigManager,
  DecoratorGeneratorManager,
  DecoratorExportData,
  LoadDecoratorsPatternFunctions,
  DecoratorQueryOptions,
  DecoratorTypeSchema,
} from '@barocss/shared';

export type { DecoratorExportData, LoadDecoratorsPatternFunctions, DecoratorQueryOptions, DecoratorTypeSchema };

/** Model selection type for convert* APIs. */
/**
 * **선택은 `editor-core` 가 선언한다** — 여기 자기 판이 있었고, 좁았다.
 *
 * 있던 것은 `none | range | node` 의 유니온이고 `node` 의 필드가 `nodeId` **단수**였다. 그래서 이
 * 층은 `cell` 과 `table` 을 **표현할 수 없었다** — 표의 셀 블록도, 표 전체도. 모델은 그 둘을 오래
 * 전부터 갖고 있다(`SelectionType = 'range' | 'node' | 'cell' | 'table'`).
 *
 * 그리고 같은 것이 이 패키지 안에 **세 번** 적혀 있었다: 여기, `selection-handler.ts`, 그리고
 * `input-handler.ts` 의 `ModelSelectionRange`. 게다가 `editor-core` 에는 `NoSelection` 과
 * `Selection = ModelSelection | NoSelection` 이 **이미 있고 아무도 쓰지 않았다** — 세 판이 그것을
 * 각자 다시 발명한 것이다.
 *
 * 사본이 어긋난다는 것은 짐작이 아니라 이 저장소가 이미 여러 번 잰 것이다. 여기서는 그 대가가
 * *React 경로로는 셀을 고를 수 없다* 였다.
 */
import type { ModelSelection, NoSelection, SelectionType } from '@barocss/editor-core';
export type { ModelSelection, NoSelection, SelectionType };

/**
 * **`Selection` 이라는 이름은 쓰지 않는다** — DOM lib 이 이미 갖고 있다.
 *
 * `editor-core` 는 `Selection = ModelSelection | NoSelection` 을 내보내는데, 이 층은 `window
 * .getSelection()` 의 결과도 다룬다. 그 이름을 들이면 `convertDOMSelectionToModel(selection:
 * Selection)` 이 **어느 쪽인지 모호해지고**, 실제로 그렇게 해보니 타입 검사가 다섯 자리에서
 * *ModelSelection 에 anchorNode 가 없다* 고 말했다.
 *
 * 그게 `editor-core` 의 `Selection` 이 선언된 채 아무도 쓰지 않은 이유일 것이다 — 쓰려고 하면
 * 이렇게 된다. 여기서는 유니온을 그대로 적는다.
 */
/* `@barocss/shared` 가 이 유니온을 같은 이름으로 갖는다 — 여기 있던 것이 그쪽으로 갔다. */
export type { MaybeSelection } from '@barocss/shared';

/** Imperative handle for EditorView: decorator management and selection/convenience APIs. */
export interface EditorViewHandle {
  addDecorator(decorator: Decorator | DecoratorGenerator): void;
  removeDecorator(id: string): void;
  updateDecorator(id: string, updates: Partial<Decorator>): void;
  getDecorators(options?: DecoratorQueryOptions): Decorator[];
  getDecorator(id: string): Decorator | undefined;
  exportDecorators(): DecoratorExportData;
  loadDecorators(data: DecoratorExportData, patternFunctions?: LoadDecoratorsPatternFunctions): void;
  /** Content-editable root element (null until mounted). */
  contentEditableElement: HTMLElement | null;
  convertModelSelectionToDOM(sel: ModelSelection | null | undefined): void;
  convertDOMSelectionToModel(selection: Selection): ModelSelection;
  /** Converts a StaticRange (e.g. from getRangeAt) to model selection, or null if not resolvable. */
  convertStaticRangeToModel(staticRange: StaticRange): ModelSelection | null;
  defineDecoratorType(type: string, category: 'layer' | 'inline' | 'block', schema: DecoratorTypeSchema): void;
  decoratorManager: DecoratorManager | null;
  remoteDecoratorManager: RemoteDecoratorManager | null;
  patternDecoratorConfigManager: PatternDecoratorConfigManager | null;
  decoratorGeneratorManager: DecoratorGeneratorManager | null;
}

export type EditorViewLayerType = 'decorator' | 'selection' | 'context' | 'custom';

/** Options for the content layer (document rendering). Decorators are managed internally; use ref.addDecorator / ref.getDecorators. */
export interface EditorViewContentLayerOptions {
  /** Renderer registry. If omitted, uses getGlobalRegistry(). */
  registry?: RendererRegistry;
  /** Class name for the contenteditable wrapper. */
  className?: string;
  /** Whether the content is editable. Default true. */
  editable?: boolean;
}

/** Options for overlay layers (decorator, selection, context, custom). */
export interface EditorViewLayerOptions {
  /** Class name for the layer wrapper. */
  className?: string;
  /** Inline styles. */
  style?: React.CSSProperties;
}

/** Layer configuration for EditorView (optional per-layer classNames/styles). */
export interface EditorViewLayersConfig {
  content?: EditorViewContentLayerOptions;
  decorator?: EditorViewLayerOptions;
  selection?: EditorViewLayerOptions;
  context?: EditorViewLayerOptions;
  custom?: EditorViewLayerOptions;
}

export interface EditorViewOptions {
  /** Renderer registry (used by content layer if layers.content not set). */
  registry?: RendererRegistry;
  /** Class name for the root container. */
  className?: string;
  /** Per-layer configuration. */
  layers?: EditorViewLayersConfig;
}

export interface EditorViewProps {
  /** Editor instance. */
  editor: Editor;
  /** Optional options (registry, className, layers). */
  options?: EditorViewOptions;
  /** Optional children (e.g. custom layer content). Rendered inside the custom layer slot when present. */
  children?: React.ReactNode;
}

/** EditorView ref type (when using forwardRef). Exposes decorator API like editor-view-dom. */
export type EditorViewRef = EditorViewHandle;

export interface EditorViewContentLayerProps {
  /** Options (registry, className, editable). Editor is taken from EditorViewContext only. */
  options?: EditorViewContentLayerOptions;
}

export interface EditorViewLayerProps {
  /** Layer type (data-bc-layer value). */
  layer: EditorViewLayerType;
  /** Optional className. */
  className?: string;
  /** Optional style. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** Props for named overlay layers (DecoratorLayer, SelectionLayer, ContextLayer, CustomLayer). */
export interface EditorViewOverlayLayerProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

