import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Field, Icon, TextField } from '@barocss/office-ui';
/* `step` 은 `office-text` 의 것이다 — `office-word` 는 되팔 뿐이었다(제품→제품 가짜 변). */
import { step } from '@barocss/office-text';
import {
  boxOfMatch,
  deckMatches,
  labelOfBox,
  matchesOn,
  matchesPerSlide,
  replaceInDeck,
  type DeckMatch
} from '@barocss/office-slides';
import { useEditorRevision } from '@barocss/office-editor-ui';

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
 * searching, `deckMatches` adds the slide each answer is on and resolves what the
 * slide's **cards** draw, and `replaceInDeck` does the writing — see
 * `office-slides/src/find.ts` for what is searched, what a replace may not touch,
 * and the one limit that is written down rather than worked around.
 *
 * What is here: a box to type in, the count, the two arrows, and the one thing a
 * deck's find has to do that a document's does not — **change the slide** on the
 * way to a match.
 *
 * ## And one refusal, said in words
 *
 * A match in a card is either this placement's **answer** — replaceable, one
 * placement at a time — or the card's **own words**, which a find box may not
 * rewrite: that would change every placement of the card in the deck without
 * saying so. So 바꾸기 greys out with the reason, and 모두 says how many it left.
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
  /**
   * How many of a set 모두 바꾸기 left alone, so it can say so.
   *
   * Up here with the other state rather than beside the button that sets it: this component returns
   * early when it is closed, and a hook after that line is a hook that runs on some renders and not
   * others — which React refuses, and which took the whole find bar off the screen when it was
   * written down there.
   */
  const [left, setLeft] = useState(0);
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
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
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
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    return store && rootId ? { rootId, getNode: (sid: string) => store.getNode(sid) } : null;
  };

  const here = matches[at];

  /**
   * Whether the current match is one this bar can write.
   *
   * A card's own words are found and named and **not** replaceable from here (§10h, and the header
   * above). Greyed with the reason rather than accepted and silently skipped, which is the rule
   * this product follows everywhere the model has no answer for a gesture.
   */
  const cardsOwn = here?.where === 'card' && !here.varName;

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
                here
                  ? ` · ${numberOf(here.slideSid)}장${
                      here.where === 'note' ? ' 노트' : here.where === 'card' ? ' 카드' : ''
                    }`
                  : ''
              }`}
      </span>

      <Button title="이전" data={{ 'find-prev': '' }} onClick={() => walk(-1)}>
        <Icon name="previous" size={14} />
      </Button>
      <Button title="다음" data={{ 'find-next': '' }} onClick={() => walk(1)}>
        <Icon name="next" size={14} />
      </Button>

      <Button
        title={
          cardsOwn
            ? '이 글자는 컴포넌트 정의의 것입니다 — 여기서 바꾸면 놓인 곳이 모두 바뀌므로, 컴포넌트를 열어 고치세요'
            : '바꾸기'
        }
        data={{ 'find-replace': '' }}
        disabled={!here || cardsOwn}
        onClick={() => {
          const access = doc();
          if (!here || !editor || !access) return;
          void replaceInDeck(editor, access as never, [here], replacement);
          // The list is rebuilt from the document, so the index stays where it is
          // and the *next* answer arrives under it.
        }}
      >
        바꾸기
      </Button>

      {/*
        Replace all, slide by slide.

        One transaction per slide rather than one for the deck: replacing shifts the
        offsets of every match after it in the same run, and `replaceInDeck` handles
        that within one call — a run's characters and a placement's value both, so a
        slide's whole replacement is one press of undo. Slide by slide also gives a
        reader a history they can walk back through: undoing "all" in a sixty-slide
        deck as one step is not an undo anybody wants.
      */}
      <Button
        title="모두 바꾸기"
        data={{ 'find-replace-all': '' }}
        onClick={async () => {
          const access = doc();
          if (!editor || !access) return;
          let refused = 0;
          for (const slide of slides) {
            const on = matchesOn(matches, slide.sid);
            if (on.length === 0) continue;
            const done = await replaceInDeck(editor, access as never, on, replacement);
            refused += done.refused.length;
          }
          // Said, not swallowed: a reader who replaced 40 of 43 has to be told about the three.
          setLeft(refused);
          setAt(-1);
        }}
      >
        모두
      </Button>

      {/*
        What 모두 left alone, and why — the other half of the refusal above.

        A count rather than a list: the matches are still in the bar and stepping through them is how
        a reader gets to each one, so this is the number that tells them to.
      */}
      {left > 0 && (
        <span className="sl-find-left" data-find-left={left}>
          {left}곳은 컴포넌트 정의의 글자라 그대로 뒀습니다
        </span>
      )}

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
            /*
             * A match in a **card** names the placement, because its own sid is a piece of the
             * drawing (`card~…`) and walking up from it reaches nothing in the document.
             */
            const from = here.where === 'card' ? here.placementSid : here.sid;
            const box = from ? boxOfMatch(access as never, from) : undefined;
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
