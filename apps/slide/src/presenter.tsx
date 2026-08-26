import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { noteTextOf, pressablesOn, type Slide } from '@barocss/office-slides';
import { Button } from '@barocss/office-ui';
import { Thumbnail } from './thumbnail';

/**
 * The presenter's screen.
 *
 * Presenting already existed and showed *the audience's* screen — which is the
 * half a projector needs and the half a presenter cannot use. Everything this
 * adds is already in the document: the next slide, the note the author wrote,
 * and how far through the deck they are. The only thing here that is not in the
 * document is the clock, which is a fact about this showing rather than about
 * the deck.
 *
 * ## Why the next slide is a thumbnail and the current one is not
 *
 * The slide the audience sees is the one the editor is already drawing — the
 * stage, made small by CSS — because presenting from a second render would mean
 * two drawings of one deck that could disagree, and the one nobody is looking at
 * is the one that stays right.
 *
 * The *next* slide has no such copy to reuse: it is the slide that is not on
 * screen. So it is a `Thumbnail`, which is the rail's answer to the same
 * question and already knows how to draw a slide small without re-laying it out.
 *
 * ## One screen, two places to put it
 *
 * This element is drawn either beside the slide or in a **window of its own**
 * (`PresenterWindow`), and it is the same element both ways — a presenter should
 * be shown one thing in one arrangement, and what changes is how much room it
 * has. With one display the split is what a presenter needs; with two, the split
 * is exactly what they cannot use, because the audience would be reading the
 * notes.
 *
 * It needed no proxying of the document, which is what this was waiting for: the
 * second window is a portal into another document from the *same* React tree, so
 * the state it draws is the state the editor window holds. The controls appear
 * only in the window (`onGo`), because beside the slide the keys already arrive
 * where they are wanted.
 */
export function Presenter({
  editor,
  slides,
  current,
  revision,
  builds,
  played,
  /** When the show started, so the clock counts this showing and not the day. */
  since,
  /**
   * Move the show, and end it — given only when this is the presenter's **own window**.
   *
   * Beside the slide there is nothing to add: the keys already go to the window the
   * audience's screen is in. In a window of its own the presenter is looking at *this*
   * screen and pressing keys into it, so it needs both the keys and something to press with
   * a pointer — a remote is a pointer as often as it is a keyboard.
   */
  onGo,
  onExit,
  links
}: {
  editor: Editor | null;
  slides: Slide[];
  current?: string;
  revision: number;
  builds: number;
  played: number;
  since: number;
  onGo?: (step: number) => void;
  onExit?: () => void;
  /** That this deck moves by its links only, so there is no next page to show. */
  links?: boolean;
}) {
  const shown = slides.filter((slide) => !slide.hidden);
  const at = shown.findIndex((slide) => slide.sid === current);
  /*
   * In a **links-only** deck there is no next slide to show a presenter — the deck moves when
   * somebody presses a button, and a thumbnail of "the page after this one in the file" would be
   * this screen telling a presenter something that is not going to happen.
   */
  const next = links ? undefined : at >= 0 ? shown[at + 1] : undefined;

  /**
   * What the audience has to press on this slide, asked of the model.
   *
   * Recomputed with the document like the notes beside it: a deck edited mid-show — which happens,
   * because a presenter fixes a typo between rehearsals — must not leave the presenter reading a
   * button that is no longer there.
   */
  const pressables = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return [];
    return pressablesOn({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, current);
  }, [editor, current, revision]);

  const notes = (() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !current) return [];
    return noteTextOf({ rootId, getNode: (sid: string) => store.getNode(sid) }, current);
  })();

  return (
    <aside className="sl-presenter" data-presenter-view>
      <section className="sl-presenter-next">
        <h2>다음 슬라이드</h2>
        {next ? (
          <div className="sl-presenter-thumb">
            <Thumbnail editor={editor} slideSid={next.sid} width={280} revision={revision} />
            <span className="sl-presenter-caption">
              {next.number}. {next.name}
            </span>
          </div>
        ) : (
          <p className="sl-presenter-empty" data-presenter-none>
            {links ? '버튼을 눌러 이동합니다' : '마지막 슬라이드입니다'}
          </p>
        )}
      </section>

      <section className="sl-presenter-notes">
        <h2>발표자 노트</h2>
        {notes.length > 0 ? (
          notes.map((line, index) => <p key={index}>{line || ' '}</p>)
        ) : (
          <p className="sl-presenter-empty">이 슬라이드에는 노트가 없습니다</p>
        )}
      </section>

      {/*
        * The controls, and only in a window of its own — see `onGo`.
        *
        * Words rather than icons: this screen is read at a glance from a lectern, and 다음
        * is legible where a chevron is a smudge.
        */}
      {onGo && (
        <section className="sl-presenter-controls">
          <Button title="이전" data={{ 'presenter-back': '' }} onClick={() => onGo(-1)}>
            이전
          </Button>
          <Button title="다음" data={{ 'presenter-next': '' }} onClick={() => onGo(1)}>
            다음
          </Button>
          {onExit && (
            <Button title="발표 끝내기" data={{ 'presenter-exit': '' }} onClick={onExit}>
              끝내기
            </Button>
          )}
        </section>
      )}

      <section className="sl-presenter-meta">
        <Clock since={since} />
        <span data-presenter-position>
          {at >= 0 ? `${at + 1} / ${shown.length}` : '—'}
        </span>
        {builds > 0 && (
          <span data-presenter-builds>
            애니메이션 {played} / {builds}
          </span>
        )}
        {/*
          * And what has to be **pressed**, which the count cannot say.
          *
          * A slide whose next motion waits for a click on a shape looked finished here — 애니메이션
          * 2 / 2 — so a presenter pressed forward and the reveal never happened. The count is about
          * presses; a trigger is the press that is not one.
          *
          * Named rather than counted, because with cards the button may be a badge inside one of
          * three identical placements: "지표 카드 · 타원" is a thing a presenter can find on the
          * screen, where `card-badge` is a name from a file.
          */}
        {pressables.length > 0 && (
          <span data-presenter-press={pressables.length}>
            누를 것: {pressables.map((one) => one.label).join(', ')}
          </span>
        )}
      </section>
    </aside>
  );
}

/**
 * How long this showing has been running.
 *
 * A second's tick, and nothing finer: a presenter reads this out of the corner
 * of their eye, and a clock that changed sixty times a second would be the only
 * moving thing on a screen whose job is to be still.
 */
function Clock({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <span data-presenter-clock aria-live="off">
      {mm}:{ss}
    </span>
  );
}
