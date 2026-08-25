import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { AppBody, AppChrome, AppMain, AppShell } from '@barocss/office-ui';
import type { FontLoader } from './font-loader';
import { Ribbon } from './ribbon';
import { FindPanel } from './find-panel';
import { CommentsPane } from './comments-pane';
import { InputLab } from './input-lab/panel';
import { DocumentTitle } from './document-title';
import { Ruler } from './ruler';
import { OutlinePane } from './outline-pane';
import { ZoomFrame } from './zoom-frame';
import { DrawingOverlay } from './drawing-overlay';

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
   * The outline, which Word calls the navigation pane.
   *
   * Open by default: a long document is a shape, and a reader who cannot see it
   * has only a scrollbar to say where they are.
   */
  const [outlining, setOutlining] = useState(true);
  /** How large the page is drawn. See `zoom.tsx` for why it is a transform. */
  const [zoom, setZoom] = useState(1);
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

  /**
   * The window is the frame.
   *
   * The whole page used to scroll, which took the ribbon and the ruler with it —
   * and a ruler the text is not beside is a ruler for nothing. So the shell
   * fills the viewport and does not scroll: the chrome holds its place at the
   * top, the panes hold theirs at the sides, and the one thing that scrolls is
   * the document.
   */
  return (
    <AppShell className="w-shell">
      <AppChrome className="w-chrome">
        {instance ? <DocumentTitle editor={instance.editor} /> : null}
        {instance ? (
          <Ribbon
            editor={instance.editor}
            view={instance.view}
            fonts={instance.fonts}
            panes={{
              outline: outlining,
              comments: commenting,
              onOutline: () => setOutlining((shown) => !shown),
              onComments: () => setCommenting((shown) => !shown)
            }}
            zoom={zoom}
            onZoom={setZoom}
          />
        ) : null}
        {/* Above the page and as wide as it, because every position on it is a
            position in the text below. */}
        {instance ? <Ruler editor={instance.editor} zoom={zoom} /> : null}
      </AppChrome>

      <AppBody className="w-shell-body">
        {instance ? <OutlinePane
            editor={instance.editor}
            open={outlining}
            onToggle={() => setOutlining((shown) => !shown)}
          /> : null}

        <AppMain className="w-shell-document relative">
          {instance ? (
            <FindPanel
              editor={instance.editor}
              view={instance.view}
              open={finding}
              onClose={() => setFinding(false)}
            />
          ) : null}
          {/*
            The zoom is on a frame around the page, not on the page itself: a
            scaled element still takes up its unscaled room, so the frame is
            given the drawn size and the page is drawn inside it.
          */}
          <ZoomFrame zoom={zoom}>
            <div ref={host} id="editor" />
          </ZoomFrame>
          {/*
            Pointing at what is on a **drawing**, over the page rather than inside it.
            
            Outside the zoom frame on purpose: it draws in screen pixels, so an outline is a
            hairline at every zoom and a handle will be the same size to grab. Inside the frame it
            would be scaled with the page, which is right for the document and wrong for a control.
          */}
          {instance ? <DrawingOverlay editor={instance.editor} host={host.current} /> : null}
        </AppMain>

        {instance ? (
          <CommentsPane
            editor={instance.editor}
            view={instance.view}
            open={commenting}
            onToggle={() => setCommenting((shown) => !shown)}
          />
        ) : null}
        {instance && lab ? <InputLab editor={instance.editor} view={instance.view} /> : null}
      </AppBody>
    </AppShell>
  );
}
