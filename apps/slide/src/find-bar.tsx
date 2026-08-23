import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Field, Icon, TextField } from '@barocss/office-ui';
import { replaceMatches, step } from '@barocss/office-word';
import {
  boxOfMatch,
  deckMatches,
  labelOfBox,
  matchesOn,
  matchesPerSlide,
  type DeckMatch
} from '@barocss/office-slides';
import { useEditorRevision } from './revision';

/**
 * Finding and replacing across the deck.
 *
 * ## Why a deck cannot do without it
 *
 * Changing an old product name in a hundred-slide deck cannot be done by hand.
 * Turning the pages and reading each one, two or three get missed every time —
 * and unlike a document there is no scrollbar to run your eye down: a match on
 * slide 61 is invisible until you are on slide 61.
 *
 * ## What is this file's, and what is not
 *
 * Everything about *what matches* is a model. Word's `findMatches` does the
 * searching, `deckMatches` adds the slide each answer is on, and Word's
 * `replaceMatches` does the writing — see `office-slides/src/find.ts` for what is
 * searched and the one limit that is written down rather than worked around.
 *
 * What is here: a box to type in, the count, the two arrows, and the one thing a
 * deck's find has to do that a document's does not — **change the slide** on the
 * way to a match.
 *
 * ## Going to a match is going to a slide
 *
 * A document scrolls; a deck has to be on the right slide first. So stepping calls
 * back to the app, which owns which slide is showing — the same arrangement the
 * filmstrip and the presenter use, and the reason this takes `onGoTo` rather than
 * reaching for the deck itself.
 */
export function FindBar({
  editor,
  slides,
  open,
  onClose,
  onGoTo
}: {
  editor: Editor | null;
  /** So a match can be reported as "slide 4 of 12" rather than as a sid. */
  slides: { sid: string; number: number }[];
  open: boolean;
  onClose: () => void;
  /** Show this slide, because the next match is on it. */
  onGoTo: (slideSid: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [at, setAt] = useState(-1);
  const field = useRef<HTMLInputElement>(null);
  const revision = useEditorRevision(editor);

  /**
   * Re-run whenever the document changes.
   *
   * A search whose answers are older than the document is a search that takes a
   * reader to a match that is not there — and replacing one changes the offsets of
   * every match after it in the same run, so this cannot be a list held from when
   * the query was typed.
   */
  const matches = useMemo<DeckMatch[]>(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId || !query) return [];
    return deckMatches({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, query);
  }, [editor, query, revision]);

  const perSlide = useMemo(() => matchesPerSlide(matches), [matches]);

  // Focused when it opens, because a reader who pressed Ctrl+F is about to type.
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  if (!open) return null;

  const numberOf = (slideSid: string) =>
    slides.find((slide) => slide.sid === slideSid)?.number ?? 0;

  const goTo = (index: number) => {
    const match = matches[index];
    if (!match) return;
    setAt(index);
    onGoTo(match.slideSid);
  };

  const walk = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    goTo(step(matches.length, at, direction));
  };

  const doc = () => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    return store && rootId ? { rootId, getNode: (sid: string) => store.getNode(sid) } : null;
  };

  const here = matches[at];

  return (
    <div className="sl-find" data-find>
      <Field label="찾기">
        {/*
          * Live, not committed: the count beside it answers the query as it grows, and
          * a reader who has to press Enter to see how many matches there are has been
          * given a form to fill in instead of a search. `TextField` does both — see the
          * note on `onChange` there, which exists because of this field.
          */}
        <TextField
          inputRef={field}
          ariaLabel="찾을 내용"
          testClass="sl-find-query"
          data={{ 'find-query': '' }}
          value={query}
          onChange={(next) => {
            setQuery(next);
            // A new query has no current match: keeping the old index would take
            // the next press to the fourth answer of a different question.
            setAt(-1);
          }}
          onKeys={(event) => {
            if (event.key === 'Enter') walk(event.shiftKey ? -1 : 1);
            if (event.key === 'Escape') onClose();
          }}
        />
      </Field>

      <Field label="바꾸기">
        <TextField
          ariaLabel="바꿀 내용"
          testClass="sl-find-replacement"
          data={{ 'find-replacement': '' }}
          value={replacement}
          onChange={setReplacement}
        />
      </Field>

      {/*
        The count, and *where*.

        "12개" in a sixty-slide deck says nothing about where the work is, so the
        current match says which slide it is on and, when it is in the script rather
        than on the slide, says that too — a reader taken to a note needs to know
        why the slide looks unchanged.
      */}
      <span className="sl-find-count" data-find-count>
        {query === ''
          ? ''
          : matches.length === 0
            ? '없음'
            : `${at < 0 ? '—' : at + 1} / ${matches.length}${
                here ? ` · ${numberOf(here.slideSid)}장${here.where === 'note' ? ' 노트' : ''}` : ''
              }`}
      </span>

      <Button title="이전" data={{ 'find-prev': '' }} onClick={() => walk(-1)}>
        <Icon name="previous" size={14} />
      </Button>
      <Button title="다음" data={{ 'find-next': '' }} onClick={() => walk(1)}>
        <Icon name="next" size={14} />
      </Button>

      <Button
        title="바꾸기"
        data={{ 'find-replace': '' }}
        onClick={() => {
          if (!here || !editor) return;
          const { sid, start, end } = here;
          void replaceMatches(editor, [{ sid, start, end }], replacement);
          // The list is rebuilt from the document, so the index stays where it is
          // and the *next* answer arrives under it.
        }}
      >
        바꾸기
      </Button>

      {/*
        Replace all, slide by slide.

        One transaction per slide rather than one for the deck: replacing shifts the
        offsets of every match after it in the same run, and Word's `replaceMatches`
        already handles that within one call. Slide by slide also gives a reader a
        history they can walk back through — undoing "all" in a sixty-slide deck as
        one step is not an undo anybody wants.
      */}
      <Button
        title="모두 바꾸기"
        data={{ 'find-replace-all': '' }}
        onClick={async () => {
          if (!editor || !doc()) return;
          for (const slide of slides) {
            const on = matchesOn(matches, slide.sid);
            if (on.length > 0) await replaceMatches(editor, on, replacement);
          }
          setAt(-1);
        }}
      >
        모두
      </Button>

      {/*
        Which shape the current match is in, so a reader knows where to look on a
        slide with nine text boxes on it.
      */}
      {here && (
        <span className="sl-find-where" data-find-where>
          {(() => {
            const access = doc();
            if (!access) return '';
            /**
             * The *shape*, not the run.
             *
             * A match's own sid is the run of text it was found in, three levels
             * below anything a reader has a name for. `boxOfMatch` walks up to what
             * the canvas placed, and answers nothing for a match in the notes —
             * where there is no shape to name and the count has already said 노트.
             */
            const box = boxOfMatch(access as never, here.sid);
            return box ? labelOfBox(access as never, box) : '';
          })()}
        </span>
      )}

      <span className="sl-find-slides" data-find-slides>
        {perSlide.size > 1 ? `${perSlide.size}장에 걸쳐` : ''}
      </span>

      <Button title="닫기" data={{ 'find-close': '' }} onClick={onClose}>
        <Icon name="close" size={14} />
      </Button>
    </div>
  );
}
