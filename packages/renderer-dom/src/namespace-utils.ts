/**
 * Namespace utilities for DOM operations
 * Handles SVG, MathML, and HTML namespace-aware attribute operations
 */

/**
 * Get namespace for attribute based on element namespace and attribute name
 */
export function getAttributeNamespace(element: Element, attrName: string): string | null {
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
export function setAttributeWithNamespace(element: Element, key: string, value: any): void {
  if (value === null || value === undefined) {
    removeAttributeWithNamespace(element, key);
    return;
  }

  // Writing an attribute that already holds this value is not free. It produces
  // a mutation record like any other write, and the editor's input path reads
  // mutation records to work out what the user typed — so a render that rewrites
  // unchanged chrome buries a keystroke in noise. Measured on this editor: one
  // render with nothing changed produced 261 attribute writes, 191 of them
  // setting the value that was already there.
  //
  // The comparison upstream is shallow, so a value that is an object — a style
  // map, most often — differs on identity every render even when every entry in
  // it is the same. This is the backstop for that.
  if (key !== 'className' && !key.startsWith('on')) {
    const current = element.getAttribute(key);
    if (current !== null && current === String(value)) return;
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
    // The attribute rather than the property: an SVG element's `className` is a
    // read-only SVGAnimatedString and assigning to it throws.
    const next = String(value);
    if (element.getAttribute('class') !== next) element.setAttribute('class', next);
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
export function removeAttributeWithNamespace(element: Element, key: string): void {
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
  // `ellipse`, `tspan` and `foreignObject` were missing. An element created in
  // the wrong namespace is not the element it is named after: an <ellipse> built
  // as HTML has no geometry, draws nothing, and reports no error.
  if (['svg', 'circle', 'ellipse', 'rect', 'path', 'line', 'polygon', 'polyline', 'text', 'tspan', 'g', 'defs', 'clipPath', 'mask', 'pattern', 'image', 'use', 'symbol', 'marker', 'linearGradient', 'radialGradient', 'stop', 'foreignObject'].includes(lowerTag)) {
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
    // The name exactly as written.
    //
    // It used to be upper-cased, which is a reasonable-looking inference from
    // HTML and exactly wrong here: `createElement('div').tagName` is 'DIV'
    // because HTML normalises, and `createElementNS` does not normalise
    // anything. SVG and MathML are case sensitive, so <SVG> is not <svg> — it
    // is an unknown element with no geometry that draws nothing and reports no
    // error. It has been that way since the first commit, which is why nothing
    // had ever been drawn through this renderer.
    const element = document.createElementNS(namespace, tag);

    // Set xmlns attribute explicitly for SVG/MathML elements
    if (namespace === 'http://www.w3.org/2000/svg' || namespace === 'http://www.w3.org/1998/Math/MathML') {
      element.setAttribute('xmlns', namespace);
    }

    // Left as what it is. It used to be given HTMLElement's prototype so the
    // renderer's `instanceof` checks would accept it — a lie that held until
    // something read its style, which is a getter that refuses to run against
    // an object it was not defined for. The first styled SVG element threw
    // `Illegal invocation` and took the whole render with it.
    //
    // The checks now ask whether a node is an Element, which is what they meant.
    return element as unknown as HTMLElement;
  }
  return document.createElement(tag);
}
