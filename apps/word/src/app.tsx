import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { watchAnswers } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { AppBody, AppChrome, AppMain, AppShell, MenuBar, useRevision } from '@barocss/office-ui';
import { WORD_MENUS, WORD_VIEW_KEYS, wordMenuEntry, wordMenuId, type FontLoader } from '@barocss/office-word';
import {
  CommentsPane,
  DocumentTitle,
  DrawingOverlay,
  FindPanel,
  OutlinePane,
  Ribbon,
  Ruler,
  ZoomFrame
} from '@barocss/office-word/ui';
import { matchesKey } from '@barocss/office-controls';
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
  /**
   * 페이지가 스크롤되는 칸 — **조립하는 쪽이 알고 있는 것**.
   *
   * `.w-shell-document` 는 이 파일이 `AppMain` 에 붙이는 이름이다. 자(`Ruler`)가 그것을
   * `document.querySelector` 로 찾고 있었는데, 그러면 그 부품은 이 앱의 마크업을 아는 부품이 되고
   * 다른 호스트에서는 조용히 아무것도 안 듣는다. 이름을 아는 쪽에서 찾아서 건넨다 — 그리고 전역이
   * 아니라 `closest` 로 찾는다: 자기 서브트리에서 위로 올라가는 것은 자기 것이다.
   */
  const [pane, setPane] = useState<HTMLElement | null>(null);
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
    setPane(host.current.closest('.w-shell-document') as HTMLElement | null);
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
  /** How large the page is drawn. See `office-word/src/zoom.tsx` for why it is a transform. */
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

  /** What the editor has to say about itself right now — see the `menus` memo. */
  const answers = useRevision(
    (reread) => watchAnswers(instance?.editor ?? null, reread),
    [instance]
  );

  /**
   * The menubar, drawn from `WORD_MENUS` and greyed against the document.
   *
   * An entry a reader can press that then does nothing is worse than one that is not there, and
   * every command in the model already answers `canExecute`. A `view` entry has no command to ask,
   * so it is never disabled: whether the outline is showing is always a question a reader may
   * answer.
   */
  const menus = useMemo(
    () =>
      WORD_MENUS.map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: wordMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            disabled: item.command
              ? !instance?.editor?.canExecuteCommand?.(item.command, item.payload as never)
              : false
          }))
        }))
      })),
    /*
     * The **selection** as well as the editor. `watchAnswers` is what fires when a caret moves or a
     * command's availability changes, and without it 실행 취소 would read as unavailable for as long
     * as nothing else re-rendered this component — a menu that is stale is a menu a reader stops
     * trusting.
     */
    [instance, answers]
  );

  /**
   * What a pick does — a command, or a change to how the reader is looking.
   *
   * The `view` branch is the one `switch` the model promises. Printing is here rather than in the
   * document because it is the *browser's*: `print-pages.ts` hooks `beforeprint`, so ⌘P and this
   * entry get the same paginated document, and neither is something the editor knows how to do.
   */
  const runEntry = useCallback(
    (entry: { command?: string; view?: string; payload?: Record<string, unknown> }) => {
      switch (entry.view) {
        case 'print':
          return window.print();
        case 'find':
          return setFinding((was) => !was);
        case 'outline':
          return setOutlining((shown) => !shown);
        case 'comments':
          return setCommenting((shown) => !shown);
        case 'zoom.in':
          return setZoom((was) => Math.min(4, Math.round((was + 0.1) * 10) / 10));
        case 'zoom.out':
          return setZoom((was) => Math.max(0.25, Math.round((was - 0.1) * 10) / 10));
        case 'zoom.reset':
          return setZoom(1);
        default:
          break;
      }

      if (entry.command) void instance?.editor?.executeCommand(entry.command, entry.payload as never);
    },
    [instance]
  );

  /** A pick in the menubar, which is `runEntry` with the entry looked up. */
  const onMenu = useCallback(
    (id: string) => {
      const entry = wordMenuEntry(id);
      if (entry) runEntry(entry);
    },
    [runEntry]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * The **view** bindings, which are this app's half of what Word binds.
       *
       * The engine's registry runs `WORD_KEYBINDINGS` against a caret and can only run *commands*; a
       * zoom and a find pane are not commands and never will be. Until this loop existed, ⌘F was a
       * hand-written branch right here — `event.key === 'f'`, nothing declared — and ⌘+, ⌘- and ⌘0
       * were printed in 보기 and answered by nothing at all. Measured in a browser, all three.
       *
       * Read from `WORD_VIEW_KEYS`, so the menu's chords and the keyboard's are one statement.
       */
      if (event.defaultPrevented) return;
      const at = document.activeElement as HTMLElement | null;
      // A field's own keys are the field's; the document is `contenteditable` and is not a field.
      if (at?.tagName === 'INPUT' || at?.tagName === 'TEXTAREA') return;
      for (const binding of WORD_VIEW_KEYS) {
        if (!matchesKey(binding, event)) continue;
        event.preventDefault();
        return runEntry(binding);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runEntry]);

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
        {/*
          The **menubar**, first — above the document's own title and above the ribbon.

          Beside the title was the first shape and it was wrong: `doc-title-bar` is not an app
          brand, it is the *document's* title, subtitle and author as editable fields, and a menubar
          dropped among them reads as one more field. The menus belong to the application, so they go
          where an application's menus go.

          Both a menubar and a toolbar, because they answer different questions: a menubar holds what
          acts on the *document and the application* (print, find, which panes are open) and a
          toolbar holds what acts on the *selection*. Word's toolbar carried 71 controls in one flat
          strip, which is what happens when one strip is asked to be both.

          It also gave two capabilities somewhere to be: printing was a `beforeprint` hook and an
          object on `window`, and 찾기 was bound to a chord and on no control at all — so a reader
          who did not already know ⌘F could not find it.
        */}
        {instance ? (
          <MenuBar className="w-menubar" label="문서 메뉴" menus={menus} onPick={onMenu} />
        ) : null}
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
            pane={pane}
          />
        ) : null}
        {/* Above the page and as wide as it, because every position on it is a
            position in the text below. */}
        {instance ? <Ruler editor={instance.editor} zoom={zoom} pane={pane} /> : null}
      </AppChrome>

      <AppBody className="w-shell-body">
        {instance ? <OutlinePane
            editor={instance.editor}
            open={outlining}
            onToggle={() => setOutlining((shown) => !shown)}
            /* 어느 요소에 문서가 그려졌는지는 조립하는 쪽이 안다 — `#editor` 는 이 파일의 id 다. */
            host={host.current}
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
