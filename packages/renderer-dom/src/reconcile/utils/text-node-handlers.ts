import { VNode } from '../../vnode/types';
import { logger, LogCategory } from '../../utils/logger';

/**
 * Handle VNode.text property when VNode has text but no children
 * 
 * This happens when a single text child is collapsed to vnode.text in VNodeBuilder.
 * In this case, we render the text directly to the parent element without creating
 * intermediate VNodes.
 * 
 * @param parent - Parent DOM element to render text into
 * @param nextVNode - VNode with text property
 * @param prevVNode - Previous VNode for comparison (to reuse existing text node)
 * @returns true if text was handled and function should return early
 */
export function handleVNodeTextProperty(
  parent: HTMLElement,
  nextVNode: VNode,
  prevVNode: VNode | undefined
): boolean {
  // Only handle if vnode has text and no children
  if (nextVNode.text === undefined || (nextVNode.children && nextVNode.children.length > 0)) {
    return false;
  }

  const doc = parent.ownerDocument || document;
  
  // Check if there's an existing text node
  // IMPORTANT: 모든 childNodes를 확인하여 텍스트 노드를 찾아야 함
  // (다른 요소가 있을 수 있으므로 firstChild만 확인하면 안 됨)
  const existingTextNode = Array.from(parent.childNodes).find(
    node => node.nodeType === Node.TEXT_NODE
  ) as Text | undefined;
  
  const expectedText = String(nextVNode.text);
  
  if (existingTextNode) {
    // Update existing text node (only if content changed - prevents excessive MutationObserver triggers)
    if (existingTextNode.textContent !== expectedText) {
      logger.debug(LogCategory.RECONCILE, 'handleVNodeTextProperty: updating existing text node', {
        before: existingTextNode.textContent,
        after: expectedText,
        vnodeSid: nextVNode.sid
      });
      existingTextNode.textContent = expectedText;
    }
    // 다른 자식 요소가 있으면 제거 (text-only 모드)
    const otherChildren = Array.from(parent.childNodes).filter(node => node !== existingTextNode);
    for (const child of otherChildren) {
      try {
        parent.removeChild(child);
      } catch {
        // 이미 제거되었을 수 있음
      }
    }
  } else {
    // Remove all children and create new text node
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }
    parent.appendChild(doc.createTextNode(expectedText));
  }
  
  return true; // Text handled, should return early
}

/**
 * Handle primitive text child (string or number)
 * 
 * Primitive text children are rendered as Text nodes. We try to reuse
 * existing text node at the correct position if available, otherwise create a new one.
 * 
 * @param parent - Parent DOM element
 * @param child - String or number to render
 * @param childIndex - Index where this child should be positioned (optional, for position-aware handling)
 * @returns The Text node that was created or updated
 */
