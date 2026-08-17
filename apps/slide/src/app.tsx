import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Filmstrip } from './filmstrip';
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
  const note = useNote(editor, current);

  const here = useMemo(
    () => slides.find((slide) => slide.sid === current),
    [slides, current]
  );

  /**
   * Run a command, and let the deck re-read itself.
   *
   * Nothing is passed back from here into the model: which slide is on screen
   * is the app's, and the commands take the sid they are given. The rail
   * updates because `useDeck` listens for the document changing, not because
   * this told it to.
   */
  const command = (name: string, payload?: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.(name, payload);
  };

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
    <div className="sl-shell">
      <header className="sl-topbar">
        <h1>Barocss Slides</h1>
        <span className="sl-count">
          {slides.length > 0 && here ? `${here.number} / ${slides.length}` : '—'}
        </span>

        <div className="sl-topbar-actions">
          {/*
           * The five a deck has that a document does not. Every one commits a
           * single transaction, so every one is a single Ctrl+Z.
           */}
          <button type="button" data-add-slide onClick={() => command('insertSlide', { after: current })}>
            새 슬라이드
          </button>
          <button
            type="button"
            data-duplicate-slide
            disabled={!current}
            onClick={() => command('duplicateSlide', { slideId: current })}
          >
            복제
          </button>
          <button
            type="button"
            data-hide-slide
            aria-pressed={here?.hidden ?? false}
            disabled={!current}
            onClick={() => command('toggleSlideHidden', { slideId: current })}
          >
            {here?.hidden ? '보이기' : '숨기기'}
          </button>
          <button
            type="button"
            data-move-slide-up
            disabled={!here || here.number <= 1}
            onClick={() => command('moveSlide', { slideId: current, to: (here!.number - 1) - 1 })}
          >
            ↑
          </button>
          <button
            type="button"
            data-move-slide-down
            disabled={!here || here.number >= slides.length}
            onClick={() => command('moveSlide', { slideId: current, to: here!.number })}
          >
            ↓
          </button>
          <button
            type="button"
            data-delete-slide
            disabled={slides.length <= 1 || !current}
            onClick={() => command('deleteSlide', { slideId: current })}
          >
            삭제
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

      <div className="sl-body">
        <Filmstrip slides={slides} current={current} onSelect={setCurrent} />

        <main className="sl-main">
          {/*
           * The host is created once and handed to the view. It stays mounted
           * in both modes — switching to the strip must not tear the editor
           * down and build it again.
           */}
          <Stage host={host} focus={focused ? current : undefined} />

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
      </div>
    </div>
  );
}
