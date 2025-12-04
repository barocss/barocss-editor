/**
 * Namespace utilities for DOM operations
 * Handles SVG, MathML, and HTML namespace-aware attribute operations
 */

/**
 * Get namespace for attribute based on element namespace and attribute name
 */
export function getAttributeNamespace(element: HTMLElement, attrName: string): string | null {
  const elementNS = element.namespaceURI;
  
  // SVG namespace attributes
  if (elementNS === 'http://www.w3.org/2000/svg') {
    // SVG-specific attributes that need namespace
    const svgNSAttributes = [
      'xlink:href', 'xlink:title', 'xlink:type', 'xlink:role', 'xlink:arcrole',
      'xml:lang', 'xml:space', 'xml:base', 'xml:id'
    ];
    
    if (svgNSAttributes.includes(attrName)) {
      if (attrName.startsWith('xlink:')) {
        return 'http://www.w3.org/1999/xlink';
      }
      if (attrName.startsWith('xml:')) {
        return 'http://www.w3.org/XML/1998/namespace';
      }
    }
    
    // Regular SVG attributes don't need namespace
    return null;
  }
  
  // MathML namespace attributes
  if (elementNS === 'http://www.w3.org/1998/Math/MathML') {
    // MathML-specific attributes that need namespace
    const mathMLNSAttributes = [
      'xlink:href', 'xlink:title', 'xlink:type', 'xlink:role', 'xlink:arcrole',
      'xml:lang', 'xml:space', 'xml:base', 'xml:id'
    ];
    
    if (mathMLNSAttributes.includes(attrName)) {
      if (attrName.startsWith('xlink:')) {
        return 'http://www.w3.org/1999/xlink';
      }
      if (attrName.startsWith('xml:')) {
        return 'http://www.w3.org/XML/1998/namespace';
      }
    }
    
    // Regular MathML attributes don't need namespace
    return null;
  }
  
  // HTML elements - no namespace needed
  return null;
}

/**
 * Set attribute with proper namespace handling
 */
export function setAttributeWithNamespace(element: HTMLElement, key: string, value: any): void {
  if (value === null || value === undefined) {
    removeAttributeWithNamespace(element, key);
    return;
  }

  // Special handling for xmlns - don't override if already set by createElementWithNamespace
  if (key === 'xmlns') {
    const existingXmlns = element.getAttribute('xmlns');
    if (existingXmlns && existingXmlns === String(value)) {
      // Already set correctly, don't override
      return;
    }
  }

  if (key.startsWith('on') && typeof value === 'function') {
    // Event handlers
    const eventName = key.slice(2).toLowerCase();
    element.addEventListener(eventName, value as EventListener);
    return;
  }

  if (key === 'className') {
    element.className = String(value);
    return;
  }

  if (key === 'style' && typeof value === 'object') {
    // Handle style object - this should be processed by updateStyles
    return;
  }

  // Handle boolean attributes properly
  if (typeof value === 'boolean') {
    if (value) {
      setAttributeWithNamespace(element, key, '');
    } else {
      removeAttributeWithNamespace(element, key);
    }
    return;
  }

  // Determine if this attribute needs namespace
  const namespace = getAttributeNamespace(element, key);
  if (namespace) {
    element.setAttributeNS(namespace, key, String(value));
  } else {
    element.setAttribute(key, String(value));
  }
}

/**
 * Remove attribute with proper namespace handling
 */
export function removeAttributeWithNamespace(element: HTMLElement, key: string): void {
  const namespace = getAttributeNamespace(element, key);
  if (namespace) {
    const localName = key.includes(':') ? key.split(':')[1] : key;
    element.removeAttributeNS(namespace, localName);
  } else {
    element.removeAttribute(key);
  }
}

/**
 * Check if attribute should be skipped for namespace elements
 */
export function shouldSkipAttribute(element: HTMLElement, key: string): boolean {
  // Skip special VNode-only attributes that shouldn't be in DOM
  if (key === 'key') {
    return true;
  }
  
  // Don't skip xmlns - it should be preserved if set by createElementWithNamespace
  // The xmlns attribute is handled by createElementWithNamespace and should remain
  
  return false;
}

/**
 * Get namespace for element tag
 */
export function getNamespaceForTag(tag: string, parentElement?: HTMLElement | null): string | undefined {
  const lowerTag = tag.toLowerCase();
  
  // SVG elements
  if (['svg', 'circle', 'rect', 'path', 'line', 'polygon', 'polyline', 'text', 'g', 'defs', 'clipPath', 'mask', 'pattern', 'image', 'use', 'symbol', 'marker', 'linearGradient', 'radialGradient', 'stop'].includes(lowerTag)) {
    return 'http://www.w3.org/2000/svg';
  }
  
  // MathML elements
  if (['math', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'msqrt', 'mroot', 'mfrac', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'maligngroup', 'malignmark', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'semantics', 'annotation', 'annotation-xml'].includes(lowerTag)) {
    return 'http://www.w3.org/1998/Math/MathML';
  }
  
  // HTML elements - no namespace needed
  return undefined;
}

/**
 * Create element with proper namespace
 */
export function createElementWithNamespace(tag: string, namespace?: string): HTMLElement {
  if (namespace) {
    // For SVG and MathML, create with namespace but return as HTMLElement
    const element = document.createElementNS(namespace, tag.toUpperCase()); // Convert tag to uppercase for SVG/MathML

    // Set xmlns attribute explicitly for SVG/MathML elements
    if (namespace === 'http://www.w3.org/2000/svg' || namespace === 'http://www.w3.org/1998/Math/MathML') {
      element.setAttribute('xmlns', namespace);
    }

    // Add HTMLElement properties for compatibility
    if (!(element instanceof HTMLElement)) {
      Object.setPrototypeOf(element, HTMLElement.prototype);
    }
    return element as HTMLElement;
  }
  return document.createElement(tag);
}
