import { useEffect, useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { observeRangeAnchor } from '@barocss/office-ui';
import { useEditorRevision } from './revision';
import { ownsEditorSelection } from './context-toolbar';

/** Editor-owned caret or text range, measured against visible scroll-container bounds. */
export function useSelectionRect(editor: Editor, when: boolean, scope?: RefObject<HTMLElement | null>): DOMRect | null {
  const revision = useEditorRevision(editor);
  const [at, setAt] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!when) {
      setAt(null);
      return;
    }
    const doc = scope?.current?.ownerDocument ?? document;
    return observeRangeAnchor(scope?.current ?? doc.body, () => {
      const selection = doc.getSelection();
      return ownsEditorSelection(editor, selection, scope?.current) && selection?.rangeCount
        ? selection.getRangeAt(0) : null;
    }, next => setAt(previous => previous?.x === next?.x && previous?.y === next?.y &&
      previous?.width === next?.width && previous?.height === next?.height ? previous : next));
  }, [editor, when, revision, scope]);

  return when ? at : null;
}
