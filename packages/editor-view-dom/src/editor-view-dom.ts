import { Editor, ModelSelection, type ModelData } from '@barocss/editor-core';
import { IEditorViewDOM, EditorViewDOMOptions, LayerConfiguration } from './types';
import { InputHandlerImpl } from './event-handlers/input-handler';
import { DOMSelectionHandlerImpl } from './event-handlers/selection-handler';
import { MutationObserverManagerImpl } from './mutation-observer/mutation-observer-manager';
import { DecoratorRegistry, DecoratorManager, DecoratorPrebuilder, type Decorator, type DecoratorQueryOptions, type DecoratorModel } from './decorator/index.js';
import { RemoteDecoratorManager } from './decorator/remote-decorator-manager.js';
import { PatternDecoratorConfigManager, type PatternDecoratorConfig } from './decorator/pattern-decorator-config-manager.js';
import { DecoratorGeneratorManager, type DecoratorGenerator } from './decorator/decorator-generator.js';
import { DOMRenderer } from '@barocss/renderer-dom';
import { RendererRegistry } from '@barocss/dsl';
import type { DecoratorExportData } from './types';
import { getKeyString } from '@barocss/shared';

export class EditorViewDOM implements IEditorViewDOM {
  // 인스턴스 추적을 위한 고유 ID
  private readonly __instanceId: string;
  
  public readonly editor: Editor;
  public readonly container: HTMLElement;
  public readonly contentEditableElement: HTMLElement;
  public readonly decoratorRegistry: DecoratorRegistry;
  public readonly decoratorManager: DecoratorManager;
  public readonly remoteDecoratorManager: RemoteDecoratorManager;
  public readonly patternDecoratorConfigManager: PatternDecoratorConfigManager;
  public readonly decoratorGeneratorManager: DecoratorGeneratorManager;
  public readonly layers: {
    content: HTMLElement;
    decorator: HTMLElement;
    selection: HTMLElement;
    context: HTMLElement;
    custom: HTMLElement;
  } = {} as any; // 생성자에서 초기화됨

