import { useEffect, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { observeElementAnchor } from '@barocss/office-ui';
import { useEditorRevision } from './revision';

/** Viewport anchor for an editor node, including nested nodes and independently scrolling hosts. */
export function useNodeAnchor(editor: Editor, scope: RefObject<HTMLElement | null>, nodeId?: string) {
  const revision = useEditorRevision(editor);
  const root = editor.getRootId();
  const [anchor, setAnchor] = useState<{ editor: Editor; root: string | undefined; nodeId: string;
    element: HTMLElement; at: DOMRect } | null>(null);
  useEffect(() => {
    const host = scope.current;
    if (!host || !nodeId) { setAnchor(null); return; }
    const find = () => {
      let node = editor.dataStore.getNode(nodeId);
      const seen = new Set<string>();
      while (node?.sid && node.sid !== root && !seen.has(node.sid)) {
        seen.add(node.sid); node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
      }
      if (!root || node?.sid !== root) return null;
      return [...host.querySelectorAll<HTMLElement>('[data-bc-sid]')]
        .find(element => element.getAttribute('data-bc-sid') === nodeId) ?? null;
    };
    return observeElementAnchor(host, find, (element, at) => setAnchor(previous => {
      if (!element || !at) return null;
      if (previous?.editor === editor && previous.root === root && previous.nodeId === nodeId &&
        previous.element === element && previous.at.x === at.x && previous.at.y === at.y &&
        previous.at.width === at.width && previous.at.height === at.height) return previous;
      return { editor, root, nodeId, element, at };
    }));
  }, [editor, root, scope, nodeId, revision]);
  return anchor?.editor === editor && anchor.root === root && anchor.nodeId === nodeId ? anchor : null;
}

export function useNodeRect(editor: Editor, scope: RefObject<HTMLElement | null>, nodeId?: string) {
  return useNodeAnchor(editor, scope, nodeId)?.at ?? null;
}
