/**
 * C1 classification: pure text change within a single inline-text.
 * Ported from editor-view-dom dom-change-classifier (C1 only).
 */
import type { Editor } from '@barocss/editor-core';
import { findClosestInlineTextNode, reconstructModelTextFromDOM } from './edit-position';

export interface ClassifiedChangeC1 {
  case: 'C1';
  nodeId: string;
  prevText: string;
  newText: string;
  contentRange?: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
  mutations: MutationRecord[];
  metadata?: { usedInputHint?: boolean };
}

export interface InputHint {
  contentRange: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
  timestamp: number;
}

export interface ClassifyOptions {
  editor: Editor;
  selection?: Selection;
  modelSelection?: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
  inputHint?: InputHint;
  isComposing?: boolean;
}

export type ClassifiedChange = ClassifiedChangeC1 | { case: 'UNKNOWN'; mutations: MutationRecord[] };

export function classifyDomChangeC1(
  mutations: MutationRecord[],
  options: ClassifyOptions
): ClassifiedChangeC1 | null {
  if (mutations.length === 0) return null;

  for (const mutation of mutations) {
    const target = mutation.target;
    const inlineTextNode = findClosestInlineTextNode(target);
    if (!inlineTextNode) continue;

    const nodeId = inlineTextNode.getAttribute('data-bc-sid');
    if (!nodeId) continue;

    const modelNode = options.editor.dataStore?.getNode?.(nodeId) as { stype?: string; text?: string } | undefined;
    if (!modelNode || modelNode.stype !== 'inline-text') continue;

    if (mutation.type === 'childList') {
      const addedOrRemoved = [
        ...Array.from(mutation.addedNodes ?? []),
        ...Array.from(mutation.removedNodes ?? []),
      ];
      const hasBlockLike = addedOrRemoved.some((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = (n as Element).tagName.toLowerCase();
        return ['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag);
      });
      if (hasBlockLike) continue;
    }

    const prevText = modelNode.text ?? '';
    const newText = reconstructModelTextFromDOM(inlineTextNode);

    let startOffset: number | undefined;
    let endOffset: number | undefined;
    let usedInputHint = false;

    const hint = options.inputHint;
    if (hint?.contentRange.startNodeId === nodeId && hint.contentRange.endNodeId === nodeId) {
      startOffset = Math.max(0, Math.min(prevText.length, hint.contentRange.startOffset));
      endOffset = Math.max(startOffset, Math.min(prevText.length, hint.contentRange.endOffset));
      usedInputHint = true;
    }

    return {
      case: 'C1',
      nodeId,
      prevText,
      newText,
      contentRange:
        startOffset !== undefined && endOffset !== undefined
          ? { startNodeId: nodeId, startOffset, endNodeId: nodeId, endOffset }
          : undefined,
      mutations: [mutation],
      metadata: usedInputHint ? { usedInputHint: true } : undefined,
    };
  }
  return null;
}
