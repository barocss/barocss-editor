import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';

type Failure = { name: string; payload: Record<string, unknown> };
type CommandScope = { pending: number; failure?: Failure };

/** Queue property writes, but retire queued work and feedback when its editor target changes. */
export function usePropertyCommand(editor: Editor | null, context: string) {
  const root = editor?.getRootId();
  // Object identity also distinguishes A → B → A from the original A session.
  const scope = useMemo<CommandScope>(() => ({ pending: 0 }), [editor, root, context]);
  const current = useRef(scope);
  current.current = scope;
  const mounted = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const ownsTarget = () => mounted.current && current.current === scope && editor?.getRootId() === root;
  const run = (name: string, payload: Record<string, unknown>) => {
    if (!editor || !root || !ownsTarget()) return;
    if (!scope.pending) scope.failure = undefined;
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
    retry: () => { if (ownsTarget() && scope.failure && !scope.pending) run(scope.failure.name, scope.failure.payload); },
  };
}
