import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { LocalDocuments } from '@barocss/office-editor-ui';
import { DeckAutosave, type SlideSaveStatus } from './deck-autosave';

export function useSlidePersistence(editor: Editor | null) {
  const session = useRef<DeckAutosave | null>(null);
  const [status, setStatus] = useState<SlideSaveStatus>('불러오는 중');
  useEffect(() => {
    if (!editor) return;
    const controller = new DeckAutosave(editor, setStatus);
    session.current = controller;
    void controller.start();
    return () => { controller.stop(); if (session.current === controller) session.current = null; };
  }, [editor]);
  const beforeReplace = useCallback(async () => !!await session.current?.beforeReplace(), []);
  return { session, status, beforeReplace };
}

export function SlideDocuments({ persistence, onOpened }: {
  persistence: ReturnType<typeof useSlidePersistence>;
  onOpened: () => void;
}) {
  return <LocalDocuments persistence={persistence} title="최근 발표 자료" prefix="slide" onOpened={onOpened} />;
}
