import { MutationObserverManager, MutationObserverOptions, DOMStructureChangeEvent, NodeUpdateEvent, TextChangeEvent } from './types';

/**
 * MutationObserver 관리자 구현체
 * 
 * DOM 변경사항을 감지하고 적절한 이벤트를 발생시키는 핵심 클래스
 * 
 * 주요 기능:
 * - DOM 구조 변경 감지 (노드 추가/제거)
 * - 텍스트 내용 변경 감지
 * - 속성 변경 감지
 * - data-bc-* 속성을 통한 의미있는 변경사항만 필터링
 * 
 * @class MutationObserverManagerImpl
 */
export class MutationObserverManagerImpl implements MutationObserverManager {
  private observer: MutationObserver | null = null;
  private contentEditableElement: HTMLElement | null = null;
  private eventHandlers: {
    onStructureChange?: (event: DOMStructureChangeEvent) => void;
    onNodeUpdate?: (event: NodeUpdateEvent) => void;
    onTextChange?: (event: TextChangeEvent) => void;
  } = {};

  constructor() {}

  /**
   * MutationObserver 설정
   * 
   * @param contentEditableElement - 감지할 contentEditable 요소
   * @param options - MutationObserver 옵션 (선택사항)
   */
  setup(contentEditableElement: HTMLElement, options?: MutationObserverOptions): void {
    this.contentEditableElement = contentEditableElement;
    
    const defaultOptions: MutationObserverOptions = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-bc-edit', 'data-bc-value', 'data-bc-sid', 'data-bc-stype'],
      characterDataOldValue: true,
      attributeOldValue: true,
      ...options
    };

    this.observer = new MutationObserver((mutations) => {
      // 디버깅: MutationObserver 콜백 호출 확인
      const characterDataMutations = mutations.filter(m => m.type === 'characterData');
      const childListMutations = mutations.filter(m => m.type === 'childList');
      
      // childList mutation에서 텍스트 노드 변경 확인
      const childListWithTextNodes = childListMutations.filter(m => {
        const hasTextNodes = Array.from(m.addedNodes).some(n => n.nodeType === Node.TEXT_NODE) ||
                             Array.from(m.removedNodes).some(n => n.nodeType === Node.TEXT_NODE);
        return hasTextNodes;
      });
      
      mutations.forEach((mutation) => {
        this.handleMutation(mutation);
      });
    });

