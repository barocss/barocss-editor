import { useImperativeHandle, useState, type Ref } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Icon, Button, FilePick } from '@barocss/office-ui';
import {
  createStarterDeck,
  deckFileName,
  deckFileText,
  deckTitle,
  readDeckFile
} from '@barocss/office-slides';

/**
 * Saving a deck to a file and opening one — the last thing Deck 4 was missing.
 *
 * Everything the deck can now express lasted until the page was reloaded, which
 * makes a presentation tool a demo of one.
 *
 * ## Why the browser's own download and no dialog of ours
 *
 * A `<a download>` with a blob is the whole of saving in a web app: the browser
 * asks where, remembers the folder, and shows the file in its own downloads list.
 * A dialog of ours would be a second, worse version of a thing the reader already
 * knows — and the File System Access API, which *would* give a real "save over
 * the file I opened", is Chromium-only. Worth adding behind a check later; not
 * worth being the only way to save.
 *
 * ## Opening replaces the deck, so it asks first
 *
 * `loadDocument` is not an edit — it is a new document, and it takes the history
 * with it, so there is no undo back to what was on screen. That is the one thing
 * here a reader could lose work to, so it asks, and only when there *is* work:
 * a reader who has changed nothing is not made to confirm anything.
 */
/**
 * The three acts, handed to whoever drew the control that asks for them.
 *
 * A **ref** rather than three props passed down, because the thing that has to stay here is the
 * picker's hidden input: a file cannot be handed to a browser by any amount of clicking a button,
 * so the input has to exist in the DOM whether or not there is a button beside it. What moved out
 * is only *where the reader asks* — the menubar — and that is exactly what an imperative handle is
 * for.
 */
export interface DeckFileActions {
  create: () => void;
  save: () => void;
  /** Ask the browser for a file. The reading happens here when one comes back. */
  open: () => void;
}

export function FileActions({
  editor,
  onOpened,
  ref
}: {
  editor: Editor | null;
  onOpened?: () => void;
  ref?: Ref<DeckFileActions>;
}) {
  const [problem, setProblem] = useState<string>();
  const [picker, setPicker] = useState<HTMLInputElement | null>(null);

  const save = () => {
    const tree = editor?.exportDocument();
    if (!tree) return;

    /**
     * Named after what is *on* the deck, read at the moment of saving.
     *
     * The opening slide's title, not the slide's own name — "Title.json" is a
     * filename nobody chose. Read here rather than passed in because it is a fact
     * about the document, and the document is what this is writing.
     */
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    const title =
      store && rootId
        ? deckTitle({ rootId, getNode: (sid: string) => store.getNode(sid) })
        : undefined;

    const text = deckFileText(tree, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = deckFileName(title);
    link.click();
    // Revoked on the next turn rather than immediately: Safari has not started
    // reading the blob when `click()` returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * The confirmation, which both of the gestures below need.
   *
   * A new document takes the history with it, so these are the only two things
   * in this app that can lose work with no undo — and it is asked only when there
   * *is* work to lose: a reader who has changed nothing is not made to confirm
   * anything.
   */
  const mayReplace = () =>
    !editor?.canUndo() ||
    window.confirm('저장하지 않은 변경이 사라집니다. 계속할까요?');

  const open = async (file: File) => {
    setProblem(undefined);
    const read = readDeckFile(await file.text());
    if ('error' in read) {
      setProblem(read.error);
      return;
    }
    if (!mayReplace()) return;

    editor?.loadDocument?.(read.document, 'slides');
    onOpened?.();
  };

  /**
   * A deck of the reader's own, which this app could not start.
   *
   * It could save one and open one, so the only way to begin was to delete
   * somebody else's slides out of the sample. What a new deck *is* — one title
   * slide and the definitions under it — is `createStarterDeck`'s answer, in
   * `office-slides`, because it is a fact about documents rather than about this
   * chrome.
   */
  const create = () => {
    setProblem(undefined);
    if (!mayReplace()) return;
    editor?.loadDocument?.(createStarterDeck(), 'slides');
    onOpened?.();
  };

  useImperativeHandle(ref, () => ({ create, save, open: () => picker?.click() }));

  /**
   * The picker, and nothing else.
   *
   * The three buttons that used to be here are in **파일** now — they were three of the twelve
   * application-level commands strung along the title bar, which is the shape a menubar takes in a
   * product that does not have one. What cannot move is the input: `setInputFiles` needs the real
   * control, and no amount of clicking a button hands a browser a file.
   *
   * `FilePick`'s own button is hidden rather than removed, because the awkward part of a file input
   * — hide it, click it from something, clear its value so the same file twice is two openings — is
   * that component's and worth keeping in one place.
   */
  return (
    <>
      <span className="sl-file-picker" ref={(host) => setPicker(host?.querySelector('input') ?? null)}>
        <FilePick
          title="파일 열기"
          accept=".json,application/json"
          ariaLabel="슬라이드 파일"
          onPick={(file) => void open(file)}
          data={{ 'deck-open': '' }}
          inputData={{ 'deck-file': '' }}
        >
          열기
        </FilePick>
      </span>

      {/*
        * What was wrong with the file, in the chrome rather than in an alert.
        *
        * An `alert` stops the app to say a sentence and is gone before the reader
        * can read it twice; this stays until they try again.
        */}
      {problem && (
        <span className="sl-file-problem" role="alert" data-deck-file-problem>
          {problem}
          {/*
            * Tuned through the control's own prop rather than by a rule in this
            * app's stylesheet, which is how a shared button ends up looking
            * foreign: `.sl-file-problem button` was a more specific selector than
            * anything the component could say about itself.
            */}
          <Button
            square
            ariaLabel="닫기"
            onClick={() => setProblem(undefined)}
            className="h-4 w-4 border-0 text-[10px] hover:bg-transparent"
          >
            <Icon name="close" size={10} />
          </Button>
        </span>
      )}
    </>
  );
}
