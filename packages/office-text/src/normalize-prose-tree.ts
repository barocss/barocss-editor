/** Upgrade plain prose trees without mutating the source or changing existing child order.
 * Titles are ordinary inline content. An existing title child wins over a legacy attribute.
 * Invalid structure is left intact so the caller's schema validation can report it.
 */
export function normalizeProseTree<T>(tree: T): T {
  const visit = (value: unknown, depth: number): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 100) return value;
    const node = value as Record<string, unknown>;
    const copy = { ...node };
    if (!Array.isArray(node.content)) return copy;
    copy.content = node.content.map(child => visit(child, depth + 1));
    // Inline atoms need real editable text positions on both sides, including imported/old notes.
    const children = copy.content as Record<string, unknown>[];
    if (children.some(child => child?.stype === 'mathInline')) {
      const bounded: unknown[] = [];
      for (const child of children) {
        const previous = bounded[bounded.length - 1] as Record<string, unknown> | undefined;
        if (child?.stype === 'mathInline' && previous?.stype !== 'inline-text') bounded.push({ stype: 'inline-text', text: '', marks: [] });
        if (previous?.stype === 'mathInline' && child?.stype !== 'inline-text' && child?.stype !== 'mathInline') bounded.push({ stype: 'inline-text', text: '', marks: [] });
        bounded.push(child);
      }
      if ((bounded[bounded.length - 1] as Record<string, unknown>)?.stype === 'mathInline') bounded.push({ stype: 'inline-text', text: '', marks: [] });
      copy.content = bounded;
    }
    if (node.stype !== 'callout') return copy;
    const attrs = node.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)
      ? { ...node.attributes } as Record<string, unknown> : {};
    const title = typeof attrs.title === 'string' ? attrs.title : '';
    delete attrs.title;
    copy.attributes = attrs;
    const content = copy.content as unknown[];
    if (!content.some(child => !!child && typeof child === 'object' && (child as Record<string, unknown>).stype === 'calloutTitle')) {
      content.unshift({ stype: 'calloutTitle', content: [{ stype: 'inline-text', text: title }] });
    }
    return copy;
  };
  return visit(tree, 0) as T;
}
