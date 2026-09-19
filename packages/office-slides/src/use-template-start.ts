import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { DECK_TEMPLATES } from './templates';

/** Template creation replaces a document; it is not an undoable settings command. */
export function useTemplateStart(editor: Editor | null, open: boolean, onClose: () => void,
  onOpened?: () => void, beforeReplace?: () => Promise<boolean>) {
  const root = editor?.getRootId();
  const session = useMemo(() => ({ chosen: DECK_TEMPLATES[0]?.id ?? 'blank', busy: false, problem: '' }),
    [editor, root, open]);
  const current = useRef(session); current.current = session;
  const mounted = useRef(true);
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownsTarget = () => mounted.current && open && current.current === session && editor?.getRootId() === root;
  const close = () => { if (ownsTarget() && !session.busy) onClose(); };
  const setChosen = (chosen: string) => {
    if (!ownsTarget() || session.busy) return;
    session.chosen = chosen; refresh();
  };
  const start = async () => {
    if (!editor || !ownsTarget() || session.busy) return;
    const template = DECK_TEMPLATES.find(one => one.id === session.chosen);
    if (!template) return;
    session.busy = true; session.problem = ''; refresh();
    try {
      // Prepare before saving, so a template error never replaces the current document.
      const document = template.make();
      if (beforeReplace && !await beforeReplace()) throw new Error('Save refused');
      if (!ownsTarget()) return;
      editor.loadDocument(document, 'slides');
    } catch {
      if (ownsTarget()) session.problem = '새 자료를 열지 못했습니다. 현재 자료의 저장 상태를 확인한 뒤 다시 시도하세요.';
      return;
    } finally {
      session.busy = false;
      if (ownsTarget()) refresh();
    }
    // Successful replacement intentionally changes the root. These callbacks finish that replacement.
    onOpened?.();
    onClose();
  };
  return { chosen: session.chosen, setChosen, busy: session.busy, problem: session.problem, close, start };
}
