import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Ribbon } from './ribbon';

/**
 * The app shell.
 *
 * React owns the chrome — ribbon, dialogs, panels — and the document surface
 * stays with the DOM view, mounted into a div React does not touch after
 * creating it. Word's pagination, layout passes and header editing are wired to
 * that view, and moving the surface into React would mean re-proving all of it
 * for no gain the reader could see.
 */
export function App({ mount }: { mount: (host: HTMLElement) => Editor }) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    // Guarded because StrictMode runs effects twice on purpose, and it was
    // right to: without this the editor was built into the same element twice
    // and the document appeared three times over.
    //
    // Not cleaned up on unmount either. The editor owns this subtree for the
    // life of the page, and tearing it down and rebuilding it would throw away
    // the layout, the caret and the history for a re-render the user cannot see.
    mounted.current = true;
    setEditor(mount(host.current));
  }, [mount]);

  return (
    <>
      {editor ? <Ribbon editor={editor} /> : null}
      <div ref={host} id="editor" />
    </>
  );
}