  private inputHandler: InputHandlerImpl;
  private selectionHandler: DOMSelectionHandlerImpl;
  private mutationObserverManager: MutationObserverManagerImpl;
  private _isComposing: boolean = false;
  private _selectionChangeTimeout: number | null = null;
  private _isDragging: boolean = false;
  private _isRendering: boolean = false; // 렌더링 중 플래그
  private _isModelDrivenChange: boolean = false; // Model-First 변경 플래그
  // 입력 중인 노드 추적 (skipNodes용)
  private _editingNodes: Set<string> = new Set();
  private _inputEndDebounceTimer: number | null = null;
  private _pendingRenderTimer: number | null = null;
  // 내부 렌더러 (renderer-dom 래핑)
  private _rendererRegistry?: RendererRegistry;
  private _domRenderer?: DOMRenderer; // Content 레이어용 (기존)
  // Layer별 DOMRenderer (각각 독립적인 prevVNodeTree)
  private _decoratorRenderer?: DOMRenderer;    // Decorator 레이어용
  private _selectionRenderer?: DOMRenderer;    // Selection 레이어용
  private _contextRenderer?: DOMRenderer;     // Context 레이어용
  private _customRenderer?: DOMRenderer;       // Custom 레이어용
  // Decorator Prebuilder (데이터 변환)
  private _decoratorPrebuilder?: DecoratorPrebuilder;
  private _hasRendered: boolean = false;
  // 마지막 렌더링된 modelData 저장 (decorator만 업데이트할 때 재사용)
  private _lastRenderedModelData: ModelData | null = null;
  // 테스트 환경에서 동기 렌더링을 위한 옵션
  private _renderOptions: { sync?: boolean } = {};

  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // 고유 ID 생성
    this.__instanceId = `editorview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.editor = editor;
    
    // Editor에 _viewDOM 참조 설정 (AutoTracer 등에서 접근용)
    (editor as any)._viewDOM = this;
    
    // Container 기반 API만 지원
    this.container = options.container;
    this.setupLayeredStructure(options.layers);
    
    // contentEditableElement는 항상 layers.content를 참조
    this.contentEditableElement = this.layers.content;
    
    // Decorator 시스템 초기화
    // decorator는 스키마와 독립적으로 관리됨
    this.decoratorRegistry = new DecoratorRegistry();
    this.decoratorManager = new DecoratorManager(this.decoratorRegistry);
    this.remoteDecoratorManager = new RemoteDecoratorManager();
    
    // 패턴 기반 Decorator 설정 관리자 초기화
    this.patternDecoratorConfigManager = new PatternDecoratorConfigManager();
    
    // Decorator Generator 관리자 초기화 (함수 기반 decorator)
    this.decoratorGeneratorManager = new DecoratorGeneratorManager();
    
    // 핸들러들 초기화
    this.inputHandler = new InputHandlerImpl(editor, this);
    this.selectionHandler = new DOMSelectionHandlerImpl(editor);
    this.mutationObserverManager = new MutationObserverManagerImpl(editor, this.inputHandler);
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
    
    // MutationObserver 설정
    this.mutationObserverManager.setup(this.contentEditableElement);
    

    // 렌더러 주입/초기화 (옵션 기반)
    this._setupContentRenderer(options);

    // autoRender 처리
    const autoRender = options.autoRender !== false;
    if (autoRender && options.initialTree && this._domRenderer) {
      this.render(options.initialTree as any);
    }
  }

  /**
   * 새로운 API: 컨테이너 내부에 계층 구조 생성
   */
  private setupLayeredStructure(layerConfig?: LayerConfiguration): void {
    const config = this.getDefaultLayerConfig(layerConfig);
    
    // 컨테이너 스타일 설정
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    
    // Layer 1: Content (contentEditable)
    const contentLayer = document.createElement('div');
    contentLayer.className = config.contentEditable?.className || 'barocss-editor-content';
    contentLayer.contentEditable = 'true';
    contentLayer.style.position = 'relative';
    contentLayer.style.zIndex = '1';
    contentLayer.setAttribute('data-bc-layer', 'content');
    this.applyAttributes(contentLayer, config.contentEditable?.attributes);
    
    // Layer 2: Decorator
    const decoratorLayer = document.createElement('div');
    decoratorLayer.className = config.decorator?.className || 'barocss-editor-decorators';
    decoratorLayer.style.position = 'absolute';
    decoratorLayer.style.top = '0';
    decoratorLayer.style.left = '0';
    decoratorLayer.style.right = '0';
    decoratorLayer.style.bottom = '0';
    decoratorLayer.style.pointerEvents = 'none';
    decoratorLayer.style.zIndex = '10';
    decoratorLayer.setAttribute('data-bc-layer', 'decorator');
    this.applyAttributes(decoratorLayer, config.decorator?.attributes);
    
    // Layer 3: Selection
    const selectionLayer = document.createElement('div');
    selectionLayer.className = config.selection?.className || 'barocss-editor-selection';
    selectionLayer.style.position = 'absolute';
    selectionLayer.style.top = '0';
    selectionLayer.style.left = '0';
    selectionLayer.style.right = '0';
    selectionLayer.style.bottom = '0';
    selectionLayer.style.pointerEvents = 'none';
    selectionLayer.style.zIndex = '100';
    selectionLayer.setAttribute('data-bc-layer', 'selection');
    this.applyAttributes(selectionLayer, config.selection?.attributes);
    
    // Layer 4: Context
    const contextLayer = document.createElement('div');
    contextLayer.className = config.context?.className || 'barocss-editor-context';
    contextLayer.style.position = 'absolute';
    contextLayer.style.top = '0';
    contextLayer.style.left = '0';
    contextLayer.style.right = '0';
    contextLayer.style.bottom = '0';
    contextLayer.style.pointerEvents = 'none';
    contextLayer.style.zIndex = '200';
    contextLayer.setAttribute('data-bc-layer', 'context');
    this.applyAttributes(contextLayer, config.context?.attributes);
    
    // Layer 5: Custom
    const customLayer = document.createElement('div');
    customLayer.className = config.custom?.className || 'barocss-editor-custom';
    customLayer.style.position = 'absolute';
    customLayer.style.top = '0';
    customLayer.style.left = '0';
    customLayer.style.right = '0';
    customLayer.style.bottom = '0';
    customLayer.style.pointerEvents = 'none';
    customLayer.style.zIndex = '1000';
    customLayer.setAttribute('data-bc-layer', 'custom');
    this.applyAttributes(customLayer, config.custom?.attributes);
    
    // 컨테이너에 계층 추가 (z-index 순서대로)
    this.container.appendChild(contentLayer);
    this.container.appendChild(decoratorLayer);
    this.container.appendChild(selectionLayer);
    this.container.appendChild(contextLayer);
    this.container.appendChild(customLayer);
    
    // layers 객체 설정
    this.layers.content = contentLayer;
    this.layers.decorator = decoratorLayer;
    this.layers.selection = selectionLayer;
    this.layers.context = contextLayer;
    this.layers.custom = customLayer;
  }
  
  
  /**
   * 기본 계층 설정 가져오기
   */
  private getDefaultLayerConfig(userConfig?: LayerConfiguration): Required<LayerConfiguration> {
    return {
      contentEditable: {
        className: 'barocss-editor-content',
        attributes: {},
        ...userConfig?.contentEditable
      },
      decorator: {
        className: 'barocss-editor-decorators',
        attributes: {},
        ...userConfig?.decorator
      },
      selection: {
        className: 'barocss-editor-selection',
        attributes: {},
        ...userConfig?.selection
      },
      context: {
        className: 'barocss-editor-context',
        attributes: {},
        ...userConfig?.context
      },
      custom: {
        className: 'barocss-editor-custom',
        attributes: {},
        ...userConfig?.custom
      }
    };
  }
  
  /**
   * 요소에 속성 적용
   */
  private applyAttributes(element: HTMLElement, attributes?: Record<string, string>): void {
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
  }

  private setupEventListeners(): void {
    console.log('[EditorViewDOM] setupEventListeners');
    // 입력 이벤트
    this.contentEditableElement.addEventListener('input', this.handleInput.bind(this) as EventListener);
    this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
    this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));
    this.contentEditableElement.addEventListener('paste', this.handlePaste.bind(this));
    this.contentEditableElement.addEventListener('drop', this.handleDrop.bind(this));
    
    // 조합 이벤트 (IME) - 사용하지 않음
    // beforeinput 이벤트의 isComposing 속성으로 IME 조합 상태 추적
    // 실제 처리는 MutationObserver가 담당하므로 composition 이벤트 리스너 불필요
    
    // 선택 이벤트
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    
    // 드래그 감지를 위한 이벤트 리스너
    this.contentEditableElement.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // 모델 selection → DOM selection 브리지
    this.editor.on('editor:selection.model', (sel: any) => {
      this._pendingModelSelection = sel;
      
      // 렌더링이 진행 중이면 완료될 때까지 대기 (렌더링 완료 콜백에서 적용됨)
      // 렌더링이 완료되었으면 바로 적용
      if (!this._isRendering) {
        this.applyModelSelectionWithRetry();
      }
    });

    // Escape 키로 인한 blur 요청 처리
    this.editor.on('editor:blur.request', () => {
      this.blur();
    });

    // 콘텐츠 변경 시 렌더링
    // MutationObserver에서 감지한 characterData 변경은 skipRender: true로 처리하여
    // 입력 중 렌더링과 selection 변경의 race condition을 방지
    this.editor.on('editor:content.change', (e: any) => {
      // 렌더링 중이면 무시 (무한루프 방지)
      if (this._isRendering) {
        return;
      }
      
      // skipRender: true인 경우 렌더링 건너뛰기
      // MutationObserver에서 감지한 characterData 변경은 입력 중이므로
      // 렌더링을 지연시켜 selection과의 race condition을 방지
      if (e?.skipRender) {
        return;
      }
      this.render();
      // 주의: selection은 브라우저가 자동으로 유지하므로 applyModelSelectionWithRetry() 호출하지 않음
      // 사용자 입력 중에는 브라우저 selection을 변경하면 안됨
      // applyModelSelectionWithRetry()는 editor:selection.model 이벤트에서만 호출됨
    });

    // text_update 이벤트는 제거 - 항상 diff를 통한 전체 렌더링 사용
    
    // 포커스 이벤트
    this.contentEditableElement.addEventListener('focus', this.handleFocus.bind(this));
    this.contentEditableElement.addEventListener('blur', this.handleBlur.bind(this));
  }

  private setupKeymapHandlers(): void {
    // keymapManager 기반 단축키는 더 이상 사용하지 않습니다.
    // 모든 키 입력은 editor-core의 keybinding 시스템을 통해 처리됩니다.
  }

  // DOM 이벤트 처리
  handleInput(event: InputEvent): void {
    // 입력 시작 감지
    this._onInputStart();
    this.inputHandler.handleInput(event);
  }

  handleBeforeInput(event: InputEvent): void {
    // beforeinput 이벤트의 isComposing 속성으로 IME 조합 상태 추적
    // composition 이벤트 리스너 대신 beforeinput의 isComposing 사용
    if (event.isComposing !== undefined) {
      this._isComposing = event.isComposing;
    }
    
    this.inputHandler.handleBeforeInput(event);
  }

  // composition 이벤트 핸들러 제거
  // beforeinput 이벤트의 isComposing 속성으로 IME 조합 상태 추적
  // 실제 처리는 MutationObserver가 담당

  handleKeydown(event: KeyboardEvent): void {
    // 향후 KeyBindingManager 통합을 위해 InputHandler에 먼저 위임
    if ((this.inputHandler as any).handleKeyDown) {
      (this.inputHandler as any).handleKeyDown(event);
    }

    // IME 조합 중에는 구조 변경/명령 단축키를 처리하지 않는다.
    // - 조합 문자열 수정(Enter/Backspace 등)은 IME/브라우저에 맡긴다.
    // - 모델 구조 변경은 compositionend 이후 MutationObserver/C1/C2/C3 경로에서만 처리한다.
    if (this._isComposing) {
      return;
    }

    const key = getKeyString(event);
    
    console.log('[EditorViewDOM] handleKeydown:', key);
    
    // 모든 키를 editor-core keybinding 시스템에 위임
    // Backspace, Delete도 keybinding 시스템을 통해 처리
    // context는 Editor 내부에서 자동으로 관리됨
    const resolved = this.editor.keybindings.resolve(key);
    if (resolved.length > 0) {
      const { command, args } = resolved[0];
      event.preventDefault();
      // Command가 자동으로 editor.selection을 읽음
      // 필요시 args로 override 가능
      void this.editor.executeCommand(command, args);
    }
  }

  /**
   * Backspace 키 처리 (Model-First)
   * 
   * 책임:
   * - DOM Selection 읽기 및 Model Selection 변환
   * - Backspace Command 호출 (모든 비즈니스 로직은 Command에서 처리)
   */
  private handleBackspaceKey(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    // DOM Selection → Model Selection 변환
    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] handleBackspaceKey: Failed to convert DOM selection', { modelSelection });
      return;
    }

    // Backspace Command 호출 (모든 케이스 분기 및 로직은 Command에서 처리)
    this.editor.executeCommand('backspace', { selection: modelSelection });
  }

  /**
   * Delete 키 처리 (Model-First)
   * 커서 오른쪽 글자 삭제 및 다음 편집 가능한 노드 기준 블록/노드 병합
   */
  private handleDeleteKey(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    // DOM selection을 Model selection으로 변환
    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] handleDeleteKey: Failed to convert DOM selection', { modelSelection });
      return;
    }
    
    // DeleteForward Command 호출 (모든 케이스 분기 및 로직은 Command에서 처리)
    this.editor.executeCommand('deleteForward', { selection: modelSelection });
  }

  handlePaste(event: ClipboardEvent): void {
    // IME 조합 중에는 붙여넣기를 가로채지 않는다.
    // 조합 문자열 내의 붙여넣기는 IME/브라우저에 맡긴다.
    if (this._isComposing) {
      return;
    }

    event.preventDefault();
    
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text/plain');
    if (text) {
      this.insertText(text);
    }
  }

  handleDrop(event: DragEvent): void {
    // IME 조합 중에는 드롭을 가로채지 않는다.
    if (this._isComposing) {
      return;
    }

    event.preventDefault();
    
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    const text = dataTransfer.getData('text/plain');
    if (text) {
      this.insertText(text);
    }
  }

  handleSelectionChange(): void {
    // 1. 프로그래밍 방식의 Selection 변경이면 무시
    if ((this.selectionHandler as any)._isProgrammaticChange) {
      return;
    }

    // 2. editor 외부 포커스면 무시 (가장 빠른 체크)
    if (document.activeElement !== this.contentEditableElement) {
      return;
    }

    // 3. Selection이 존재하는지 체크
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return;
    }

    // 4. anchorNode가 contentEditableElement 내부에 있는지 확인
    const isInsideEditor = this.contentEditableElement.contains(selection.anchorNode);
    if (!isInsideEditor) {
      return;
    }

    // 5. Devtool 영역 체크
    let node: Node | null = selection.anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) {
        return;
      }
      node = node.parentNode;
    }

    // 6. 기존 타이머가 있으면 취소
    if (this._selectionChangeTimeout) {
      clearTimeout(this._selectionChangeTimeout);
    }

    // 7. 드래그 중이거나 빠른 연속 선택 변경 시 디바운싱 적용
    const isRapidChange = this._isDragging;
    const debounceDelay = isRapidChange ? 100 : 16; // 드래그 중: 100ms, 일반: 16ms (60fps)

    this._selectionChangeTimeout = window.setTimeout(() => {
      this._processSelectionChange();
      this._selectionChangeTimeout = null;
    }, debounceDelay);
  }

  private _processSelectionChange(): void {
    try {
      const sel = window.getSelection();
      const anchorNode = sel?.anchorNode as Node | null;
      const focusNode = sel?.focusNode as Node | null;
      const anchorId = ((anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode?.parentElement)?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid')) || null;
      const focusId = ((focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement)?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid')) || null;
      
      // Selection 방향 계산
      let direction: 'forward' | 'backward' | 'unknown' = 'unknown';
      if (anchorId && focusId) {
        if (anchorId === focusId) {
          // 같은 노드 내에서의 선택
          direction = (sel?.anchorOffset || 0) <= (sel?.focusOffset || 0) ? 'forward' : 'backward';
        } else {
          // 다른 노드 간의 선택 - DOM 순서로 판단
          const anchorEl = anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode?.parentElement;
          const focusEl = focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement;
          
          if (anchorEl && focusEl) {
            const anchorContainer = anchorEl.closest('[data-bc-sid]');
            const focusContainer = focusEl.closest('[data-bc-sid]');
            
            if (anchorContainer && focusContainer) {
              const position = anchorContainer.compareDocumentPosition(focusContainer);
              direction = (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
            }
          }
        }
      }
      
      const info = {
        anchorOffset: sel?.anchorOffset,
        focusOffset: sel?.focusOffset,
        anchorNodeType: anchorNode?.nodeType,
        focusNodeType: focusNode?.nodeType,
        anchorTextPreview: anchorNode?.nodeType === Node.TEXT_NODE ? (anchorNode as Text).data.slice(0, 16) : null,
        focusTextPreview: focusNode?.nodeType === Node.TEXT_NODE ? (focusNode as Text).data.slice(0, 16) : null,
        anchorId,
        focusId,
        direction,
        collapsed: sel?.isCollapsed || false,
        isDragging: this._isDragging
      };
      // selectionHandler에게 위임 (중복 호출 방지)
    } catch {}
    this.selectionHandler.handleSelectionChange();
  }

  private handleMouseDown(event: MouseEvent): void {
    // 마우스 다운 시 드래그 가능성 체크
    this._isDragging = false;
  }

  private handleMouseMove(event: MouseEvent): void {
    // 마우스가 움직이고 버튼이 눌려있으면 드래그 중
    if (event.buttons > 0) {
      this._isDragging = true;
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    // 마우스 업 시 드래그 종료
    if (this._isDragging) {
      this._isDragging = false;
      // 드래그 종료 후 즉시 selection 처리
      if (this._selectionChangeTimeout) {
        clearTimeout(this._selectionChangeTimeout);
        this._selectionChangeTimeout = null;
      }
      this._processSelectionChange();
    }
  }

  private applyModelSelectionToDOM(sel: any): void {
    try {
      // ModelSelection을 SelectionHandler가 이해하는 형식으로 변환
      // sel은 이미 통일된 ModelSelection 형식 (startNodeId/endNodeId)
      if (!sel || sel.type === 'none') {
        return;
      }
      
      // SelectionHandler를 사용하여 정확한 DOM selection 변환
      // (mark/decorator로 분할된 text node 처리 포함)
      this.selectionHandler.convertModelSelectionToDOM(sel);
    } catch (e) {
      console.warn('[EditorViewDOM] applyModelSelectionToDOM:error', e);
    }
  }

  private findLeafTextNode(el: Element): Text | null {
    // el 아래 첫 텍스트 노드
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    return (walker.nextNode() as Text | null) || null;
  }

  private _pendingModelSelection: any | null = null;
  private _retryCount: number = 0;
  private applyModelSelectionWithRetry(): void {
    const sel = this._pendingModelSelection;
    if (!sel || sel.type === 'none') return;
    
    const found = sel.startNodeId && this.layers.content.querySelector(`[data-bc-sid="${sel.startNodeId}"]`)
      && sel.endNodeId && this.layers.content.querySelector(`[data-bc-sid="${sel.endNodeId}"]`);
    
    if (found) {
      this.applyModelSelectionToDOM(sel);
      this._pendingModelSelection = null;
      this._retryCount = 0;
      return;
    }
    if (this._retryCount > 10) {
      console.warn('[EditorViewDOM] selection retry exceeded', { sel });
      this._retryCount = 0;
      return;
    }
    this._retryCount++;
    requestAnimationFrame(() => this.applyModelSelectionWithRetry());
  }

  private handleFocus(): void {
    this.editor.emit('editor:selection.focus');
    // 포커스 복귀 시 마지막 모델 selection을 DOM에 재적용 시도
    try {
      const current = this.editor.selectionManager.getCurrentSelection();
      if (current) {
        this._pendingModelSelection = current;
        this.applyModelSelectionWithRetry();
      }
    } catch {}
  }

  private handleBlur(): void {
    // 포커스가 벗어날 때 입력 종료 감지
    this._onInputEnd();
    this.editor.emit('editor:selection.blur');
  }

  // 브라우저 네이티브 명령 → Model-first Command 위임
  insertParagraph(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      // Selection 이 없으면 단순 커맨드 실행 (확장에서 기본 위치를 결정)
      this.editor.executeCommand('insertParagraph', {});
      return;
    }

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] insertParagraph: Failed to convert DOM selection', {
        modelSelection
      });
      this.editor.executeCommand('insertParagraph', {});
      return;
    }

    this.editor.executeCommand('insertParagraph', { selection: modelSelection });
  }

  insertText(text: string): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      this.editor.executeCommand('insertText', { text });
      return;
    }

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] insertText: Failed to convert DOM selection', {
        modelSelection
      });
      this.editor.executeCommand('insertText', { text });
      return;
    }

    this.editor.executeCommand('insertText', { text, selection: modelSelection });
  }

  private insertLineBreak(): void {
    this.insertText('\n');
  }

  deleteSelection(): void {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;

    const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
    if (!modelSelection || modelSelection.type === 'none') {
      console.warn('[EditorViewDOM] deleteSelection: Failed to convert DOM selection', {
        modelSelection
      });
      return;
    }

    this.editor.executeCommand('deleteSelection', { selection: modelSelection });
  }

  historyUndo(): void {
    this.editor.executeCommand('historyUndo', {});
  }

  historyRedo(): void {
    this.editor.executeCommand('historyRedo', {});
  }

  private selectAll(): void {
    this.editor.executeCommand('selectAll', {});
  }

  // 편집 명령
  toggleBold(): void {
    this.editor.executeCommand('toggleBold');
  }

  toggleItalic(): void {
    this.editor.executeCommand('toggleItalic');
  }

  toggleUnderline(): void {
    this.editor.executeCommand('toggleUnderline');
  }

  toggleStrikeThrough(): void {
    this.editor.executeCommand('toggleStrikeThrough');
  }

  blur(): void {
    this.contentEditableElement.blur();
  }

  // 유틸리티 메서드


  // 생명주기
  destroy(): void {
    // Decorator 시스템 정리
    this.decoratorManager.clear();
    this.decoratorManager.removeAllListeners();
    
    // 이벤트 리스너 제거
    this.contentEditableElement.removeEventListener('input', this.handleInput.bind(this) as EventListener);
    this.contentEditableElement.removeEventListener('beforeinput', this.handleBeforeInput.bind(this));
    this.contentEditableElement.removeEventListener('keydown', this.handleKeydown.bind(this));
    // composition 이벤트 리스너는 등록하지 않으므로 제거 불필요
    this.contentEditableElement.removeEventListener('paste', this.handlePaste.bind(this));
    this.contentEditableElement.removeEventListener('drop', this.handleDrop.bind(this));
    
    document.removeEventListener('selectionchange', this.handleSelectionChange.bind(this));
    
    // 드래그 감지 이벤트 리스너 제거
    this.contentEditableElement.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    
    this.contentEditableElement.removeEventListener('focus', this.handleFocus.bind(this));
    this.contentEditableElement.removeEventListener('blur', this.handleBlur.bind(this));
    
    // MutationObserver 해제
    this.mutationObserverManager.disconnect();
    
    // 계층 정리
    this.cleanupLayers();
  }
  
  /**
   * 모든 계층 정리
   */
  private cleanupLayers(): void {
    // 각 계층의 내용 정리
    Object.values(this.layers).forEach(layer => {
      if (layer && layer.parentNode) {
        // 계층 내부 정리
        layer.innerHTML = '';
        
        // 이벤트 리스너 제거 (있다면)
        const clonedLayer = layer.cloneNode(false) as HTMLElement;
        layer.parentNode.replaceChild(clonedLayer, layer);
      }
    });
  }

  // ----- 렌더러 내부 구성 -----
  private _setupContentRenderer(options: EditorViewDOMOptions): void {
    console.log('[EditorViewDOM] _setupContentRenderer:start');
    
    // 이미 설정되어 있으면 재생성하지 않음 (prevVNodeTree 유지)
    if (this._domRenderer) {
      return;
    }
    
    // 1. 외부에서 전달받은 registry 사용 (우선순위 1)
    if (options.registry) {
      this._rendererRegistry = options.registry;
    } else {
      // 2. 새로 생성 (글로벌 레지스트리 조회 허용)
      // global:false → local registry가 없는 항목은 글로벌 레지스트리에서 조회
      this._rendererRegistry = new RendererRegistry({ global: false });
    }
    
    // 3. Content 레이어용 DOMRenderer 생성 (Selection 보존 활성화)
    // 템플릿은 외부에서 정의되어야 함 (main.ts 등에서 define() 호출)
    this._domRenderer = new DOMRenderer(this._rendererRegistry, {
      enableSelectionPreservation: true,
      name: 'content',
      dataStore: this.editor.dataStore
    });
    
    // 4. Layer별 DOMRenderer 생성 (각각 독립적인 prevVNodeTree)
    this._decoratorRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'decorator',
      dataStore: this.editor.dataStore
    });
    this._selectionRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'selection',
      dataStore: this.editor.dataStore
    });
    this._contextRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'context',
      dataStore: this.editor.dataStore
    });
    this._customRenderer = new DOMRenderer(this._rendererRegistry, { 
      name: 'custom',
      dataStore: this.editor.dataStore
    });
    
    // 5. Decorator Prebuilder 초기화 (contentRenderer 전달하여 ComponentManager 접근)
    if (this._domRenderer) {
      this._decoratorPrebuilder = new DecoratorPrebuilder(
        this._rendererRegistry!,
        this.layers.content,
        this._domRenderer
      );
    }
    
    // 패턴 설정을 Content DOMRenderer에 적용
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * 패턴 설정을 DOMRenderer에 적용
   * enable된 패턴만 등록합니다.
   */
  private _applyPatternConfigsToRenderer(): void {
    if (!this._domRenderer) return;
    
    const generator = this._domRenderer.getPatternDecoratorGenerator();
    
    // 기존 패턴 모두 제거
    const allConfigs = this.patternDecoratorConfigManager.getConfigs();
    for (const config of allConfigs) {
      generator.unregisterPattern(config.sid);
    }
    
    // enable된 패턴만 등록 (기본값은 true)
    const enabledConfigs = this.patternDecoratorConfigManager.getConfigs(true);
    for (const config of enabledConfigs) {
      generator.registerPattern({
        sid: config.sid,
        stype: config.stype,
        category: config.category,
        pattern: config.pattern,
        extractData: config.extractData,
        createDecorator: config.createDecorator,
        priority: config.priority
      });
    }
    
    // 패턴 decorator는 기본적으로 활성화
    generator.setEnabled(true);
  }
  
  convertModelSelectionToDOM(sel: ModelSelection): void {
    this.selectionHandler.convertModelSelectionToDOM(sel);
  }

  convertDOMSelectionToModel(sel: Selection): ModelSelection {
    return this.selectionHandler.convertDOMSelectionToModel(sel);
  }

  // 외부 노출 렌더 API
  render(tree?: ModelData | any, options?: { sync?: boolean }): void {
    if (!this._domRenderer) {
      console.warn('[EditorViewDOM] No DOM renderer available');
      return;
    }
    
    // 렌더링 중 플래그 설정 (무한루프 방지)
    if (this._isRendering) {
      return; // 이미 렌더링 중이면 무시
    }
    this._isRendering = true;
    
    // Model-First 변경 플래그 설정 (MutationObserver 필터링용)
    this._isModelDrivenChange = true;
    
    try {
      // 옵션 저장 (addDecorator 등에서 사용)
      if (options) {
        this._renderOptions = { ...this._renderOptions, ...options };
      }
    
    // 1. 문서 가져오기
    let modelData: ModelData | null = null;
    
    if (tree) {
      // 외부에서 전달된 모델 - 이미 ModelData 형식 (sid, stype 사용)
      if (!tree.stype) {
        console.error('[EditorViewDOM] Invalid tree format: missing stype (required)');
        return;
      }
      if (!tree.sid) {
        console.error('[EditorViewDOM] Invalid tree format: missing sid (required)');
        return;
      }
      // 변환 없이 직접 사용
      modelData = tree as ModelData;
    } else {
      // editor에서 직접 가져오기 - getDocumentProxy() 사용 (lazy evaluation)
      try {
        const exported = this.editor.getDocumentProxy?.();
        if (exported) {
          // getDocumentProxy()는 이미 Proxy로 래핑된 INode를 반환 (ModelData 호환)
          modelData = exported as ModelData;
        } else {
          // modelData가 없으면 이전에 렌더링된 modelData 재사용 (decorator만 업데이트할 때)
          if (this._lastRenderedModelData) {
            modelData = this._lastRenderedModelData;
          } else {
            // modelData가 없어도 decorator는 렌더링 가능
          }
        }
      } catch (error) {
        console.error('[EditorViewDOM] Error exporting document:', error);
        // 에러가 발생해도 이전 modelData 재사용 시도
        if (this._lastRenderedModelData) {
          modelData = this._lastRenderedModelData;
        }
      }
    }
    
    // 2. Decorators 가져오기 (EditorModel - 로컬 + 원격)
    // modelData가 없어도 decorator는 렌더링 가능
    // EditorModel은 로컬 전용이므로 dataStore가 아닌 decoratorManager에서 가져옴
    let localDecorators: Decorator[] = [];
    try {
      const allLocalDecorators = this.decoratorManager.getAll();
      if (allLocalDecorators && allLocalDecorators.length > 0) {
        localDecorators = allLocalDecorators;
      }
    } catch (error) {
      console.error('[EditorViewDOM] Error getting local decorators:', error);
    }
    
    // 원격 decorator 수집 (동시 편집에서 외부 사용자/AI의 decorator)
    let remoteDecorators: Decorator[] = [];
    try {
      remoteDecorators = this.remoteDecoratorManager.getAll();
    } catch (error) {
      console.error('[EditorViewDOM] Error getting remote decorators:', error);
    }
    
    // 3. Generator 기반 decorator 생성
    let generatorDecorators: Decorator[] = [];
    if (modelData) {
      try {
        generatorDecorators = this._generateGeneratorDecorators(modelData);
      } catch (error) {
        console.error('[EditorViewDOM] Error generating generator decorators:', error);
      }
    }
    
    // 모든 decorator 통합 (로컬 + 원격 + generator)
    const allDecorators = [...localDecorators, ...remoteDecorators, ...generatorDecorators];
    
    // 4. Selection 정보 수집 (Content 레이어 렌더링용)
    const selection = window.getSelection();
    let selectionContext: { 
      textNode?: Text; 
      restoreSelection?: (textNode: Text, offset: number) => void;
      model?: { sid: string; modelOffset: number };
    } | undefined = undefined;
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer.nodeType === Node.TEXT_NODE 
        ? range.startContainer as Text 
        : null;
      const domOffset = range.startOffset;
      
      if (textNode && this.layers.content.contains(textNode)) {
        // Model selection으로 변환하여 sid와 modelOffset 얻기
        try {
          const modelSel = this.selectionHandler.convertDOMSelectionToModel(selection);
          if (modelSel && modelSel.anchor) {
            selectionContext = {
              textNode,
              restoreSelection: (node: Text, offset: number) => {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset);
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              },
              model: {
                sid: modelSel.anchor.nodeId || '',
                modelOffset: modelSel.anchor.offset || 0
              }
            };
          } else {
            // Model selection 변환 실패 시 DOM 기반으로만 전달
            selectionContext = {
              textNode,
              restoreSelection: (node: Text, offset: number) => {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset);
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            };
          }
        } catch (error) {
          // Selection 변환 실패 시 무시 (선택적 기능)
          console.debug('[EditorViewDOM] Failed to convert selection for preservation:', error);
        }
      }
    }
    
    // 5. Content 레이어 먼저 렌더링 (동기)
    // modelData가 있으면 Content 렌더링, 없으면 decorator만 렌더링
    // _lastRenderedModelData를 재사용하는 경우에도 content를 재렌더링 (decorator 업데이트 반영)
    if (modelData) {
      try {
        this._domRenderer?.render(
          this.layers.content, 
          modelData, 
          allDecorators, 
          undefined, 
          selectionContext,
          {
            onComplete: () => {
              // Reconcile 완료 후 pending selection 적용
              if (this._pendingModelSelection) {
                // 다음 프레임에 적용 (DOM 업데이트 완료 보장)
                requestAnimationFrame(() => {
                  this.applyModelSelectionWithRetry();
                });
              }
            }
          }
        );
        this._hasRendered = true;
        // 마지막 렌더링된 modelData 저장 (decorator만 업데이트할 때 재사용)
        this._lastRenderedModelData = modelData;
      } catch (error) {
        console.error('[EditorViewDOM] Error rendering content:', error);
        // Content 렌더링 실패해도 decorator는 렌더링 시도
      }
    } else if (this._lastRenderedModelData && allDecorators.length > 0) {
      // modelData가 없지만 decorator가 있고 이전 렌더링된 데이터가 있으면 content 재렌더링
      // (decorator 업데이트를 content 레이어에 반영하기 위해)
      try {
        this._domRenderer?.render(
          this.layers.content, 
          this._lastRenderedModelData, 
          allDecorators, 
          undefined, 
          selectionContext,
          {
            onComplete: () => {
              // Reconcile 완료 후 pending selection 적용
              if (this._pendingModelSelection) {
                // 다음 프레임에 적용 (DOM 업데이트 완료 보장)
                requestAnimationFrame(() => {
                  this.applyModelSelectionWithRetry();
                });
              }
            }
          }
        );
      } catch (error) {
        console.error('[EditorViewDOM] Error re-rendering content with decorators:', error);
      }
    }
    
    // 5. requestAnimationFrame 이후 다른 레이어들 렌더링
    // Content 렌더링 완료 후 DOM 위치 계산 가능
    // modelData가 없어도 decorator는 렌더링 가능 (이전 렌더링된 DOM 사용)
    if (allDecorators.length > 0) {
      const renderLayers = () => {
        // modelData가 없으면 이전 렌더링된 DOM을 사용하여 위치 계산
        const dataForLayers = modelData || (this._hasRendered ? {} as ModelData : null);
        if (dataForLayers !== null) {
          this._renderLayers(allDecorators, dataForLayers);
        }
      };
      
      // sync 옵션이 있으면 동기적으로 실행 (테스트 환경용)
      if (options?.sync || this._renderOptions.sync) {
        renderLayers();
      } else {
        requestAnimationFrame(renderLayers);
      }
    }
    } finally {
      // 렌더링 완료 후 플래그 해제
      this._isRendering = false;
      
      // Model-First 변경 플래그 해제 (다음 이벤트 루프에서)
      setTimeout(() => {
        this._isModelDrivenChange = false;
      }, 0);
    }
  }

  /**
   * Layer별 렌더링 (Content 제외)
   */
  private _renderLayers(allDecorators: Decorator[], modelData: ModelData): void {
    if (!this._decoratorPrebuilder) {
      console.warn('[EditorViewDOM] DecoratorPrebuilder not initialized');
      return;
    }
    
    try {
      // 1. DecoratorPrebuilder로 모든 decorator를 DecoratorModel로 변환
      const decoratorModels = this._decoratorPrebuilder.buildAll(allDecorators, modelData);
      
      // 2. Layer별로 분리
      const decoratorLayerModels: DecoratorModel[] = [];
      const selectionLayerModels: DecoratorModel[] = [];
      const contextLayerModels: DecoratorModel[] = [];
      const customLayerModels: DecoratorModel[] = [];
      
      for (const model of decoratorModels) {
        // Inline decorator는 content 레이어에만 렌더링되어야 함
        // 다른 레이어에는 포함하지 않음
        if (model.category === 'inline') {
          continue; // Inline decorator는 content 레이어에서만 처리
        }
        
        const layerTarget = model.layerTarget || 'content';
        switch (layerTarget) {
          case 'decorator':
            decoratorLayerModels.push(model);
            break;
          case 'selection':
            selectionLayerModels.push(model);
            break;
          case 'context':
            contextLayerModels.push(model);
            break;
          case 'custom':
            customLayerModels.push(model);
            break;
          // 'content'는 이미 Content 레이어에서 렌더링됨
        }
      }
      
      // 3. 각 Layer 렌더링 (renderChildren 사용)
      if (decoratorLayerModels.length > 0 && this._decoratorRenderer) {
        this._decoratorRenderer.renderChildren(this.layers.decorator, decoratorLayerModels);
      }
      
      if (selectionLayerModels.length > 0 && this._selectionRenderer) {
        this._selectionRenderer.renderChildren(this.layers.selection, selectionLayerModels);
      }
      
      if (contextLayerModels.length > 0 && this._contextRenderer) {
        this._contextRenderer.renderChildren(this.layers.context, contextLayerModels);
      }
      
      if (customLayerModels.length > 0 && this._customRenderer) {
        this._customRenderer.renderChildren(this.layers.custom, customLayerModels);
      }
    } catch (error) {
      console.error('[EditorViewDOM] Error rendering layers:', error);
    }
  }

  // 선택 복구 유틸리티 (툴바 등에서 사용 가능)
  restoreLastSelection(): void {
    try {
      // DOM selection 비어있으면 마지막 모델 selection을 적용
      const sel = window.getSelection();
      const hasSelection = !!sel && sel.rangeCount > 0;
      if (!hasSelection) {
        const current = (this.editor as any).selection;
        if (current) {
          this._pendingModelSelection = current;
          this.applyModelSelectionWithRetry();
        }
      }
    } catch {}
  }

  /**
   * 패턴 설정 배열 설정
   * 
   * 패턴 설정을 배열로 관리합니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * view.setPatternDecoratorConfigs([
   *   {
   *     sid: 'hex-color',
   *     stype: 'color-picker',
   *     pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *     extractData: (match) => ({ color: match[0] }),
   *     createDecorator: (nodeId, start, end, data) => ({
   *       sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *       category: 'inline',
   *       target: { sid: nodeId, startOffset: start, endOffset: end },
   *       data: { color: data.color }
   *     }),
   *     priority: 10
   *   }
   * ]);
   * ```
   */
  setPatternDecoratorConfigs(configs: PatternDecoratorConfig[]): void {
    this.patternDecoratorConfigManager.setConfigs(configs);
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * 패턴 설정 추가
   */
  addPatternDecoratorConfig(config: PatternDecoratorConfig): void {
    this.patternDecoratorConfigManager.addConfig(config);
    this._applyPatternConfigsToRenderer();
  }
  
  /**
   * 패턴 기반 Decorator 등록 (편의 메서드)
   * 
   * EditorModel이 로컬 전용이므로 EditorViewDOM에서 직접 등록합니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * view.registerPatternDecorator({
   *   sid: 'hex-color',
   *   stype: 'color-picker',
   *   pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *   extractData: (match) => ({ color: match[0] }),
   *   createDecorator: (nodeId, start, end, data) => ({
   *     sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *     category: 'inline',
   *     target: { sid: nodeId, startOffset: start, endOffset: end },
   *     data: { color: data.color }
   *   }),
   *   priority: 10
   * });
   * ```
   */
  registerPatternDecorator(config: PatternDecoratorConfig): void {
    this.addPatternDecoratorConfig(config);
  }
  
  /**
   * 패턴 설정 제거
   */
  removePatternDecoratorConfig(sid: string): boolean {
    const removed = this.patternDecoratorConfigManager.removeConfig(sid);
    if (removed) {
      this._applyPatternConfigsToRenderer();
    }
    return removed;
  }
  
  /**
   * 패턴 기반 Decorator 제거 (편의 메서드)
   */
  unregisterPatternDecorator(sid: string): boolean {
    return this.removePatternDecoratorConfig(sid);
  }
  
  /**
   * 모든 패턴 설정 가져오기
   */
  getPatternDecoratorConfigs(): PatternDecoratorConfig[] {
    return this.patternDecoratorConfigManager.getConfigs();
  }
  
  /**
   * 패턴 설정 활성화/비활성화
   * 
   * @param id - 패턴 ID
   * @param enabled - 활성화 여부
   */
  setPatternDecoratorEnabled(id: string, enabled: boolean): boolean {
    const updated = this.patternDecoratorConfigManager.setConfigEnabled(id, enabled);
    if (updated) {
      this._applyPatternConfigsToRenderer();
    }
    return updated;
  }
  
  /**
   * 패턴 설정 활성화 여부 확인
   * 
   * @param sid - 패턴 SID
   * @returns 활성화 여부 (기본값: true)
   */
  isPatternDecoratorEnabled(sid: string): boolean {
    return this.patternDecoratorConfigManager.isConfigEnabled(sid);
  }

  // ----- Decorator 관리 (EditorModel - 로컬 전용) -----
  
  /**
   * Decorator 타입 정의 (선택적)
   * 
   * 타입을 정의하면 해당 타입의 decorator에 대해 검증과 기본값 적용이 수행됩니다.
   * 타입을 정의하지 않아도 decorator를 사용할 수 있습니다 (선택적 타입 시스템).
   * 
   * @example
   * ```typescript
   * // 타입 정의 (선택적)
   * view.defineDecoratorType('highlight', 'inline', {
   *   description: 'Highlight decorator',
   *   dataSchema: {
   *     color: { type: 'string', default: 'yellow' },
   *     opacity: { type: 'number', default: 0.3 }
   *   }
   * });
   * 
   * // 이제 highlight 타입은 검증됨
   * view.addDecorator({
   *   sid: 'd1',
   *   stype: 'highlight',
   *   category: 'inline',
   *   target: { sid: 't1', startOffset: 0, endOffset: 5 },
   *   data: { color: 'red' }  // opacity는 기본값 0.3 적용
   * });
   * ```
   */
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
  ): void {
    if (category === 'layer') {
      this.decoratorRegistry.registerLayerType(type, schema);
    } else if (category === 'inline') {
      this.decoratorRegistry.registerInlineType(type, schema);
    } else if (category === 'block') {
      this.decoratorRegistry.registerBlockType(type, schema);
    }
  }
  
