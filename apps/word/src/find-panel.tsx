import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { findMatches, replaceMatches, step, type Match } from '@barocss/office-word';
import { Icon } from '@barocss/office-icons';
import { Button, cn, IconButton } from '@barocss/office-ui';

/**
 * Find and replace.
 *
 * The searching is the product's and lives there; this is the window onto it.
 * The shared kit ships a find that builds its own panel with
 * `document.createElement` and fixed positioning — which decides what every
 * host's search box looks like, and forces every host to have a DOM. This is
 * the same split the toolbar has: the product says what a match is and where
 * they are, and the app decides how to show them.
 *
 * The state lives here rather than in the editor for the same reason. What a
 * reader is searching for is not part of their document: it survives no edit,
 * belongs in no undo step, and two people reading the same document are not
 * searching for the same thing.
 */
const MATCH_STYPE = 'w-find-match';

export function FindPanel({
  editor,
  view,
  open,
  onClose
}: {
  editor: Editor;
  view: EditorViewDOM;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [revision, setRevision] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  const doc = useMemo(
    () => ({
      getNode: (id: string) => (editor as unknown as { dataStore: { getNode(id: string): unknown } }).dataStore.getNode(id),
      rootId: (editor as unknown as { getRootId(): string }).getRootId()
    }),
    [editor]
  );

  // Re-run whenever the document changes: a search whose answers are older than
  // the text is a search that offers to replace something that has moved.
  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    editor.on('editor:content.change', bump);
    return () => editor.off('editor:content.change', bump);
  }, [editor]);

  const matches: Match[] = useMemo(
    () => (open ? findMatches(doc as never, query, { caseSensitive, wholeWord }) : []),
    [doc, query, caseSensitive, wholeWord, open, revision]
  );

  /**
   * Draw the matches, with the current one told apart from the rest.
   *
   * All of them in one call: adding them one by one renders the document once
   * per match, which for forty matches is eighty renders to show and hide them
   * and a page that stops answering.
   */
  useEffect(() => {
    view.setDecorators(
      MATCH_STYPE,
      matches.map((match, index) => ({
        sid: `find-${index}`,
        stype: MATCH_STYPE,
        category: 'inline',
        target: { sid: match.sid, startOffset: match.start, endOffset: match.end },
        data: { current: index === current }
      })) as never
    );
    return () => view.setDecorators(MATCH_STYPE, []);
  }, [view, matches, current]);

  // A new search starts from the top rather than wherever the last one ended.
  useEffect(() => setCurrent(matches.length > 0 ? 0 : -1), [query, caseSensitive, wholeWord]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const go = useCallback(
    (direction: 1 | -1) => setCurrent((index) => step(matches.length, index, direction)),
    [matches.length]
  );

  const replaceCurrent = useCallback(async () => {
    const match = matches[current];
    if (!match) return;
    await replaceMatches(editor, [match], replacement);
    // Stay where you are: the next match has shifted up into this index, which
    // is what a reader pressing Replace repeatedly expects.
    setCurrent((index) => Math.min(index, matches.length - 2));
  }, [editor, matches, current, replacement]);

  const replaceAll = useCallback(async () => {
    if (matches.length === 0) return;
    await replaceMatches(editor, matches, replacement);
    setCurrent(-1);
  }, [editor, matches, replacement]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'w-find-panel absolute right-4 top-2 z-30 w-80 rounded border bg-white p-3 shadow-md',
        'border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900'
      )}
      role="search"
      aria-label="Find and replace"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Enter') {
          event.preventDefault();
          go(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <div className="flex items-center gap-1">
        <input
          ref={field}
          className="w-find-query h-7 flex-1 rounded border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          placeholder="Find"
          aria-label="Find"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="w-find-count w-16 text-right text-xs tabular-nums text-neutral-500">
          {matches.length === 0 ? (query ? 'None' : '') : `${current + 1} / ${matches.length}`}
        </span>
        {/*
          * Three icon buttons that used to carry a class of their own — `h-7 w-7` with this
          * file's own hover grey, which is 28px by coincidence rather than by the token.
          */}
        <IconButton label="Previous match" onClick={() => go(-1)}>
          <Icon name="previous" size={14} />
        </IconButton>
        <IconButton label="Next match" onClick={() => go(1)}>
          <Icon name="next" size={14} />
        </IconButton>
        <IconButton label="Close find" onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <input
          className="w-find-replacement h-7 flex-1 rounded border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          placeholder="Replace with"
          aria-label="Replace with"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
        />
        {/* Words, so these are the *form control* — `Button` — and not the icon one. */}
        <Button disabled={current < 0} onClick={() => void replaceCurrent()}>
          Replace
        </Button>
        <Button
          // Named in full for anything that reads it aloud: "All" on its own is
          // not a thing anyone can act on.
          ariaLabel="Replace all"
          disabled={matches.length === 0}
          onClick={() => void replaceAll()}
        >
          All
        </Button>
      </div>

      <div className="mt-2 flex gap-3 text-xs text-neutral-600 dark:text-neutral-400">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            className="w-find-case"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />
          Match case
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            className="w-find-whole"
            checked={wholeWord}
            onChange={(event) => setWholeWord(event.target.checked)}
          />
          Whole word
        </label>
      </div>
    </div>
  );
}

export { MATCH_STYPE };
