import { Editor } from '@barocss/editor-core';
import type { RendererRegistry, ModelData } from '@barocss/dsl';
// TreeDocument는 제거됨 - ModelData (sid, stype)를 직접 사용

export interface LayerConfiguration {
  contentEditable?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  decorator?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  selection?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  context?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  custom?: {
    className?: string;
    attributes?: Record<string, string>;
  };
}

export interface EditorViewDOMOptions {
  container: HTMLElement;
  layers?: LayerConfiguration;
  keymaps?: KeymapConfig[];
  inputHandlers?: InputHandlerConfig[];
  mutationObserver?: MutationObserverConfig;
  // 렌더러 주입/자동 렌더링 옵션
  registry?: RendererRegistry; // RendererRegistry
  initialTree?: ModelData | any;  // ModelData 형식 (sid, stype 사용)
  autoRender?: boolean;   // 기본값: true
}

export interface KeymapConfig {
  key: string;
  handler: () => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface InputHandlerConfig {
  inputType: string;
  handler: (event: InputEvent) => void;
}

export interface MutationObserverConfig {
  childList?: boolean;
  subtree?: boolean;
  characterData?: boolean;
  attributes?: boolean;
  attributeFilter?: string[];
}

export interface IEditorViewDOM {
  readonly editor: Editor;
  readonly container: HTMLElement;
  readonly contentEditableElement: HTMLElement;
  readonly layers: {
    content: HTMLElement;
    decorator: HTMLElement;
    selection: HTMLElement;
    context: HTMLElement;
    custom: HTMLElement;
  };
  
  // DOM 이벤트 처리
  handleInput(event: InputEvent): void;
  handleKeydown(event: KeyboardEvent): void;
  handlePaste(event: ClipboardEvent): void;
  handleDrop(event: DragEvent): void;
  handleSelectionChange(): void;
  
  // Selection 변환
  convertDOMSelectionToModel?(sel: Selection): any;
  convertModelSelectionToDOM?(sel: any): void;
  
  // 브라우저 네이티브 명령 (Model-first Command 위임)
  insertParagraph(): void;
  insertText(text: string): void;
  deleteSelection(): void;
  historyUndo(): void;
  historyRedo(): void;
  
  // 편집 명령
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;

  // 렌더링 API
  render(tree?: ModelData | any): void;        // ModelData 형식 (sid, stype 사용) 또는 editor에서 export
  
  // Decorator 관리 API
  getDecorators?(options?: any): any[];        // Decorator 목록 조회
  
  // Decorator 타입 정의 (선택적)
  defineDecoratorType(
    type: string,
    category: 'layer' | 'inline' | 'block',
    schema: {
      description?: string;
      dataSchema?: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;
        default?: any;
      }>;
    }
  ): void;
  
  // 생명주기
  destroy(): void;
}

export interface InputHandler {
  handleInput(event: InputEvent): void;
  handleBeforeInput(event: InputEvent): void;
  handleKeyDown?(event: KeyboardEvent): void;
  handleDomMutations?(mutations: MutationRecord[]): void;
  handleTextContentChange?(oldValue: string | null, newValue: string | null, target: Node): void;
}

export interface DOMSelectionHandler {
  handleSelectionChange(): void;
  convertDOMSelectionToModel(selection: Selection): any;
  convertModelSelectionToDOM(modelSelection: any): void;
}

export interface PasteHandler {
  handlePaste(event: ClipboardEvent): void;
  handleDrop(event: DragEvent): void;
}

export interface MutationObserverManager {
  setup(contentEditableElement: HTMLElement): void;
  disconnect(): void;
  handleMutation(mutation: MutationRecord): void;
}

export interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;        // 변경 시작 위치 (oldText 기준)
  end: number;          // 변경 끝 위치 (oldText 기준)
  text: string;         // 변경할 텍스트 (insert: 삽입할 텍스트, delete: '', replace: 교체할 텍스트)
  confidence: number;   // 분석 신뢰도 (0-1)
}

export interface TextChangeAnalysisOptions {
  oldText: string;
  newText: string;
  selectionOffset: number;  // 사용자 Selection 위치
  selectionLength?: number; // 선택된 텍스트 길이 (0이면 커서)
  context?: {
    beforeText?: string;    // 앞쪽 컨텍스트
    afterText?: string;     // 뒤쪽 컨텍스트
  };
}

/**
 * Decorator Export/Import 타입
 */
export interface DecoratorExportData {
  version: string;
  targetDecorators: Array<{
    sid: string;
    stype: string;
    category: 'layer' | 'inline' | 'block';
    data?: Record<string, any>;
    target: any;
    enabled?: boolean;
  }>;
  patternDecorators: Array<{
    sid: string;  // id → sid로 통일
    stype: string;
    category: 'inline' | 'block' | 'layer';
    pattern: { source: string; flags: string }; // RegExp를 문자열로 변환
    priority?: number;
    enabled?: boolean;
    // extractData와 createDecorator는 함수이므로 제외
    // load 시 patternFunctions 매개변수에서 제공된 함수를 사용합니다.
  }>;
}