  /**
   * Decorator 추가 (EditorModel - 로컬 전용)
   * 
   * 일반 decorator와 패턴 decorator 설정 모두 지원합니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * // 일반 decorator 추가
   * view.addDecorator({
   *   sid: 'comment-1',
   *   type: 'comment',
   *   category: 'inline',
   *   target: {
   *     sid: 'text-1',
   *     startOffset: 0,
   *     endOffset: 5
   *   },
   *   data: {
   *     author: 'user1',
   *     text: 'This is a comment'
   *   }
   * });
   * 
   * // 패턴 decorator 설정 추가 (통일된 형식)
   * view.addDecorator({
   *   sid: 'hex-color',
   *   type: 'color-picker', // 실제 decorator 타입
   *   category: 'inline',
   *   decoratorType: 'pattern', // 패턴 decorator임을 명시
   *   target: { sid: '' }, // 패턴 decorator는 target이 없음
   *   data: {
   *     pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
   *     extractData: (match) => ({ color: match[0] }),
   *     createDecorator: (nodeId, start, end, data) => ({
   *       sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *       target: { sid: nodeId, startOffset: start, endOffset: end },
   *       data: { color: data.color }
   *     }),
   *     priority: 10
   *   }
   * });
   * ```
   */
  addDecorator(decorator: Decorator | DecoratorGenerator): void {
    // decoratorType 확인
    const decoratorType = 'decoratorType' in decorator 
      ? decorator.decoratorType 
      : ('generate' in decorator ? 'custom' : undefined);
    
    // custom (함수 기반) decorator
    if (decoratorType === 'custom' || 'generate' in decorator) {
      const generator = decorator as DecoratorGenerator;
      // onDidChange 콜백 등록 (변경 감지 시 재렌더링)
      this.decoratorGeneratorManager.registerGenerator(
        generator,
        () => this.render(undefined, this._renderOptions) // 변경 감지 시 재렌더링 (옵션 유지)
      );
      this.render(undefined, this._renderOptions);
      return;
    }
    
    // pattern decorator
    const isPattern = decoratorType === 'pattern' || (decorator.data && 'pattern' in decorator.data);
    if (isPattern) {
      const patternConfig = this._convertDecoratorToPatternConfig(decorator as Decorator);
      if (patternConfig) {
        this.patternDecoratorConfigManager.addConfig(patternConfig);
        this._applyPatternConfigsToRenderer();
      }
      return;
    }
    
    // target (일반) decorator
    const targetDecorator: Decorator = {
      ...(decorator as Decorator),
      decoratorType: decoratorType || 'target'
    };
    this.decoratorManager.add(targetDecorator);
    this.render(undefined, this._renderOptions);
  }
  
