import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';

type Failure = { name: string; payload: Record<string, unknown> };
type CommandScope = { pending: number; failure?: Failure };

/** Queue property writes, but retire queued work and feedback when its editor target changes. */
export function usePropertyCommand(editor: Editor | null, context: string) {
  const root = editor?.getRootId();
  const epoch = editor?.dataStore.getDocumentEpoch();
  // Object identity also distinguishes A → B → A from the original A session.
  const scope = useMemo<CommandScope>(() => ({ pending: 0 }), [editor, root, epoch, context]);
  const current = useRef(scope);
  current.current = scope;
  const mounted = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const ownsTarget = () => mounted.current && current.current === scope && editor?.getRootId() === root && editor?.dataStore.getDocumentEpoch() === epoch;
  const run = (name: string, payload: Record<string, unknown>) => {
    if (!editor || !root || !ownsTarget()) return;
    scope.pending++;
    refresh();
    queue.current = queue.current.then(async () => {
      try {
        // A started command owns its own transaction. Only work not yet started can be skipped here.
        if (!ownsTarget()) return;
        if (!editor.isEditable || await editor.executeCommand(name, payload) === false) {
          throw new Error('Command refused');
        }
      } catch {
        if (ownsTarget()) scope.failure = { name, payload };
      } finally {
        scope.pending--;
        if (ownsTarget()) refresh();
      }
    });
  };

  return {
    busy: scope.pending > 0,
    failed: !!scope.failure,
    run,
    /** Call after explicit child draft delivery; drains queued and started writes for this scope. */
    settle: async (isCurrent: () => boolean): Promise<boolean> => {
      const owns = () => !!editor && !!root && ownsTarget() && isCurrent();
      if (!owns()) return false;
      // A write can append another write while the previously captured tail completes.
      let tail: Promise<void>;
      do {
        tail = queue.current;
        await tail;
        if (!owns()) return false;
      } while (queue.current !== tail);
      return owns() && !scope.pending && !scope.failure;
    },
    retry: () => {
      if (!ownsTarget() || !scope.failure || scope.pending) return;
      const failed = scope.failure;
      scope.failure = undefined;
      run(failed.name, failed.payload);
    },
  };
}
