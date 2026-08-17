import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Filmstrip } from './filmstrip';
import { SelectionOverlay } from './overlay';
import { ZoomControl } from '@barocss/office-ui';
import { clampZoom } from '@barocss/office-slides';
import { SlideLayoutDialog, SlideSizeDialog } from './deck-dialogs';
import { Present } from './present';
import { Properties } from './properties';
import { Ribbon } from './ribbon';
import { Stage } from './stage';
import { useDeck, useNote } from './deck-model';

/**
 * The deck app.
 *
 * The same division as Word's: React owns the chrome and the DOM view owns the
 * document surface, mounted into an element React creates and then leaves
 * alone. What is different is how little chrome there is between them — no
 * ruler, because a slide has no margins to drag; no page furniture, because a
 * slide has no headers; no zoom-to-fit-width, because a slide fits both ways at
 * once or not at all.
 */
export function App({
  mount
}: {
  mount: (host: HTMLElement) => { editor: Editor; view: EditorViewDOM };
}) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM } | null>(null);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    // Guarded because StrictMode runs effects twice on purpose. Not cleaned up
    // on unmount either: the editor owns this subtree for the life of the page,
    // and rebuilding it would throw away the caret and the history for a
    // re-render nobody asked for.
    mounted.current = true;
    setInstance(mount(host.current));
  }, [mount]);

  const editor = instance?.editor ?? null;
  const slides = useDeck(editor);

  /**
   * Which slide is being worked on.
   *
   * The app's, not the document's. Two people editing one deck are not looking
   * at the same slide, and a document that recorded "the current slide" would
   * be saying something about a reader rather than about itself.
   */
  const [current, setCurrent] = useState<string | undefined>();
  useEffect(() => {
    // Follow the deck: the first slide to start, and never a slide that has
    // been deleted out from under the selection.
    if (slides.length === 0) return setCurrent(undefined);
    if (!current || !slides.some((slide) => slide.sid === current)) setCurrent(slides[0].sid);
  }, [slides, current]);

  /**
   * One slide, or the deck as a strip.
   *
   * One by default, because that is what a deck editor is — the strip is for
   * seeing the shape of a deck, which is a different question and a rarer one.
   */
  const [focused, setFocused] = useState(true);

  /**
   * Presenting.
   *
   * A mode of the shell rather than a different screen: the slide on show is
   * the one the editor was already drawing, and presenting from a second render
   * would mean two drawings of one deck that could disagree.
   */
  const [presenting, setPresenting] = useState(false);

  /**
   * Which dialog is open, if any.
   *
   * The app's, like every other piece of chrome state: a dialog is a fact about
   * one reader's screen, and the editor has no idea one exists.
   */
  const [dialog, setDialog] = useState<'size' | 'layout' | null>(null);

  /**
   * How large the slide is drawn.
   *
   * `undefined` means "fit the pane", which is a different state from any
   * particular number: a fitted deck re-fits when the window changes, and a
   * deck at 150% stays at 150%. Collapsing the two would mean either losing the
   * reader's zoom on every resize or never fitting again after the first.
   */
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const note = useNote(editor, current);

  const here = useMemo(
    () => slides.find((slide) => slide.sid === current),
    [slides, current]
  );

  /**
   * What the control shows while the deck is fitted.
   *
   * Read back from the stage rather than recomputed, so the number in the box
   * is the number on the screen — computing it a second time here would be a
   * second answer to drift from the first.
   */
  const [fitted, setFitted] = useState(1);
  useEffect(() => {
    const read = () => {
      const slide = document.querySelector<HTMLElement>('.sl-slide');
      if (slide) setFitted(slide.getBoundingClientRect().width / 1280);
    };
    read();
    const timer = window.setInterval(read, 400);
    return () => window.clearInterval(timer);
  }, [slides, current, zoom, presenting]);

  /**
   * Undo and redo, when the reader is not in the text.
   *
   * The editor already binds these and they work — with the caret in a slide.
   * A deck is edited from its chrome as much as from its text, and the moment a
   * reader clicks "새 슬라이드" the focus is on a button, the key never reaches
   * the editor, and Ctrl+Z does nothing. Measured in the browser: five presses,
   * no change, no error.
   *
   * Routing the key is the host's business, the same way opening a search box
   * is; undoing is still the editor's, and this calls it rather than
   * reimplementing it. Handed straight back when the focus *is* in the text, so
   * one press is never two undos.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'z') return;

      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[contenteditable="true"]')) return;

      event.preventDefault();
      void (event.shiftKey ? (editor as any)?.redo?.() : (editor as any)?.undo?.());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  // Arrow keys move between slides when the caret is not in the text, which is
  // the one shortcut a deck cannot do without.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Inside the document, the arrows belong to the caret.
      if (target?.closest?.('[contenteditable="true"]')) return;
      if (event.key !== 'PageDown' && event.key !== 'PageUp') return;

      const at = slides.findIndex((slide) => slide.sid === current);
      if (at < 0) return;
      const next = event.key === 'PageDown' ? at + 1 : at - 1;
      if (next < 0 || next >= slides.length) return;

      event.preventDefault();
      setCurrent(slides[next].sid);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides, current]);

  return (
    <div className="sl-shell" data-presenting={presenting ? 'true' : undefined}>
      <header className="sl-topbar">
        <h1>Barocss Slides</h1>
        <span className="sl-count">
          {slides.length > 0 && here ? `${here.number} / ${slides.length}` : '—'}
        </span>

        <div className="sl-topbar-actions">
          <ZoomControl
            zoom={zoom ?? fitted}
            onChange={(next) => setZoom(clampZoom(next))}
            onFit={() => setZoom(undefined)}
            fitLabel="화면에 맞춤"
          />

          <button type="button" data-slide-size onClick={() => setDialog('size')}>
            크기
          </button>
          <button type="button" data-slide-layout onClick={() => setDialog('layout')}>
            레이아웃
          </button>
          <button type="button" data-present onClick={() => setPresenting(true)} title="처음부터 발표">
            발표
          </button>
          <button
            type="button"
            data-focus-toggle
            aria-pressed={focused}
            onClick={() => setFocused((on) => !on)}
            title="한 장만 보기 / 전체 보기"
          >
            {focused ? '전체 보기' : '한 장 보기'}
          </button>
        </div>
      </header>

      {/*
       * The suite's toolbar, drawing the model `office-slides` declares with the
       * components `office-word` draws its own with. The two products look alike
       * because they draw with the same components, not because they share a
       * list of controls.
       */}
      {editor && !presenting && <Ribbon editor={editor} slides={slides} current={current} />}

      <div className="sl-body">
        <Filmstrip slides={slides} current={current} onSelect={setCurrent} />

        <main className="sl-main">
          {/*
           * The host is created once and handed to the view. It stays mounted
           * in both modes — switching to the strip must not tear the editor
           * down and build it again.
           */}
          {/*
           * Presenting always shows one slide and fills the window; editing
           * shows one or the strip and never grows past natural size.
           */}
          <Stage
            host={host}
            focus={presenting || focused ? current : undefined}
            zoom={presenting ? undefined : zoom}
            onZoom={presenting ? undefined : setZoom}
            fill={presenting}
          />

          {/*
           * Selecting and dragging what is on the slide, drawn over it.
           *
           * A layer rather than something inside the document: the view owns
           * every element in there and rewrites them on each render, so a handle
           * put in the tree would last until the next keystroke.
           */}
          {!presenting && (
            <SelectionOverlay editor={editor} slideSid={current} revision={slides.length} />
          )}

          <section className="sl-notes" aria-label="발표자 노트">
            <h2>발표자 노트</h2>
            {note ? (
              <p>{note}</p>
            ) : (
              <p className="sl-notes-empty">이 슬라이드에는 노트가 없습니다.</p>
            )}
            {/*
             * Read-only, and said so rather than faked. A note is editable
             * content in the document — paragraphs, marks, a caret, undo — and
             * a textarea here would look like it could be typed in and lose
             * every keystroke. Editing it means a second editable region over
             * the same document, which is the next thing this app needs.
             */}
          </section>
        </main>

        {/*
         * The panel on the right, where every Office product keeps it. Drawn with
         * the suite's components; what is in it is a deck's — a box has a
         * position, which is the whole difference between a slide and a page.
         */}
        <Properties editor={editor} slides={slides} current={current} />
      </div>

      <SlideSizeDialog
        editor={editor}
        slides={slides}
        open={dialog === 'size'}
        onClose={() => setDialog(null)}
      />
      <SlideLayoutDialog
        editor={editor}
        current={current}
        open={dialog === 'layout'}
        onClose={() => setDialog(null)}
      />

      {presenting && (
        <Present
          slides={slides}
          current={current}
          onCurrent={setCurrent}
          onExit={() => setPresenting(false)}
        />
      )}
    </div>
  );
}
