import type { INode } from '@barocss/datastore';
import type { DocumentFragment, EditingPolicy, FragmentNode } from '@barocss/model';

const origin = { format: 'wonffice-standard-clipboard/1', schemaId: 'standard-clipboard', schemaRevision: '1' };

/** Metadata-free public nodes / converter output have the documented standard clipboard vocabulary. */
export function standardClipboardFragment(nodes: INode[]): DocumentFragment {
  const copy = (node: INode): FragmentNode => ({
    stype: node.stype, attributes: structuredClone(node.attributes), text: node.text, marks: structuredClone(node.marks),
    ...(node.content ? { content: node.content.map(child => { if (typeof child === 'string') throw new Error('Clipboard nodes require nested content'); return copy(child); }) } : {}),
  });
  return { version: 1, origin, selection: 'nodes', content: nodes.map(copy), openStart: 0, openEnd: 0, references: [], resources: [] };
}

/** Installing the standard CopyPasteExtension opts into this converter contract, not arbitrary schemas. */
export function standardClipboardPolicy(hasType: (type: string) => boolean): EditingPolicy {
  return { rangeReplacement: 'preserve-boundaries', adapters: [{ format: origin.format, schemaId: origin.schemaId, convert: input => {
    if (input.origin.schemaRevision !== '1') throw new Error('Unsupported standard clipboard revision');
    const losses: { kind: 'reference'; reason: string }[] = [];
    const normalize = (node: FragmentNode): FragmentNode[] => {
      const content = node.content?.flatMap(normalize);
      if (node.stype === 'image' && !hasType('image') && hasType('inline-image')) return [{ ...node, stype: 'inline-image' }];
      if (node.stype === 'pageReference' && !hasType('pageReference')) {
        losses.push({ kind: 'reference', reason: 'Workspace reference converted to its readable label' });
        return [{ stype: 'inline-text', text: String(node.attributes?.title ?? '제목 없음') }];
      }
      if (node.stype === 'link' && !hasType('link')) {
        const mark = (child: FragmentNode): FragmentNode => typeof child.text === 'string'
          ? { ...child, marks: [...(child.marks ?? []), { stype: 'link', attrs: { href: String(node.attributes?.href ?? ''), ...(node.attributes?.title !== undefined ? { title: node.attributes.title } : {}) }, range: [0, child.text.length] }] }
          : { ...child, ...(child.content ? { content: child.content.map(mark) } : {}) };
        return (content ?? []).map(mark);
      }
      return [{ ...node, ...(content ? { content } : {}) }];
    };
    const content = input.content.flatMap(normalize);
    const isInline = (node: FragmentNode): boolean => ['inline-text', 'inline-image', 'hardBreak', 'emoji', 'pageReference'].includes(node.stype);
    const inline = content.every(isInline);
    const paragraphs = content.every(node => node.stype === 'paragraph' && node.content?.every(isInline));
    if (paragraphs && content.length === 1 && !Object.keys(content[0].attributes ?? {}).length) {
      return { outcome: 'converted', losses, content: { ...input, content: content[0].content!, selection: 'range', openStart: 0, openEnd: 0 } };
    }
    return { outcome: 'converted', losses, content: { ...input, content, selection: inline || paragraphs ? 'range' : 'nodes', openStart: paragraphs ? 1 : 0, openEnd: paragraphs ? 1 : 0 } };
  } }] };
}