  /**
   * Decorator를 PatternDecoratorConfig로 변환
   */
  private _convertDecoratorToPatternConfig(decorator: Decorator): PatternDecoratorConfig | null {
    const data = decorator.data || {};
    
    if (!data.pattern || !data.extractData || !data.createDecorator) {
      return null;
    }
    
    return {
      sid: decorator.sid,
      stype: decorator.stype,
      category: decorator.category,
      pattern: data.pattern as RegExp | ((text: string) => Array<{
        match: string;
        index: number;
        groups?: RegExpMatchArray['groups'];
        [key: number]: string | undefined;
      }>),
      extractData: data.extractData as (match: RegExpMatchArray) => Record<string, any>,
      createDecorator: data.createDecorator as (
        nodeId: string,
        startOffset: number,
        endOffset: number,
        extractedData: Record<string, any>
      ) => {
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      } | Array<{
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      }>,
      priority: data.priority as number | undefined,
      enabled: decorator.enabled
    };
  }
  
  /**
   * PatternDecoratorConfig를 Decorator로 변환
   */
  private _convertPatternConfigToDecorator(config: PatternDecoratorConfig): Decorator {
    return {
      sid: config.sid,
      stype: config.stype,
      category: config.category,
      target: { sid: '' }, // 패턴 decorator는 target이 없음 (텍스트에서 자동 생성)
      decoratorType: 'pattern', // 패턴 decorator임을 명시
      data: {
        pattern: config.pattern,
        extractData: config.extractData,
        createDecorator: config.createDecorator,
        priority: config.priority
      },
      enabled: config.enabled
    };
  }
  