    this.observer.observe(contentEditableElement, defaultOptions);
  }

  /**
   * MutationObserver 연결 해제
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.contentEditableElement = null;
  }

  /**
   * 개별 mutation 처리
   * 
   * @param mutation - 처리할 MutationRecord
   */
  handleMutation(mutation: MutationRecord): void {
    switch (mutation.type) {
      case 'childList':
        this.handleDOMStructureChange(mutation);
        break;
      case 'characterData':
        this.handleTextContentChange(mutation);
        break;
      case 'attributes':
        this.handleAttributeChange(mutation);
        break;
    }
  }

  /**
   * 이벤트 핸들러 등록
   * 
   * @param handlers - 이벤트 핸들러들
   */
  setEventHandlers(handlers: {
    onStructureChange?: (event: DOMStructureChangeEvent) => void;
    onNodeUpdate?: (event: NodeUpdateEvent) => void;
    onTextChange?: (event: TextChangeEvent) => void;
  }): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * DOM 구조 변경 처리
   * 
   * @param mutation - childList 타입의 MutationRecord
   */
  private handleDOMStructureChange(mutation: MutationRecord): void {
    const addedNodes = Array.from(mutation.addedNodes);
    const removedNodes = Array.from(mutation.removedNodes);

    // 텍스트 노드 변경 감지 (childList mutation에서 텍스트 노드가 추가/제거되는 경우)
    const textNodesAdded = addedNodes.filter(node => node.nodeType === Node.TEXT_NODE);
    const textNodesRemoved = removedNodes.filter(node => node.nodeType === Node.TEXT_NODE);
    
    // 텍스트 노드 변경이 있는 경우 텍스트 변경으로 처리
    if (textNodesAdded.length > 0 || textNodesRemoved.length > 0) {
      const target = mutation.target;
      const dataNode = this.findClosestDataNode(target);
      
      if (dataNode) {
        // 텍스트 변경 이벤트 생성
        const oldText = textNodesRemoved.map(n => n.textContent || '').join('');
        const newText = target.textContent || '';
        
        const event: TextChangeEvent = {
          oldText: oldText || undefined,
          newText: newText,
          target: target
        };
        
        this.eventHandlers.onTextChange?.(event);
      }
    }

    // 의미있는 노드만 필터링 (텍스트 노드 제외)
    const meaningfulAddedNodes = addedNodes.filter(node => 
      node.nodeType === Node.ELEMENT_NODE && 
      (node as Element).hasAttribute('data-bc-sid')
    );

    const meaningfulRemovedNodes = removedNodes.filter(node => 
      node.nodeType === Node.ELEMENT_NODE && 
      (node as Element).hasAttribute('data-bc-sid')
    );

    if (meaningfulAddedNodes.length > 0 || meaningfulRemovedNodes.length > 0) {
      const event: DOMStructureChangeEvent = {
        type: 'structure',
        addedNodes: meaningfulAddedNodes,
        removedNodes: meaningfulRemovedNodes,
        target: mutation.target
      };

      this.eventHandlers.onStructureChange?.(event);
    }
  }

  /**
   * 텍스트 내용 변경 처리
   * 
   * @param mutation - characterData 타입의 MutationRecord
   */
  private handleTextContentChange(mutation: MutationRecord): void {
    const target = mutation.target;
    
    // 디버깅: handleTextContentChange 호출 확인
    // 텍스트 입력 시점 확인: oldText와 newText가 다르면 사용자 입력
    const isUserInput = mutation.oldValue !== target.textContent;
    
    // data-bc-sid 속성을 가진 요소의 텍스트 변경만 처리
    const dataNode = this.findClosestDataNode(target);
    
    if (!dataNode) {
      return;
    }

    const event: TextChangeEvent = {
      oldText: mutation.oldValue,
      newText: target.textContent,
      target: target
    };

    this.eventHandlers.onTextChange?.(event);
  }

  /**
   * 속성 변경 처리
   * 
   * @param mutation - attributes 타입의 MutationRecord
   */
  private handleAttributeChange(mutation: MutationRecord): void {
    const target = mutation.target as Element;
    const attributeName = mutation.attributeName;
    
    if (!attributeName) return;

    // data-bc-* 속성 변경만 처리
    if (!attributeName.startsWith('data-bc-')) return;

    const event: NodeUpdateEvent = {
      type: 'attribute',
      attributeName,
      oldValue: mutation.oldValue,
      newValue: target.getAttribute(attributeName),
      target: target,
      nodeId: target.getAttribute('data-bc-sid')
    };

    this.eventHandlers.onNodeUpdate?.(event);
  }

  /**
   * 가장 가까운 data-bc-sid 속성을 가진 요소 찾기
   * 
   * @param node - 시작할 노드
   * @returns data-bc-sid 속성을 가진 가장 가까운 요소 또는 null
   */
  private findClosestDataNode(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.hasAttribute('data-bc-sid')) {
        return element;
      }
    }

    // 부모 요소에서 data-bc-sid 찾기
    let current = node.parentElement;
    const parentChain: Array<{ tag: string; sid: string | null; hasAttr: boolean }> = [];
    while (current) {
      const sid = current.getAttribute('data-bc-sid');
      const hasAttr = current.hasAttribute('data-bc-sid');
      parentChain.push({ tag: current.tagName, sid, hasAttr });
      if (sid) {
        return current;
      }
      current = current.parentElement;
    }

    // 실제 DOM에서 data-bc-sid 확인
    let currentForDebug = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const actualDomChain: Array<{ tag: string; sid: string | null; hasAttr: boolean }> = [];
    while (currentForDebug && actualDomChain.length < 10) {
      const sid = currentForDebug.getAttribute('data-bc-sid');
      actualDomChain.push({
        tag: currentForDebug.tagName,
        sid,
        hasAttr: currentForDebug.hasAttribute('data-bc-sid')
      });
      currentForDebug = currentForDebug.parentElement;
    }


    return null;
  }
}
