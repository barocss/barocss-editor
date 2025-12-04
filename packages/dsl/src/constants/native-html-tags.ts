/**
 * Native HTML Tags List
 * 
 * This list contains all standard HTML5 tags that should be treated as native HTML elements
 * and cannot be used as template names in define() function.
 * 
 * Categories:
 * - Document structure: html, head, body, etc.
 * - Content sectioning: section, article, aside, etc.
 * - Text content: div, span, p, etc.
 * - Inline text semantics: a, em, strong, etc.
 * - Headings: h1-h6
 * - Forms: form, input, button, etc.
 * - Interactive elements: details, summary, etc.
 * - Table elements: table, tr, td, etc.
 * - Media elements: img, video, audio, etc.
 * - SVG elements: svg, path, circle, etc.
 * - MathML elements: math, mi, mo, etc.
 * - Web Components: template, slot
 * - Deprecated but still valid tags
 */

export const NATIVE_HTML_TAGS = [
  // Document structure
  'html', 'head', 'body', 'title', 'meta', 'link', 'style', 'script', 'noscript', 'base',
  
  // Content sectioning
  'section', 'article', 'aside', 'nav', 'header', 'footer', 'main', 'address',
  
  // Text content
  'div', 'span', 'p', 'hr', 'pre', 'blockquote', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  
  // Inline text semantics
  'a', 'em', 'strong', 'small', 's', 'cite', 'q', 'dfn', 'abbr', 'time', 'code', 'var', 'samp', 'kbd', 'sub', 'sup', 'i', 'b', 'u', 'mark', 'ruby', 'rt', 'rp', 'bdi', 'bdo', 'span', 'br', 'wbr',
  
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  
  // Forms
  'form', 'fieldset', 'legend', 'label', 'input', 'button', 'select', 'datalist', 'optgroup', 'option', 'textarea', 'output', 'progress', 'meter',
  
  // Interactive elements
  'details', 'summary', 'dialog', 'menu', 'menuitem',
  
  // Table elements
  'table', 'caption', 'colgroup', 'col', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',
  
  // Media elements
  'img', 'iframe', 'embed', 'object', 'param', 'video', 'audio', 'source', 'track', 'canvas', 'map', 'area',
  
  // SVG elements
  'svg', 'g', 'defs', 'symbol', 'use', 'image', 'switch', 'foreignObject', 'marker', 'pattern', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'glyph', 'glyphRef', 'font', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'hkern', 'vkern', 'missing-glyph', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'view', 'script', 'style', 'title', 'desc', 'metadata',
  
  // MathML elements (commonly used)
  'math', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'msqrt', 'mroot', 'mfrac', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'maligngroup', 'malignmark', 'mgroup', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'semantics', 'annotation', 'annotation-xml', 'maction', 'mrow', 'mover', 'munder', 'munderover', 'mmultiscripts', 'mtable', 'mtr', 'mtd', 'maligngroup', 'malignmark', 'mgroup', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'semantics', 'annotation', 'annotation-xml', 'maction',
  
  // Web Components
  'template', 'slot',
  
  // Deprecated but still valid
  'acronym', 'applet', 'basefont', 'bgsound', 'big', 'blink', 'center', 'dir', 'font', 'frame', 'frameset', 'isindex', 'keygen', 'listing', 'marquee', 'multicol', 'nextid', 'nobr', 'noembed', 'noframes', 'plaintext', 'spacer', 'strike', 'tt', 'xmp'
] as const;

/**
 * Check if a tag name is a native HTML tag
 * @param tagName - The tag name to check
 * @returns true if the tag is a native HTML tag
 */
export function isNativeHTMLTag(tagName: string): boolean {
  return NATIVE_HTML_TAGS.includes(tagName as any);
}