export function handlePrimitiveTextChild(
  parent: HTMLElement,
  child: string | number,
  childIndex?: number,
  usedTextNodes?: Set<Text>
): Text {
  const doc = parent.ownerDocument || document;
  const expectedText = String(child);
  
  // If childIndex is provided, use position-aware handling (similar to handleTextOnlyVNode)
  // childIndex는 VNode children 배열에서의 인덱스
  // VNode children과 DOM childNodes는 같은 순서이므로, childIndex를 그대로 사용할 수 있음
  // 단, VNode children: [text0, element0, text1, element1, ...]
  // DOM childNodes: [Text(text0), Element(element0), Text(text1), Element(element1), ...]
  // 따라서 childIndex 위치의 node가 text node인지 확인하고, 아니면 그 위치에 삽입
  if (childIndex !== undefined) {
    const childNodes = Array.from(parent.childNodes);
    let textNodeToUse: Text | null = null;
    
    // childIndex 위치에 text node가 있는지 확인
    logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: start', {
      parentTag: parent.tagName,
      child,
      childIndex,
      childNodeCount: childNodes.length
    });
    if (childIndex < childNodes.length) {
      const nodeAtIndex = childNodes[childIndex];
      if (nodeAtIndex && nodeAtIndex.nodeType === Node.TEXT_NODE) {
        const textNode = nodeAtIndex as Text;
        // 이미 사용된 텍스트 노드는 제외
        if (!usedTextNodes || !usedTextNodes.has(textNode)) {
          textNodeToUse = textNode;
        }
      }
    }
    
    // IMPORTANT: childIndex 위치에 텍스트 노드가 없으면,
    // 모든 텍스트 노드를 확인하여 재사용 가능한 것 찾기
    // (자식이 텍스트 하나만 있는 경우, childIndex가 맞지 않을 수 있음)
    // 단, 이미 사용된 텍스트 노드는 제외 (중복 방지)
    if (!textNodeToUse) {
      // 먼저 childIndex 이후의 텍스트 노드를 확인 (더 가까운 위치)
      logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: scanning forward for reusable text node', {
        childIndex,
        childNodeCount: childNodes.length
      });
      for (let i = childIndex; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node && node.nodeType === Node.TEXT_NODE) {
          const textNode = node as Text;
          // 이미 사용된 텍스트 노드는 제외
          if (!usedTextNodes || !usedTextNodes.has(textNode)) {
            textNodeToUse = textNode;
            break;
          }
        }
      }
      // childIndex 이후에 없으면, 이전 텍스트 노드를 확인
      if (!textNodeToUse) {
        logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: scanning backward for reusable text node', {
          childIndex
        });
        for (let i = childIndex - 1; i >= 0; i--) {
          const node = childNodes[i];
          if (node && node.nodeType === Node.TEXT_NODE) {
            const textNode = node as Text;
            // 이미 사용된 텍스트 노드는 제외
            if (!usedTextNodes || !usedTextNodes.has(textNode)) {
              textNodeToUse = textNode;
              break;
            }
          }
        }
      }
    }
    
    // Process text node: reuse existing or create new
    if (textNodeToUse) {
      logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: reusing text node', {
        currentText: textNodeToUse.textContent,
        expectedText,
        childIndex
      });
      // Reuse existing text node: update text content only if changed
      if (textNodeToUse.textContent !== expectedText) {
        logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: updating text node content', {
          before: textNodeToUse.textContent,
          after: expectedText
        });
        textNodeToUse.textContent = expectedText;
      }
      
      // Position adjustment: move to correct position (childIndex)
      const referenceNode = childIndex < childNodes.length ? childNodes[childIndex] : null;
      if (textNodeToUse.parentNode !== parent) {
        // Text node is in different parent, move it
        parent.insertBefore(textNodeToUse, referenceNode);
      } else if (textNodeToUse.nextSibling !== referenceNode && referenceNode !== textNodeToUse) {
        // Text node is in same parent but wrong position, move it
        parent.insertBefore(textNodeToUse, referenceNode);
      }
      
      return textNodeToUse;
    } else {
      // Create new text node at correct position
      const textNode = doc.createTextNode(expectedText);
      logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: creating new text node', {
        expectedText,
        childIndex
      });
      const referenceNode = childIndex < childNodes.length ? childNodes[childIndex] : null;
      parent.insertBefore(textNode, referenceNode);
      return textNode;
    }
  }
  
  // Fallback: Try to reuse first text node if available (for backward compatibility)
  // 단, 이미 사용된 텍스트 노드는 제외
  const existingTextNode = parent.firstChild && parent.firstChild.nodeType === 3 
    ? parent.firstChild as Text 
    : null;
  
  if (existingTextNode && (!usedTextNodes || !usedTextNodes.has(existingTextNode))) {
    // Only update if content changed (prevents excessive MutationObserver triggers)
    if (existingTextNode.textContent !== expectedText) {
      logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: updating fallback text node', {
        before: existingTextNode.textContent,
        after: expectedText
      });
      existingTextNode.textContent = expectedText;
    }
    return existingTextNode;
  } else {
    // Create new text node
    const textNode = doc.createTextNode(expectedText);
    logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: creating fallback text node', {
      expectedText
    });
    parent.appendChild(textNode);
    return textNode;
  }
}

