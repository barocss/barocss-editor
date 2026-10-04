import { useCallback, useEffect, useRef, useState, type RefObject, type Ref } from 'react';
import type { Editor } from '@barocss/editor-core';
import { LocalDocuments, type LocalDocumentActions } from '@barocss/office-editor-ui';
import { DeckAutosave, type SlideSaveStatus } from './deck-autosave';

export function useSlidePersistence(editor: Editor | null, enabled = true, beforeSnapshot?: () => Promise<void>): {
  session: RefObject<DeckAutosave | null>;
  status: SlideSaveStatus;
  beforeReplace: () => Promise<boolean>;
} {
  const session = useRef<DeckAutosave | null>(null);
  const [status, setStatus] = useState<SlideSaveStatus>('loading');
  useEffect(() => {
    if (!editor || !enabled) return;
    const controller = new DeckAutosave(editor, setStatus, beforeSnapshot);
    session.current = controller;
    void controller.start();
    return () => { controller.stop(); if (session.current === controller) session.current = null; };
  }, [editor, enabled, beforeSnapshot]);
  const beforeReplace = useCallback(async () => !!await session.current?.beforeReplace(), []);
  return { session, status, beforeReplace };
}

export function SlideDocuments({ persistence, onOpened, iconOnly = false, showTrigger = true, ref }: {
  persistence: ReturnType<typeof useSlidePersistence>;
  onOpened: () => void;
  iconOnly?: boolean;
  showTrigger?: boolean;
  ref?: Ref<LocalDocumentActions>;
}) {
  return <LocalDocuments persistence={persistence} title="최근 발표 자료" prefix="slide" onOpened={onOpened} iconOnly={iconOnly} showTrigger={showTrigger} ref={ref} />;
}
