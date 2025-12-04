import { MutationObserverManager } from '../types';
import { Editor } from '@barocss/editor-core';
import { InputHandlerImpl } from '../event-handlers/input-handler';
import { MutationObserverManagerImpl as BaseMutationObserverManager } from '@barocss/dom-observer';

export class MutationObserverManagerImpl implements MutationObserverManager {
  private editor: Editor;
  private inputHandler: InputHandlerImpl;
  private baseManager: BaseMutationObserverManager;
  private observer: MutationObserver | null = null;
  private pendingMutations: MutationRecord[] = [];
  private mutationTimer: number | null = null;

  constructor(editor: Editor, inputHandler: InputHandlerImpl) {
    this.editor = editor;
    this.inputHandler = inputHandler;
    this.baseManager = new BaseMutationObserverManager();
    
    // 이벤트 핸들러 설정
    this.baseManager.setEventHandlers({
      onStructureChange: (event) => {
        this.editor.emit('editor:node.change', event);
      },
      onNodeUpdate: (event) => {
        this.editor.emit('editor:node.update', event);
      },
      onTextChange: (event) => {
        console.log('[MO] onTextChange: CALLED', { oldText: event.oldText, newText: event.newText, targetNodeType: event.target.nodeType });
        
        // 주의: handleDomMutations가 우선 처리하므로,
        // onTextChange는 handleDomMutations가 처리하지 못한 경우에만 fallback으로 사용
        // 현재는 handleDomMutations가 모든 characterData 변경을 처리하므로,
        // onTextChange는 비활성화하거나 최소한의 로깅만 수행
        
        // TODO: handleDomMutations로 완전히 마이그레이션되면 이 경로는 제거 가능
        console.log('[MO] onTextChange: SKIP - handled by handleDomMutations');
        
        // 기존 로직은 주석 처리 (필요시 fallback으로 활성화 가능)
        /*
        // 현재 selection의 anchorNode와 같은 노드의 변경만 처리
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          console.log('[MO] onTextChange: SKIP - no selection');
          return;
        }
        
        const anchorNode = selection.anchorNode;
        if (!anchorNode) {
          console.log('[MO] onTextChange: SKIP - no anchorNode');
          return;
        }
        
        // event.target이 selection.anchorNode와 같을 때만 처리
        if (event.target !== anchorNode) {
          console.log('[MO] onTextChange: SKIP - target !== anchorNode', { 
            targetNodeType: event.target.nodeType,
            anchorNodeType: anchorNode.nodeType,
            targetIsSame: event.target === anchorNode
          });
          return;
        }
        
        console.log('[MO] onTextChange: PROCESSING - calling handleTextContentChange');
        await this.inputHandler.handleTextContentChange(event.oldText, event.newText, event.target);
        */
      }
    });
  }

  setup(contentEditableElement: HTMLElement): void {
    // BaseMutationObserverManager도 설정 (기존 호환성 유지)
    this.baseManager.setup(contentEditableElement);

    // handleDomMutations를 위한 MutationObserver 직접 설정
    this.observer = new MutationObserver((mutations) => {
      console.log('[MO] MutationObserver callback: mutations received', {
        count: mutations.length,
        types: mutations.map(m => m.type)
      });

      // mutations를 배치로 수집
      this.pendingMutations.push(...mutations);

      // 짧은 지연 후 배치 처리 (동일한 이벤트 루프의 모든 mutations 수집)
      if (this.mutationTimer) {
        clearTimeout(this.mutationTimer);
      }

      this.mutationTimer = window.setTimeout(() => {
        if (this.pendingMutations.length > 0) {
          console.log('[MO] Processing batched mutations', {
            count: this.pendingMutations.length
          });

          // handleDomMutations 호출
          if (this.inputHandler.handleDomMutations) {
            this.inputHandler.handleDomMutations([...this.pendingMutations]);
          }

          this.pendingMutations = [];
        }
        this.mutationTimer = null;
      }, 0);
    });

    // MutationObserver 옵션 설정
    this.observer.observe(contentEditableElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-bc-edit', 'data-bc-value', 'data-bc-sid', 'data-bc-stype'],
      characterDataOldValue: true,
      attributeOldValue: true
    });
  }

  disconnect(): void {
    this.baseManager.disconnect();
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.mutationTimer) {
      clearTimeout(this.mutationTimer);
      this.mutationTimer = null;
    }

    this.pendingMutations = [];
  }

  handleMutation(mutation: MutationRecord): void {
    this.baseManager.handleMutation(mutation);
  }
}