/**
 * Handle text-only VNode (VNode with text but no tag)
 * 
 * Text-only VNodes are rendered as Text nodes directly, without creating
 * a DOM element wrapper. This function handles:
 * - Text node reuse at correct position
 * - Position adjustment when text node moves
 * 
 * This is a pure reconcile function - it does not handle selection preservation.
 * Selection preservation should be handled at a higher level if needed.
 * 
 * @param parent - Parent DOM element
 * @param childVNode - Text-only VNode to render
 * @param childIndex - Index where this child should be positioned
 * @param context - Reconciliation context (unused, kept for compatibility)
 * @returns The Text node that was created or reused
 */
export function handleTextOnlyVNode(
  parent: HTMLElement,
  childVNode: VNode,
  childIndex: number,
  referenceNode: Node | null,
  context?: any
): Text {
  const doc = parent.ownerDocument || document;
  const expectedText = String(childVNode.text);
  
  // React 방식: referenceNode를 사용하여 올바른 위치에 삽입
  // referenceNode가 null이면 parent의 끝에 추가 (appendChild와 동일)
  // referenceNode가 있으면 그 앞에 삽입 (insertBefore)
  
  // 기존 텍스트 노드 재사용 시도 (referenceNode 주변에서 찾기)
  let textNodeToUse: Text | null = null;
  
  if (referenceNode && referenceNode.parentNode === parent) {
    // referenceNode의 이전 형제가 텍스트 노드인지 확인
    const prevSibling = referenceNode.previousSibling;
    if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
      textNodeToUse = prevSibling as Text;
    }
  } else if (!referenceNode) {
    // referenceNode가 null이면 (첫 번째 child), parent의 첫 번째 child가 텍스트 노드인지 확인
    const firstChild = parent.firstChild;
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      textNodeToUse = firstChild as Text;
    }
  }
  
  // Process text node: reuse existing or create new
  if (textNodeToUse) {
    // Reuse existing text node: update text content only if changed
    // IMPORTANT: Changing textContent triggers MutationObserver, so we avoid
    // unnecessary updates to prevent infinite loops
    if (textNodeToUse.textContent !== expectedText) {
      textNodeToUse.textContent = expectedText;
    }
    
    // Position adjustment: move to correct position if needed
    if (textNodeToUse.parentNode !== parent) {
      // Text node is in different parent, move it
      parent.insertBefore(textNodeToUse, referenceNode);
    } else if (textNodeToUse.nextSibling !== referenceNode && referenceNode !== textNodeToUse) {
      // Text node is in same parent but wrong position, move it
      parent.insertBefore(textNodeToUse, referenceNode);
    }
    
    return textNodeToUse;
  } else {
    // Create new text node at correct position
    const textNode = doc.createTextNode(expectedText);
    parent.insertBefore(textNode, referenceNode);
    return textNode;
  }
}

/**
 * Update text content of a host element
 * 
 * This function handles setting text content on an element when:
 * - VNode has text property
 * - Model has text property
 * 
 * It tries to reuse existing text nodes to minimize DOM mutations
 * (which trigger MutationObserver).
 * 
 * @param host - Host element to update
 * @param text - Text content to set
 * @returns The Text node that was created or updated
 */
export function updateHostTextContent(host: HTMLElement, text: string): Text {
  const doc = host.ownerDocument || document;
  
  // Try to reuse existing text node
  const existingTextNode = Array.from(host.childNodes).find(
    node => node.nodeType === Node.TEXT_NODE
  ) as Text | undefined;
  
  if (existingTextNode) {
    // Update existing text node only if content changed
    if (existingTextNode.textContent !== text) {
      existingTextNode.textContent = text;
    }
    
    // Remove other children (text-only mode)
    const otherChildren = Array.from(host.childNodes).filter(node => node !== existingTextNode);
    for (const child of otherChildren) {
      try { host.removeChild(child); } catch {}
    }
    
    return existingTextNode;
  } else {
    // Create new text node
    // Remove all existing children first
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
    const textNode = doc.createTextNode(text);
    host.appendChild(textNode);
    return textNode;
  }
}

