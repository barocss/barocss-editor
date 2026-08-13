import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import type { FontLoader } from './font-loader';
import { Ribbon } from './ribbon';
import { FindPanel } from './find-panel';
import { CommentsPane } from './comments-pane';
import { InputLab } from './input-lab/panel';

/**
 * The app shell.
 *
 * React owns the chrome — ribbon, dialogs, panels — and the document surface
 * stays with the DOM view, mounted into a div React does not touch after
 * creating it. Word's pagination, layout passes and header editing are wired to
 * that view, and moving the surface into React would mean re-proving all of it
 * for no gain the reader could see.
 */
export function App({ mount }: { mount: (host: HTMLElement) => { editor: Editor; view: EditorViewDOM; fonts: FontLoader } }) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM; fonts: FontLoader } | null>(null);

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
    setInstance(mount(host.current));
  }, [mount]);

  /**
   * Whether the search box is open.
   *
   * The app's, not the editor's: what a reader is looking for is not part of
   * their document. Bound here rather than through the key map because opening
   * a window is the host's business — the editor has no idea one exists.
   */
  const [finding, setFinding] = useState(false);
  const [commenting, setCommenting] = useState(true);
  /**
   * The input lab is opened by asking for it — `?lab` in the address bar.
   *
   * It is a tool for sitting down and typing on purpose while a recording runs,
   * not part of the document, and a reader who came here to write should never
   * meet it. Read once: whether it is open is not something the page changes its
   * mind about.
   */
  const [lab] = useState(() => new URLSearchParams(window.location.search).has('lab'));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {instance ? <Ribbon editor={instance.editor} view={instance.view} fonts={instance.fonts} /> : null}
      <div className="relative">
        {instance ? (
          <FindPanel
            editor={instance.editor}
            view={instance.view}
            open={finding}
            onClose={() => setFinding(false)}
          />
        ) : null}
        <div className="flex items-start">
          <div ref={host} id="editor" className="flex-1" />
          {instance ? (
            <CommentsPane editor={instance.editor} view={instance.view} open={commenting} />
          ) : null}
          {instance && lab ? <InputLab editor={instance.editor} view={instance.view} /> : null}
        </div>
      </div>
    </>
  );
}