  /**
   * Decorator 제거
   * 
   * 일반 decorator, 패턴 decorator 설정, custom decorator 모두 제거 가능합니다.
   */
  removeDecorator(id: string): boolean {
    // custom decorator 제거 시도
    const customRemoved = this.decoratorGeneratorManager.unregisterGenerator(id);
    if (customRemoved) {
      this.render();
      return true;
    }
    
    // 패턴 decorator 설정 제거 시도
    const patternRemoved = this.patternDecoratorConfigManager.removeConfig(id);
    if (patternRemoved) {
      this._applyPatternConfigsToRenderer();
      return true;
    }
    
    // 일반 decorator 제거 시도
    try {
      this.decoratorManager.remove(id);
      this.render();
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Decorator 업데이트
   * 
   * 일반 decorator만 업데이트 가능합니다.
   */
  updateDecorator(id: string, updates: Partial<Decorator>): boolean {
    try {
      this.decoratorManager.update(id, updates);
      // Decorator 업데이트 시 자동 재렌더링 (옵션 유지)
      this.render(undefined, this._renderOptions);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Decorator 활성화/비활성화
   * 
   * 일반 decorator, 패턴 decorator 설정, custom decorator 모두 지원합니다.
   */
  setDecoratorEnabled(id: string, enabled: boolean): boolean {
    // custom decorator 활성화/비활성화 시도
    const customUpdated = this.decoratorGeneratorManager.setGeneratorEnabled(id, enabled);
    if (customUpdated) {
      this.render();
      return true;
    }
    
    // 패턴 decorator 설정 활성화/비활성화 시도
    const patternUpdated = this.patternDecoratorConfigManager.setConfigEnabled(id, enabled);
    if (patternUpdated) {
      this._applyPatternConfigsToRenderer();
      return true;
    }
    
    // 일반 decorator 활성화/비활성화 시도
    const updated = this.decoratorManager.setEnabled(id, enabled);
    if (updated) {
      this.render();
    }
    return updated;
  }
  
  /**
   * Decorator 활성화 여부 확인
   * 
   * 일반 decorator, 패턴 decorator 설정, custom decorator 모두 확인 가능합니다.
   */
  isDecoratorEnabled(id: string): boolean {
    // custom decorator 확인
    if (this.decoratorGeneratorManager.isGeneratorEnabled(id)) {
      return true;
    }
    
    // 패턴 decorator 설정 확인
    if (this.patternDecoratorConfigManager.isConfigEnabled(id)) {
      return true;
    }
    
    // 일반 decorator 확인
    return this.decoratorManager.isEnabled(id);
  }
  
  /**
   * 모든 Decorator 조회
   * 
   * 일반 decorator, 패턴 decorator 설정, custom decorator를 모두 반환합니다.
   * 
   * 주의: custom decorator는 DecoratorGenerator 타입이므로 타입이 다릅니다.
   */
  getDecorators(options?: DecoratorQueryOptions): (Decorator | DecoratorGenerator)[] {
    const regularDecorators = this.decoratorManager.getAll(options);
    
    // 패턴 decorator 설정도 Decorator 형식으로 변환하여 포함
    const patternConfigs = this.patternDecoratorConfigManager.getConfigs(
      options?.enabledOnly !== false // 기본값은 true
    );
    const patternDecorators = patternConfigs.map(config => 
      this._convertPatternConfigToDecorator(config)
    );
    
    // custom decorator 포함
    const customDecorators = this.decoratorGeneratorManager.getAllGenerators(
      options?.enabledOnly !== false
    );
    
    return [...regularDecorators, ...patternDecorators, ...customDecorators];
  }
  
  /**
   * 특정 Decorator 조회
   * 
   * 일반 decorator, 패턴 decorator 설정, custom decorator 모두 조회 가능합니다.
   */
  getDecorator(id: string): Decorator | DecoratorGenerator | undefined {
    // custom decorator 조회
    const generator = this.decoratorGeneratorManager.getGenerator(id);
    if (generator) {
      return generator;
    }
    
    // 일반 decorator 조회
    const decorator = this.decoratorManager.get(id);
    if (decorator) {
      return decorator;
    }
    
    // 패턴 decorator 설정 조회
    const configs = this.patternDecoratorConfigManager.getConfigs();
    const config = configs.find(c => c.id === id);
    if (config) {
      return this._convertPatternConfigToDecorator(config);
    }
    
    return undefined;
  }
  
  /**
   * 모든 Decorator를 JSON으로 Export
   * 
   * 일반 decorator와 패턴 decorator 설정을 모두 포함합니다.
   * 함수는 직렬화할 수 없으므로 패턴 decorator의 함수는 제외됩니다.
   * 
   * main.ts에서 사용:
   * ```typescript
   * const exportData = view.exportDecorators();
   * const json = JSON.stringify(exportData, null, 2);
   * localStorage.setItem('decorators', json);
   * ```
   */
  exportDecorators(): DecoratorExportData {
    // 일반 decorator (target decorators)
    const targetDecorators = this.decoratorManager.getAll({ enabledOnly: false })
      .filter(d => d.decoratorType !== 'pattern')
      .map(d => {
        const { decoratorType, ...rest } = d;
        return rest; // 변환 없이 그대로 (stype 포함)
      });
    
    // 패턴 decorator 설정 (함수 제외)
    const patternConfigs = this.patternDecoratorConfigManager.getConfigs();
    const patternDecorators = patternConfigs.map(config => ({
      sid: config.sid,
      stype: config.stype,
      category: config.category,
      pattern: {
        source: config.pattern.source,
        flags: config.pattern.flags
      },
      priority: config.priority,
      enabled: config.enabled
    }));
    
    return {
      version: '1.0.0',
      targetDecorators,
      patternDecorators
    };
  }
  
  /**
   * JSON에서 Decorator를 Load
   * 
   * 패턴 decorator의 함수는 다음 순서로 찾습니다:
   * 1. patternFunctions 매개변수에서 제공된 함수
   * 2. 글로벌 패턴 레지스트리에서 등록된 함수 (모듈화된 패턴)
   * 
   * main.ts에서 사용:
   * ```typescript
   * // 방법 1: 함수 직접 제공
   * const json = localStorage.getItem('decorators');
   * if (json) {
   *   const exportData = JSON.parse(json);
   *   view.loadDecorators(exportData, {
   *     'hex-color': {
   *       extractData: (match) => ({ color: match[0] }),
   *       createDecorator: (nodeId, start, end, data) => ({
   *         sid: `pattern-hex-${nodeId}-${start}-${end}`,
   *         target: { sid: nodeId, startOffset: start, endOffset: end },
   *         data: { color: data.color }
   *       })
   *     }
   *   });
   * }
   * 
   * // 방법 2: 모듈화된 패턴 사용
   * // 패턴을 모듈로 분리하고 함수를 재사용
   * import { hexColorPattern } from './patterns/hex-color';
   * 
   * const json = localStorage.getItem('decorators');
   * if (json) {
   *   const exportData = JSON.parse(json);
   *   view.loadDecorators(exportData, {
   *     'hex-color': {
   *       extractData: hexColorPattern.extractData,
   *       createDecorator: hexColorPattern.createDecorator
   *     }
   *   });
   * }
   * ```
   */
  loadDecorators(
    data: DecoratorExportData,
    patternFunctions?: Record<string, {
      extractData: (match: RegExpMatchArray) => Record<string, any>;
      createDecorator: (
        nodeId: string,
        startOffset: number,
        endOffset: number,
        extractedData: Record<string, any>
      ) => {
        sid: string;
        target: {
          sid: string;
          startOffset: number;
          endOffset: number;
        };
        data?: Record<string, any>;
      };
    }>
  ): void {
    // 기존 decorator 모두 제거
    this.decoratorManager.clear();
    this.patternDecoratorConfigManager.clear();
    this.decoratorGeneratorManager.clear();
    
    // 일반 decorator 로드
    for (const decorator of data.targetDecorators) {
      this.decoratorManager.add({
        ...decorator,
        decoratorType: 'target'
      }); // 변환 없이 그대로 (stype 포함)
    }
    
    // 패턴 decorator 설정 로드
    for (const patternData of data.patternDecorators) {
      // patternFunctions에서 함수 찾기
      const functions = patternFunctions?.[patternData.sid];
      
      if (!functions) {
        console.warn(`[EditorViewDOM] Pattern decorator '${patternData.sid}' functions not provided. ` +
          `Please provide functions in patternFunctions parameter.`);
        continue;
      }
      
      // RegExp 재구성
      const pattern = new RegExp(patternData.pattern.source, patternData.pattern.flags);
      
      // Decorator 형식으로 변환하여 추가
      this.addDecorator({
        sid: patternData.sid,
        stype: patternData.stype,
        category: patternData.category,
        decoratorType: 'pattern',
        target: { sid: '' },
        data: {
          pattern,
          extractData: functions.extractData,
          createDecorator: functions.createDecorator,
          priority: patternData.priority
        },
        enabled: patternData.enabled
      });
    }
    
    // 재렌더링
    this.render();
  }

  /**
   * Generator 기반 decorator 생성 (내부 메서드)
   */
  private _generateGeneratorDecorators(model: ModelData): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 재귀적으로 모든 텍스트 노드를 찾아서 generator 실행
    const traverse = (node: ModelData): void => {
      const text = node.text && typeof node.text === 'string' ? node.text : null;
      const generatorDecorators = this.decoratorGeneratorManager.generateDecorators(
        node,
        text,
        { documentModel: model }
      );
      decorators.push(...generatorDecorators);
      
      // 자식 노드 재귀 처리
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };
    
    traverse(model);
    return decorators;
  }

  /**
   * Selection 기반으로 현재 편집 중인 노드의 sid 추출
   * skipNodes 기능을 위한 메서드
   */
  private _getEditingNodeSids(): Set<string> {
    const sids = new Set<string>();
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      return sids;
    }
    
    const range = selection.getRangeAt(0);
    
    // anchor/focus 노드에서 sid 추출
    const getSidFromNode = (node: Node): string | null => {
      let el: Element | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        el = node.parentElement;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        el = node as Element;
      }
      
      if (!el) return null;
      
      const foundEl = el.closest('[data-bc-sid]');
      return foundEl?.getAttribute('data-bc-sid') || null;
    };
    
    const startSid = getSidFromNode(range.startContainer);
    const endSid = getSidFromNode(range.endContainer);
    
    if (startSid) sids.add(startSid);
    if (endSid && endSid !== startSid) sids.add(endSid);
    
    return sids;
  }

  /**
   * 입력 시작 시점에 호출
   * 현재 Selection 기반으로 편집 중인 노드를 editingNodes에 추가
   */
  private _onInputStart(): void {
    const sids = this._getEditingNodeSids();
    sids.forEach(sid => {
      this._editingNodes.add(sid);
    });
  }

  /**
   * 입력 종료 시점에 호출
   * debounce 후 editingNodes에서 제거
   * 
   * 주의: 재렌더링은 하지 않음
   * - 입력 중에는 브라우저가 DOM을 직접 업데이트
   * - 우리는 모델만 업데이트 (skipRender: true)
   * - 입력이 끝난 후 재렌더링하면 selection과 충돌할 수 있음
   */
  private _onInputEnd(): void {
    // debounce: 입력 완료 후 일정 시간 대기
    if (this._inputEndDebounceTimer) {
      clearTimeout(this._inputEndDebounceTimer);
    }
    
    this._inputEndDebounceTimer = window.setTimeout(() => {
      // editingNodes 초기화
      this._editingNodes.clear();
      
      this._inputEndDebounceTimer = null;
    }, 500); // 500ms debounce
  }
}


