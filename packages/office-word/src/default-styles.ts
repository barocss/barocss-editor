import type { INode } from '@barocss/datastore';

/** Word's built-in paragraph styles, persisted with the document for exchange. */
export function wordDefaultResources(): INode[] {
  return [
    { stype: 'docDefaults', attributes: { fontFamily: 'Arial, sans-serif', fontSize: 22, spacingAfter: 160, spacingLine: 276, spacingLineRule: 'auto' } },
    { stype: 'docSettings', attributes: { trackRevisions: false } },
    { stype: 'styleDef', attributes: { id: 'Normal', name: 'Normal', type: 'paragraph' } },
    { stype: 'styleDef', attributes: { id: 'Body', name: 'Body text', type: 'paragraph', basedOn: 'Normal', next: 'Body' } },
    ...[40, 32, 28, 26, 24, 22].map((fontSize, index) => ({
      stype: 'styleDef',
      attributes: { id: `Heading${index + 1}`, name: `Heading ${index + 1}`, type: 'paragraph', basedOn: 'Normal', next: 'Body', fontSize, bold: true, spacingBefore: index === 0 ? 320 : 240, spacingAfter: 120, keepNext: true }
    }))
  ] as INode[];
}

/** Fill missing built-ins on load; imported/custom definitions always take precedence. */
export function withWordDefaults(document: INode): INode {
  if (document?.stype !== 'document') return document;
  const content = (document.content ?? []) as INode[];
  const resources = content.find((node) => node.stype === 'resources');
  const existing = (resources?.content ?? []) as INode[];
  // Older blank documents changed only the node type and retained Body (or no style).
  // Only repair headings whose named definition was absent; explicit document styles win.
  const repairHeading = (node: INode): INode => {
    const level = Number(node.attributes?.level ?? 1);
    const styleId = node.attributes?.styleId;
    const headingId = `Heading${level}`;
    const needsStyle = node.stype === 'heading' && level >= 1 && level <= 6 &&
      (styleId === undefined || styleId === 'Body' || styleId === 'Normal') &&
      !existing.some((entry) => entry.stype === 'styleDef' && entry.attributes?.id === headingId);
    return { ...node, ...(needsStyle ? { attributes: { ...node.attributes, styleId: headingId } } : {}),
      ...(node.content ? { content: (node.content as INode[]).map(repairHeading) } : {}) } as INode;
  };
  const missing = wordDefaultResources().filter((fallback) => !existing.some((node) =>
    node.stype === fallback.stype && (fallback.stype !== 'styleDef' || node.attributes?.id === fallback.attributes?.id)
  ));
  if (!missing.length) return document;
  const filled = { ...resources, stype: 'resources', content: [...existing, ...missing] } as INode;
  return { ...document, content: (resources ? content.map((node) => node === resources ? filled : node) : [...content, filled]).map(repairHeading) } as INode;
}
