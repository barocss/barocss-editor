import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { AppBody, AppChrome, AppMain, AppShell, Button } from '@barocss/office-ui';
import { BREAKPOINTS, type BreakpointId } from '@barocss/office-site';
import { PageFrame } from './page-frame';

/**
 * The site builder's window.
 *
 * Three regions and nothing else yet: the pages of the site, the page being edited, and the widths
 * it is being edited at. The last is the one that makes this a *site* builder rather than a document
 * editor with a scroll bar — a reader is answering "what does this look like on a phone" while they
 * are still deciding what it says, so every width is on screen and every width is editable.
 */
export function App({ mount }: { mount: (host: HTMLElement) => { editor: Editor; view: EditorViewDOM } }) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM } | null>(null);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    mounted.current = true;
    setInstance(mount(host.current));
  }, [mount]);

  /**
   * Which widths are on screen.
   *
   * All three by default, because that is the product's opening claim; a reader who wants the room
   * turns one off. Kept in the app rather than in the document: how many screens a *reader* is
   * looking at is not a fact about their site.
   */
  const [shown, setShown] = useState<BreakpointId[]>(['desktop', 'tablet', 'mobile']);

  /** The pages, read from the document — the drawing is what says which pages there are. */
  const pages = usePages(instance?.editor ?? null);
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const page = current ?? pages[0]?.sid;

  return (
    <AppShell className="st-shell">
      <AppChrome className="st-topbar">
        <span className="st-brand">Barocss Site</span>

        {/* The pages of the site. A site is more than one page, which is the first thing that
            separates it from a document — and the address is what makes each one a page of it. */}
        <nav className="st-pages" data-pages>
          {pages.map((one) => (
            <Button
              key={one.sid}
              data={{ page: one.sid, 'page-current': one.sid === page ? 'true' : undefined }}
              title={one.path}
              onClick={() => setCurrent(one.sid)}
            >
              {one.name}
            </Button>
          ))}
        </nav>

        {/* Which widths are drawn. A toggle rather than a picker: they are all on at once. */}
        <div className="st-widths" data-widths>
          {BREAKPOINTS.map((one) => (
            <Button
              key={one.id}
              data={{ width: one.id, 'width-shown': shown.includes(one.id) ? 'true' : undefined }}
              title={`${one.label} · ${one.width}px`}
              onClick={() =>
                setShown((was) =>
                  was.includes(one.id) ? was.filter((id) => id !== one.id) : [...was, one.id]
                )
              }
            >
              {one.label}
            </Button>
          ))}
        </div>
      </AppChrome>

      <AppBody className="st-body">
        <AppMain className="st-canvas">
          {/*
            The page, at every width the reader has asked for.

            Each is a view of its own over the same editor and the same store — the deck's notes pane
            is the same mechanism — so there is one history, one selection and no second copy of the
            text. Editing the mobile frame is editing the page.
          */}
          {instance
            ? BREAKPOINTS.filter((one) => shown.includes(one.id)).map((one) => (
                <PageFrame
                  key={one.id}
                  editor={instance.editor}
                  breakpoint={one.id}
                  label={one.label}
                  width={one.width}
                  page={page}
                />
              ))
            : null}

          {/*
            The first view, which is the one `mountSite` made.

            Kept in the tree and out of sight rather than thrown away: it is what holds the document
            open, and a host that unmounted it would be taking the editor's own view away from it
            while the frames above are still drawing.
          */}
          <div ref={host} id="editor" hidden />
        </AppMain>
      </AppBody>
    </AppShell>
  );
}

/** The pages of the site, in document order, as the top bar needs them. */
function usePages(editor: Editor | null): { sid: string; name: string; path: string }[] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const redraw = () => setTick((count) => count + 1);
    (editor as never as { on?: (event: string, run: () => void) => void }).on?.(
      'editor:content.change',
      redraw
    );
    return () =>
      (editor as never as { off?: (event: string, run: () => void) => void }).off?.(
        'editor:content.change',
        redraw
      );
  }, [editor]);

  return useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } })?.dataStore;
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId) return [];

    const root = store.getNode(rootId);
    return ((root?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .filter((node: any) => node?.stype === 'surface')
      .map((node: any) => ({
        sid: String(node.sid),
        name: typeof node.attributes?.name === 'string' ? node.attributes.name : '이름 없는 페이지',
        path: typeof node.attributes?.path === 'string' ? node.attributes.path : ''
      }));
  }, [editor, tick]);
}
