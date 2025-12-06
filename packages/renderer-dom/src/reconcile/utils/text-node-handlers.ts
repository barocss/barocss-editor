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
  // IMPORTANT: must check all childNodes to find text node
  // (other elements may exist, so cannot check only firstChild)
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
    // Remove other child elements if present (text-only mode)
    const otherChildren = Array.from(parent.childNodes).filter(node => node !== existingTextNode);
    for (const child of otherChildren) {
      try {
        parent.removeChild(child);
      } catch {
        // May have already been removed
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
  // childIndex is the index in VNode children array
  // VNode children and DOM childNodes are in the same order, so childIndex can be used directly
  // However, VNode children: [text0, element0, text1, element1, ...]
  // DOM childNodes: [Text(text0), Element(element0), Text(text1), Element(element1), ...]
  // So check if node at childIndex position is a text node, otherwise insert at that position
  if (childIndex !== undefined) {
    const childNodes = Array.from(parent.childNodes);
    let textNodeToUse: Text | null = null;
    
    // Check if text node exists at childIndex position
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
        // Exclude already used text nodes
        if (!usedTextNodes || !usedTextNodes.has(textNode)) {
          textNodeToUse = textNode;
        }
      }
    }
    
    // IMPORTANT: if no text node at childIndex position,
    // check all text nodes to find reusable one
    // (when child has only one text, childIndex may not match)
    // However, exclude already used text nodes (prevent duplicates)
    if (!textNodeToUse) {
      // First check text nodes after childIndex (closer position)
      logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: scanning forward for reusable text node', {
        childIndex,
        childNodeCount: childNodes.length
      });
      for (let i = childIndex; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node && node.nodeType === Node.TEXT_NODE) {
          const textNode = node as Text;
          // Exclude already used text nodes
          if (!usedTextNodes || !usedTextNodes.has(textNode)) {
            textNodeToUse = textNode;
            break;
          }
        }
      }
      // If not found after childIndex, check previous text nodes
      if (!textNodeToUse) {
        logger.debug(LogCategory.RECONCILE, 'handlePrimitiveTextChild: scanning backward for reusable text node', {
          childIndex
        });
        for (let i = childIndex - 1; i >= 0; i--) {
          const node = childNodes[i];
          if (node && node.nodeType === Node.TEXT_NODE) {
            const textNode = node as Text;
            // Exclude already used text nodes
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
  // However, exclude already used text nodes
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
  
  // React-style: use referenceNode to insert at correct position
  // If referenceNode is null, append to end of parent (same as appendChild)
  // If referenceNode exists, insert before it (insertBefore)
  
  // Try to reuse existing text node (search around referenceNode)
  let textNodeToUse: Text | null = null;
  
  if (referenceNode && referenceNode.parentNode === parent) {
    // Check if referenceNode's previous sibling is a text node
    const prevSibling = referenceNode.previousSibling;
    if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
      textNodeToUse = prevSibling as Text;
    }
  } else if (!referenceNode) {
    // If referenceNode is null (first child), check if parent's first child is a text node
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

