import { useEffect, useMemo, useReducer, useRef, type SetStateAction } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';

type SettingsSession<T> = { initial: T; state: T; selection?: ModelSelection; busy: boolean; problem: string };

/** Captures a settings draft and its target when opened. Products own validation and commands. */
export function useEditorSettings<T>(editor: Editor | null, open: boolean,
  read: (editor: Editor | null) => T, onClose: () => void,
  options: { context?: string; isEqual?: (draft: T, initial: T) => boolean } = {}) {
  const root = editor?.getRootId();
  const context = options.context;
  const session = useMemo<SettingsSession<T>>(() => {
    const initial = read(editor);
    const selection = editor?.selection;
    return { initial, state: initial, busy: false, problem: '',
      selection: selection ? structuredClone(selection) : undefined };
    // Drafts deliberately do not follow new read callbacks or selection changes while open.
  }, [editor, root, open, context]);
  const current = useRef(session); current.current = session;
  const mounted = useRef(true);
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownsTarget = () => mounted.current && current.current === session && open && editor?.getRootId() === root;
  const setState = (next: SetStateAction<T>) => {
    if (!ownsTarget() || session.busy) return;
    session.state = typeof next === 'function' ? (next as (previous: T) => T)(session.state) : next;
    refresh();
  };
  const close = () => { if (ownsTarget() && !session.busy) onClose(); };
  const apply = async (operation: () => Promise<boolean>, action: { skipUnchanged?: boolean } = {}) => {
    if (!editor || !root || !ownsTarget() || session.busy) return;
    if (action.skipUnchanged !== false && (options.isEqual ?? Object.is)(session.state, session.initial)) { onClose(); return; }
    session.busy = true; session.problem = ''; refresh();
    try {
      if (!editor.isEditable || !await operation()) throw new Error('Settings refused');
      if (ownsTarget()) onClose();
    } catch {
      if (ownsTarget()) session.problem = '설정을 적용하지 못했습니다. 입력한 값은 유지됩니다. 다시 시도하세요.';
    } finally {
      session.busy = false;
      if (ownsTarget()) refresh();
    }
  };
  return { state: session.state, setState, selection: session.selection,
    busy: session.busy, problem: session.problem, close, apply };
}
