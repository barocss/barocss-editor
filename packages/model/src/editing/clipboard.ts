import type { DocumentFragment } from './types';

export { FRAGMENT_CLIPBOARD_TYPE } from '@barocss/shared';
export const FRAGMENT_HTML_ATTRIBUTE = 'data-wonffice-fragment';

/** Only the transport envelope is checked here. The target planner validates all content. */
export function decodeClipboardFragment(serialized: string): DocumentFragment {
  const value = JSON.parse(serialized) as DocumentFragment;
  if (!value || value.version !== 1 || !['range', 'nodes'].includes(value.selection)
    || !value.origin || typeof value.origin.format !== 'string' || typeof value.origin.schemaId !== 'string'
    || typeof value.origin.schemaRevision !== 'string'
    || !Number.isSafeInteger(value.openStart) || value.openStart < 0
    || !Number.isSafeInteger(value.openEnd) || value.openEnd < 0
    || !Array.isArray(value.content) || !Array.isArray(value.references) || !Array.isArray(value.resources)) {
    throw new Error('Invalid clipboard fragment envelope');
  }
  return value;
}

/** HTML carries metadata through browsers that only accept text/html and text/plain. */
export function encodeClipboardFragment(fragment: DocumentFragment, html: string): string {
  const encoded = encodeURIComponent(JSON.stringify(fragment)).replace(/'/g, '%27');
  return `<div ${FRAGMENT_HTML_ATTRIBUTE}="${encoded}">${html}</div>`;
}
