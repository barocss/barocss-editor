import { VNode } from './vnode/types';
import { DOMWorkInProgress } from './work-in-progress';
import { DOMOperations } from './dom-operations';
// Note: decoupled from external reconciler; operates with LocalReconciler context shape

/**
 * DOM 처리 클래스
 * 텍스트 노드, 엘리먼트 노드, 텍스트 콘텐츠 처리 및 DOM 노드 찾기 기능을 담당
 */
export class DOMProcessor {
  private currentContainer: HTMLElement | null = null;
  // Optional per-frame SID → DOM index for fast lookup
  private sidDomIndex?: Map<string, HTMLElement>;

  constructor(
    private domOperations: DOMOperations
  ) {}

  // DOMReconcile dependency removed

  /**
   * Inject a per-frame sid→DOM index map to speed up matching.
   */
  public setSidDomIndex(map: Map<string, HTMLElement> | undefined): void {
    this.sidDomIndex = map;
  }

  /**
   * 현재 컨테이너 설정
   */
  public setCurrentContainer(container: HTMLElement | null): void {
    this.currentContainer = container;
  }

  /**
   * 텍스트 노드 처리
   */
  public processTextNode(wip: DOMWorkInProgress): void {
    const { vnode, domNode, changes } = wip;

    if (changes.includes('insert')) {
      // 새 텍스트 노드 생성
      const textNode = document.createTextNode(String(vnode.text));
      wip.domNode = textNode;
      this.domOperations.insertDOMNode(textNode, wip, this.currentContainer as HTMLElement);
    } else if (changes.includes('text')) {
      // 기존 텍스트 노드 업데이트
      // text node는 부모의 DOM 구조에서 위치로 찾음
      let targetNode = domNode;
      
      if (!targetNode && wip.previousVNode) {
        // 부모가 있으면 부모의 자식에서 찾기
        if (wip.parent?.domNode) {
          const parentDomNode = wip.parent.domNode;
          if (parentDomNode instanceof Node) {
            const childNodes = Array.from(parentDomNode.childNodes);
            for (const node of childNodes) {
              if (node.nodeType === Node.TEXT_NODE && node.textContent === String(wip.previousVNode.text)) {
                targetNode = node;
                break;
              }
            }
          }
        } else if (this.currentContainer) {
          // 부모가 없으면 컨테이너의 직접 자식에서 찾기
          const childNodes = Array.from(this.currentContainer.childNodes);
          for (const node of childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent === String(wip.previousVNode.text)) {
              targetNode = node;
              break;
            }
          }
        }
      }
      
      if (targetNode) {
        if (targetNode.nodeType === Node.TEXT_NODE) {
          targetNode.textContent = String(vnode.text);
          wip.domNode = targetNode;
        } else if (targetNode instanceof HTMLElement) {
          // Element의 textContent를 업데이트
          targetNode.textContent = String(vnode.text);
          wip.domNode = targetNode;
        }
      }
    }
  }

  /**
   * 엘리먼트 노드 처리
   */
  public processElementNode(wip: DOMWorkInProgress): void {
    // Normalize vnode: if both text and children exist, move text into children
    wip.vnode = this.normalizeVNode(wip.vnode);
    const { vnode, domNode, changes } = wip;
    
    // Use targetNode from Build Phase if available (set by findTargetNode)
    // This is especially important for root nodes and nodes that should reuse existing DOM
    // Note: convertToDOMWIP sets domNode = wip.targetNode, so checking both
    if (!wip.domNode) {
      // Check targetNode from original WIP (before conversion)
      const originalWip = (wip as any)._originalWip;
      if (originalWip?.targetNode) {
        wip.domNode = originalWip.targetNode;
        
      } else if ((wip as any).targetNode) {
        wip.domNode = (wip as any).targetNode;
        
      }
    }
    
    
    
    // If domNode is still not set and this is not a new node, try to find existing DOM node
    // This is important for children-only updates and other non-insert changes
    // Also important for root nodes that should reuse existing DOM
    if (!wip.domNode && !changes.includes('insert') && wip.previousVNode) {
      // Ensure currentContainer is set
      if (!this.currentContainer && (wip as any).context?.container) {
        this.currentContainer = (wip as any).context.container;
      }
      
      // For child nodes: if parent DOM exists and previousVNode exists, use index-based matching
      // This ensures same-index elements are reused even when content changes
      if (wip.parent?.domNode && wip.parent.domNode instanceof HTMLElement && 
          wip.parent.vnode?.children && wip.parent.previousVNode?.children) {
        const parentDomNode = wip.parent.domNode as HTMLElement;
        const currentIndex = Array.isArray(wip.parent.vnode.children) 
          ? (wip.parent.vnode.children as VNode[]).findIndex(c => c === wip.vnode)
          : -1;
        
        if (currentIndex >= 0) {
          const elementNodes = Array.from(parentDomNode.children).filter(
            node => node.nodeType === Node.ELEMENT_NODE
          ) as HTMLElement[];
          
          if (currentIndex < elementNodes.length) {
            const candidate = elementNodes[currentIndex];
            const tagName = wip.vnode.tag;
            if (candidate && (!tagName || candidate.tagName.toLowerCase() === tagName.toLowerCase())) {
              wip.domNode = candidate;
              const insertIndex = changes.indexOf('insert');
              if (insertIndex >= 0) {
                changes.splice(insertIndex, 1);
              }
            }
          }
        }
      }
      
      // Fallback to findExistingDOMNodeInContainer
      if (!wip.domNode) {
        const existingNode = this.findExistingDOMNodeInContainer(wip);
        if (existingNode) {
          wip.domNode = existingNode;
        }
      }
    }
    
    // For root nodes specifically, ensure domNode is found to prevent duplicate creation
    // Root nodes with same sid should reuse existing DOM element
    if (!wip.domNode && !wip.parent && wip.previousVNode) {
      // Ensure currentContainer is set
      if (!this.currentContainer && (wip as any).context?.container) {
        this.currentContainer = (wip as any).context.container;
      }
      
      // Try findExistingDOMNodeInContainer first (sid-based matching)
      const existingNode = this.findExistingDOMNodeInContainer(wip);
      if (existingNode) {
        wip.domNode = existingNode;
        // If we found existing node with same sid, this is an update, not insert
        // Remove 'insert' from changes if it was added
        const insertIndex = changes.indexOf('insert');
        if (insertIndex >= 0) {
          changes.splice(insertIndex, 1);
        }
      } else {
        // Fallback: try to find root node directly from context.container by sid
        if ((wip as any).context?.container) {
          const container = (wip as any).context.container as HTMLElement;
          const desiredSid = (wip.vnode?.attrs && (wip.vnode.attrs as any)['data-bc-sid'])
            || (wip.previousVNode?.attrs && (wip.previousVNode.attrs as any)['data-bc-sid']);
          
          if (desiredSid) {
            // Try to find by sid first
            const bySid = Array.from(container.children).find((el) =>
              (el as HTMLElement).getAttribute('data-bc-sid') === String(desiredSid)
            ) as HTMLElement | undefined;
            if (bySid) {
              wip.domNode = bySid;
              const insertIndex = changes.indexOf('insert');
              if (insertIndex >= 0) {
                changes.splice(insertIndex, 1);
              }
            }
          }
          
          // Fallback to tag-based matching
          if (!wip.domNode) {
            const tagName = wip.previousVNode?.tag || wip.vnode.tag;
            if (tagName) {
              const directChildren = Array.from(container.children) as HTMLElement[];
              for (const child of directChildren) {
                if (child.tagName.toLowerCase() === tagName.toLowerCase()) {
                  wip.domNode = child;
                  const insertIndex = changes.indexOf('insert');
                  if (insertIndex >= 0) {
                    changes.splice(insertIndex, 1);
                  }
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    if (changes.includes('insert')) {
      // 새 엘리먼트 생성 (wip.domNode가 없을 때만)
      if (!wip.domNode) {
        const element = this.domOperations.createElement(vnode);
        wip.domNode = element;
        this.domOperations.insertDOMNode(element, wip, this.currentContainer as HTMLElement);
        
        // 텍스트 콘텐츠 처리 (children이 없을 때만)
        // children이 있으면 Build Phase에서 처리되므로 여기서는 건너뜀
        if (!vnode.children || (vnode.children as any[]).length === 0) {
          this.processTextContent(vnode, element);
        }
        // Fallback: If children exist but have not been appended by the Build/Execute phase yet,
        // ensure initial children are present to avoid missing slot items on first render.
        // This only runs when the element has no childNodes right after creation.
        if (vnode.children && vnode.children.length > 0 && element.childNodes.length === 0) {
          for (const child of vnode.children) {
            if (typeof child === 'object' && child !== null) {
              const node = this.domOperations.vnodeToDOM(child as any, element as HTMLElement);
              element.appendChild(node);
            } else if (typeof child === 'string' || typeof child === 'number') {
              element.appendChild(document.createTextNode(String(child)));
            }
          }
        }
      }
      
      // Children 처리:
      // All children (keyed, unkeyed, string, VNode) are now handled in Build Phase
      // Build Phase creates child WIPs using ChildrenReconciler
      // Process Phase will automatically call onWIPProcess for each child WIP
      // Execute Phase will finalize DOM tree structure
      // No need to call updateChildren here - it would cause infinite loops and duplicate processing
    } else if (changes.includes('tag')) {
      // 태그 변경: 기존 DOM 노드를 새 태그의 element로 교체
      
      // 기존 DOM 노드 찾기
      const existingNode = domNode || this.findExistingDOMNodeInContainer(wip);
      
      // element에서 text node로 변경되는 경우
      if (wip.previousVNode?.tag && !vnode.tag && vnode.text !== undefined) {
        
        if (existingNode && existingNode.parentNode) {
          const textNode = document.createTextNode(String(vnode.text));
          const parent = existingNode.parentNode;
          
          parent.replaceChild(textNode, existingNode);
          wip.domNode = textNode;
          
        } else {}
        return;
      }
      
      if (existingNode && existingNode instanceof HTMLElement && existingNode.parentNode) {
        // 새 element 생성
        const newElement = this.domOperations.createElement(vnode);
        
        // 기존 element의 내용을 새 element로 이동
        while (existingNode.firstChild) {
          newElement.appendChild(existingNode.firstChild);
        }
        
        // 기존 element를 새 element로 교체
        existingNode.parentNode.replaceChild(newElement, existingNode);
        
        // wip.domNode를 새 element로 설정
        wip.domNode = newElement;
        
        // 텍스트 콘텐츠 처리
        this.processTextContent(vnode, newElement);
      } else {
        // 기존 노드를 찾을 수 없으면 새로 생성
        const element = this.domOperations.createElement(vnode);
        wip.domNode = element;
        this.domOperations.insertDOMNode(element, wip, this.currentContainer as HTMLElement);
        this.processTextContent(vnode, element);
      }
    } else if (changes.includes('text')) {
      // Find existing domNode
      const targetDomNode = domNode || this.findExistingDOMNodeInContainer(wip);
      
      // Use targetDomNode as HTMLElement if it's not null
      if (targetDomNode && targetDomNode instanceof Node) {
        const htmlElement = targetDomNode instanceof HTMLElement ? targetDomNode : targetDomNode as any;
        
        // Update text content using textContent property directly
        // Always update text, even if parent is reconciling children
        // The text update is independent of children reconciliation
        // Check if text changed: either vnode.text is explicitly set (including empty string),
        // or vnode.text is undefined but previousVNode had text (text was removed)
        if (vnode.text !== undefined) {
          const expectedText = String(vnode.text);
          // 변경된 경우에만 업데이트 (MutationObserver 과다 실행 방지)
          if (htmlElement.textContent !== expectedText) {
            htmlElement.textContent = expectedText;
          }
        } else if (wip.previousVNode?.text !== undefined) {
          // Text was removed (changed to undefined/null) - clear textContent
          // 변경된 경우에만 업데이트 (MutationObserver 과다 실행 방지)
          if (htmlElement.textContent !== '') {
          htmlElement.textContent = '';
          }
        }
        
        // Set domNode in wip if not already set
        if (!domNode) {
          wip.domNode = targetDomNode;
        }
      }
    }
    
    // Always check for text updates, even if 'text' is not in changes
    // This is important for reused nodes where text may have changed
    // Handle both explicit text value (including empty string) and text removal (undefined)
    if (wip.domNode && wip.domNode instanceof HTMLElement) {
      // Check if text needs updating: vnode.text !== undefined (including empty string) or text was removed
      const needsTextUpdate = vnode.text !== undefined || 
                              (vnode.text === undefined && wip.previousVNode?.text !== undefined && 
                               (!vnode.children || vnode.children.length === 0));
      
      if (needsTextUpdate) {
        // Avoid writing text to a container whose tag does not match vnode.tag (e.g., component host)
        if (!vnode.tag || (wip.domNode as HTMLElement).tagName.toLowerCase() === vnode.tag.toLowerCase()) {
          const currentText = (wip.domNode as HTMLElement).textContent;
          const expectedText = vnode.text !== undefined ? String(vnode.text) : '';
          if (currentText !== expectedText) {
            (wip.domNode as HTMLElement).textContent = expectedText;
          }
        }
      }
    }
    
    if (changes.includes('attrs') || changes.includes('attributes') || changes.includes('style')) {
      // domNode가 없으면 컨테이너에서 찾기
      const targetDomNode = domNode || this.findExistingDOMNodeInContainer(wip);
      
      if (targetDomNode && targetDomNode instanceof Node) {
        const htmlElement = targetDomNode instanceof HTMLElement ? targetDomNode : targetDomNode as any;
        // 속성 업데이트
        if (changes.includes('attrs') || changes.includes('attributes')) {
          const prevAttrs = wip.previousVNode?.attrs || {};
          const nextAttrs = vnode.attrs || {};
          
          // 변경된 속성만 추출 (null/undefined는 제거를 의미)
          const changedAttrs: Record<string, any> = {};
          const allKeys = new Set([...Object.keys(prevAttrs), ...Object.keys(nextAttrs)]);
          
          for (const key of allKeys) {
            if (prevAttrs[key] !== nextAttrs[key]) {
              // nextAttrs에 key가 없으면 undefined를 설정하여 제거를 나타냄
              changedAttrs[key] = (nextAttrs as any).hasOwnProperty(key) ? (nextAttrs as any)[key] : undefined;
            }
          }
          
          this.domOperations.updateAttributesWithRemoval(htmlElement, changedAttrs);
        }
        
        // 스타일 업데이트
        if (changes.includes('style')) {
          const prevStyles = wip.previousVNode?.style || {};
          const nextStyles = vnode.style || {};
          
          // 제거할 스타일과 추가/업데이트할 스타일을 분리
          const allStyleKeys = new Set([...Object.keys(prevStyles), ...Object.keys(nextStyles)]);
          
          // 제거할 스타일 (prev에는 있지만 next에는 없음)
          for (const key of allStyleKeys) {
            if (!(key in nextStyles)) {
              const cssProperty = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
              (htmlElement as HTMLElement).style.removeProperty(cssProperty);
            }
          }
          
          // 추가/업데이트할 스타일
          this.domOperations.updateStyles(htmlElement, nextStyles);
        }
        
        // domNode를 wip에 설정
        if (!domNode) {
          wip.domNode = targetDomNode;
        }
      }
    }

    // Unconditional attribute/style sync to ensure updates apply when change flags are not computed
    if (wip.domNode && wip.domNode instanceof HTMLElement) {
      const htmlElement = wip.domNode as HTMLElement;
      const nextAttrs = vnode.attrs || {};
      this.domOperations.updateAttributesWithRemoval(htmlElement, nextAttrs as any);
      const nextStyles = vnode.style || {};
      this.domOperations.updateStyles(htmlElement, nextStyles as any);
    }

    // 컴포넌트 변경 처리는 ComponentManager 경로에서 수행되므로 여기서는 처리하지 않음
    
    // Children 처리:
    // All children (keyed, unkeyed, string, VNode) are now handled in Build Phase by WorkInProgressManager
    // Build Phase creates child WIPs using ChildrenReconciler
    // Process Phase will automatically call onWIPProcess for each child WIP
    // Execute Phase will finalize DOM tree structure
    // No need to call updateChildren here - it would cause infinite loops and duplicate processing

    // Children DOM structure is finalized in Execute Phase by DOMReconcile operations.
    // Avoid forcing child replacement here to prevent duplicate/missing nodes.
  }

  /**
   * 컨테이너에서 기존 DOM 노드 찾기
   * 위치 기반 매칭만 사용 (key는 VNode 매칭용이며 DOM에는 저장 안 함)
   */
  public findExistingDOMNodeInContainer(wip: DOMWorkInProgress): Node | null {
    if (!this.currentContainer) return null;
    const safeEscape = (v: string) => {
      try {
        // @ts-ignore
        if (typeof CSS !== 'undefined' && CSS && typeof (CSS as any).escape === 'function') {
          // @ts-ignore
          return (CSS as any).escape(v);
        }
      } catch {}
      return String(v).replace(/[^a-zA-Z0-9_\-:\.]/g, '_');
    };
    
    const tagName = wip.previousVNode?.tag || wip.vnode.tag;
    // Prefer matching by data-bc-sid when available
    const desiredSid = (wip.vnode?.attrs && (wip.vnode.attrs as any)['data-bc-sid'])
      || (wip.previousVNode?.attrs && (wip.previousVNode.attrs as any)['data-bc-sid']);
    
    if (!tagName) return null;
    // 0) Fast path via sidDomIndex (if provided)
    if (desiredSid && this.sidDomIndex) {
      const hit = this.sidDomIndex.get(String(desiredSid));
      if (hit && hit.tagName.toLowerCase() === tagName.toLowerCase()) {
        return hit;
      }
    }
    
    // 위치 기반 매칭: parent가 있으면 parent 내에서 찾기
    if (wip.parent?.domNode && wip.parent.domNode instanceof HTMLElement) {
      const parentDomNode = wip.parent.domNode;
      // 1) Try SID-first within parent direct children
      if (desiredSid) {
        const bySid = Array.from(parentDomNode.children).find((el) =>
          (el as HTMLElement).getAttribute('data-bc-sid') === String(desiredSid)
        ) as HTMLElement | undefined;
        if (bySid && bySid.tagName.toLowerCase() === tagName.toLowerCase()) {
          return bySid;
        }
      }
      
      const childNodes = Array.from(parentDomNode.childNodes);
      const elementNodes = childNodes.filter(node => node.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
      
      // 무키(unkeyed) 형제의 인덱스 기반 매칭: vnode.children에서 현재 vnode의 위치를 사용
      // wip.parent.children에 접근하면 lazy conversion이 트리거되어 무한 루프가 발생할 수 있으므로
      // 대신 vnode.children에서 현재 vnode를 찾습니다
      let siblingIndex = -1;
      if (wip.parent?.vnode?.children) {
        const parentVNodeChildren = wip.parent.vnode.children;
        for (let i = 0; i < parentVNodeChildren.length; i++) {
          const child = parentVNodeChildren[i];
          if (child && typeof child === 'object' && 'tag' in child) {
            const childVNode = child as VNode;
            // Match by sid first, then by tag + index (for same parent, same index = same element)
            const childSid = (childVNode.attrs as any)?.['data-bc-sid'];
            const currentSid = (wip.vnode.attrs as any)?.['data-bc-sid'];
            if (currentSid && childSid === currentSid) {
              siblingIndex = i;
              break;
            } else if (childVNode.tag === wip.vnode.tag && 
                (childVNode.text === wip.vnode.text || 
                 (childVNode.attrs?.['data-bc-sid'] === wip.vnode.attrs?.['data-bc-sid']))) {
              siblingIndex = i;
              break;
            }
          }
        }
        // Fallback: if no match by sid/text, use previousVNode's index from parent's previous children
        // This ensures same-index, same-tag elements are reused even when text changes
        if (siblingIndex < 0 && wip.previousVNode && wip.parent?.previousVNode && tagName) {
          const prevParentChildren = Array.isArray(wip.parent.previousVNode.children) 
            ? (wip.parent.previousVNode.children as VNode[]) 
            : [];
          const prevIndex = prevParentChildren.findIndex((c: any) => 
            c === wip.previousVNode || 
            (c && typeof c === 'object' && 'tag' in c && 
             (c as VNode).tag === tagName && 
             (c as VNode).tag === wip.previousVNode?.tag)
          );
          if (prevIndex >= 0 && prevIndex < elementNodes.length) {
            siblingIndex = prevIndex;
          }
        }
      }
      if (siblingIndex >= 0 && siblingIndex < elementNodes.length) {
        const nodeAtIndex = elementNodes[siblingIndex];
        if (nodeAtIndex && nodeAtIndex.tagName.toLowerCase() === tagName) {
          return nodeAtIndex;
        }
      }
      
      // 인덱스 매칭이 실패했을 때: SID가 지정된 경우 잘못된 형제 재사용을 피한다
      // 2) If SID existed but not found among direct children, try descendant search once
      if (desiredSid) {
        const desc = parentDomNode.querySelector(`[data-bc-sid="${safeEscape(String(desiredSid))}"]`);
        if (desc && (desc as HTMLElement).tagName.toLowerCase() === tagName.toLowerCase()) {
          return desc as HTMLElement;
        }
        // Force creation for this child to avoid clobbering existing siblings
        return null;
      }
      for (const element of elementNodes) {
        if (element.tagName.toLowerCase() === tagName) {
          return element;
        }
      }
    } else {
      // root 요소인 경우 container에서 직접 찾기
      const childNodes = Array.from(this.currentContainer.childNodes);
      const elementNodes = childNodes.filter(node => node.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
      // 1) Try SID-first among container direct children
      if (desiredSid) {
        const bySid = elementNodes.find((el) => (el as HTMLElement).getAttribute('data-bc-sid') === String(desiredSid));
        if (bySid && bySid.tagName.toLowerCase() === tagName.toLowerCase()) {
          return bySid;
        }
      }
      
      // 동일한 tagName을 가진 첫 번째 element 반환
      for (const element of elementNodes) {
        if (element.tagName.toLowerCase() === tagName) {
          return element;
        }
      }
      // 2) As a last resort, descendant SID lookup (root scope)
      if (desiredSid) {
        const desc = this.currentContainer.querySelector(`[data-bc-sid="${safeEscape(String(desiredSid))}"]`);
        if (desc && (desc as HTMLElement).tagName.toLowerCase() === tagName.toLowerCase()) {
          return desc;
        }
        // Avoid reusing arbitrary node when SID is specified
        return null;
      }
    }
    
    return null;
  }

  /**
   * 기존 DOM 노드 찾기
   */
  public findExistingDOMNode(wip: DOMWorkInProgress): Node | null {
    // 부모 DOM 노드에서 해당 태그의 요소를 찾기
    if (wip.parent?.domNode && wip.parent.domNode instanceof HTMLElement) {
      const parent = wip.parent.domNode as HTMLElement;
      const tagName = wip.vnode.tag?.toLowerCase();
      if (tagName) {
        // 같은 태그의 요소들을 찾아서 텍스트 내용으로 매칭
        const elements = parent.querySelectorAll(tagName);
        for (const element of elements) {
          if (element.textContent === wip.previousVNode?.text) {
            return element;
          }
        }
        // 텍스트로 매칭되지 않으면 첫 번째 요소 반환
        const firstElement = elements[0] || null;
        return firstElement;
      }
    }
    return null;
  }

  /**
   * 텍스트 콘텐츠 처리
   * Note: This should only set textContent when there are no children at all, or only text children.
   * If text was normalized into children, DO NOT set textContent - children reconcile will create text nodes.
   */
  public processTextContent(vnode: VNode, domNode: HTMLElement): void {
    // If vnode has any VNode children (elements), never set textContent - children reconcile will handle it
    const hasVNodeChildren = vnode.children && vnode.children.some((c: any) => c && typeof c === 'object' && (c as VNode).tag);
    if (hasVNodeChildren) {
      return; // Children reconcile will handle both VNode and text children
    }

    // Only set textContent if:
    // 1. vnode.text is directly present AND no children exist, OR
    // 2. children are all text strings/numbers (text-only children, no elements)
    if (vnode.text !== undefined && (!vnode.children || vnode.children.length === 0)) {
      // Direct text property with no children - safe to set textContent
      const textContent = String(vnode.text);
      if (domNode.textContent !== textContent) {
        domNode.textContent = textContent;
      }
    } else if (vnode.children && vnode.children.length > 0 && 
               vnode.children.every(c => typeof c === 'string' || typeof c === 'number')) {
      // All children are text - join them and set textContent
      const textContent = vnode.children.map(c => String(c)).join('');
      if (domNode.textContent !== textContent) {
        domNode.textContent = textContent;
      }
    }
    // If text was normalized into children (vnode.text is undefined but children[0] is text),
    // do nothing - Build Phase will create text nodes for string children
  }




  /**
   * Normalize a VNode so that when both text and children are present,
   * text is moved into children (as the first child) and text is cleared.
   */
  private normalizeVNode(node: VNode): VNode {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (node.text !== undefined && hasChildren) {
      const first = String(node.text);
      const children = [first as unknown as any, ...node.children!];
      return { ...(node as any), text: undefined, children } as VNode;
    }
    return node;
  }


  /**
   * 속성 업데이트
   */
  public updateAttributes(element: HTMLElement, attrs: Record<string, any>): void {
    this.domOperations.updateAttributes(element, attrs);
  }

  /**
   * 스타일 업데이트
   */
  public updateStyles(element: HTMLElement, styles: Record<string, any>): void {
    this.domOperations.updateStyles(element, styles);
  }

  /**
   * DOM 노드 삽입
   */
  public insertDOMNode(node: Node, wip: DOMWorkInProgress, container?: HTMLElement): void {
    this.domOperations.insertDOMNode(node, wip, container);
  }
}

