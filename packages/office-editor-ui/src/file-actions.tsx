import { useImperativeHandle, useState, type Ref } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, FilePick, Icon } from '@barocss/office-ui';

/**
 * **Saving a document to a file, opening one, and starting a new one** — for any product.
 *
 * ## What was here before
 *
 * `office-slides` wrote this first as `file-actions.tsx`, 183 lines, and it is good. Reading it,
 * four things in it are about **decks**: how a deck's title is found, which file format to use,
 * what a new deck *is*, and the string `'slides'` handed to `loadDocument`. Everything else — the
 * blob, the anchor, Safari's revoke, asking only when there is work to lose, showing the refusal
 * a reader can act on — is true of every document this engine holds.
 *
 * Word had none of it. `apps/word/src/main.tsx` loaded the sample on every reload, so a reader
 * could write a page and it was gone when they came back. The roadmap's diagram said the rest:
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * ## Why the browser's own download and no dialog of ours
 *
 * An `<a download>` with a blob is the whole of saving in a web app: the browser asks where,
 * remembers the folder, and shows the file in its own downloads list. A dialog of ours would be a
 * second, worse version of a thing the reader already knows — and the File System Access API,
 * which *would* give a real "save over the file I opened", is Chromium-only. Worth adding behind a
 * check later; not worth being the only way to save.
 *
 * ## Opening replaces the document, so it asks first
 *
 * `loadDocument` is not an edit — it is a new document, and it takes the history with it, so there
 * is no undo back to what was on screen. That is the one thing here a reader could lose work to,
 * so it asks, and **only when there is work**: a reader who has changed nothing is not made to
 * confirm anything.
 */

/** The three acts, handed to whoever drew the control that asks for them. */
export interface DocumentFileActions {
  create: () => void;
  save: () => void;
  /** Ask the browser for a file. The reading happens here when one comes back. */
  open: () => void;
}

/** What a product says about its own documents. Four things, and they are the four that differ. */
export interface DocumentFileKind {
  /** `loadDocument`'s session id — `'word'`, `'slides'`. */
  session: string;
  /** The file's text, from an exported tree. */
  text: (document: unknown, savedAt?: string) => string;
  /** Reading one, and saying which of the four things is wrong with it. */
  read: (source: string) => { document: unknown; version: number } | { error: string };
  /** What a reader sees in their downloads folder, from what the document is called. */
  fileName: (editor: Editor) => string;
  /** What a new document *is* — a fact about documents, not about this chrome. */
  starter: () => unknown;
  /** The accepted extensions for the picker, as an `accept` attribute. */
  accept?: string;
  /** What the picker calls the file, for a screen reader — 슬라이드 파일, 문서 파일. */
  ariaLabel?: string;
  /** The product's own class prefix, so its stylesheet can reach these two spans. */
  prefix?: string;
}

export interface FileActionsProps {
  editor: Editor | null;
  kind: DocumentFileKind;
  onOpened?: () => void;
  ref?: Ref<DocumentFileActions>;
}

/**
 * The picker, and nothing else drawn.
 *
 * A **ref** rather than three props passed down, because the thing that has to stay mounted is the
 * picker's hidden input: a file cannot be handed to a browser by any amount of clicking a button,
 * so the input has to exist in the DOM whether or not there is a button beside it. Where the
 * reader *asks* — a menubar, a toolbar — is the product's, and that is exactly what an imperative
 * handle is for.
 */
export function FileActions({ editor, kind, onOpened, ref }: FileActionsProps) {
  const [problem, setProblem] = useState<string>();
  const [picker, setPicker] = useState<HTMLInputElement | null>(null);

  const save = () => {
    const tree = editor?.exportDocument();
    if (!tree || !editor) return;

    const text = kind.text(tree, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = kind.fileName(editor);
    link.click();
    /*
     * Revoked on the next turn rather than immediately: Safari has not started reading the blob
     * when `click()` returns, and a revoked URL there is a download that silently produces nothing.
     */
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * The confirmation, which both of the gestures below need.
   *
   * Asked only when there *is* work to lose. `canUndo()` is the honest test for that: it is false
   * on a document nobody has touched and true the moment they have.
   */
  const mayReplace = () =>
    !editor?.canUndo() || window.confirm('저장하지 않은 변경이 사라집니다. 계속할까요?');

  const openFile = async (file: File) => {
    setProblem(undefined);
    const read = kind.read(await file.text());
    if ('error' in read) {
      /* The refusal names which of the four things is wrong, so it is shown rather than logged. */
      setProblem(read.error);
      return;
    }
    if (!mayReplace()) return;

    editor?.loadDocument?.(read.document, kind.session);
    onOpened?.();
  };

  const create = () => {
    setProblem(undefined);
    if (!mayReplace()) return;
    editor?.loadDocument?.(kind.starter(), kind.session);
    onOpened?.();
  };

  useImperativeHandle(ref, () => ({ create, save, open: () => picker?.click() }));

  const prefix = kind.prefix ?? 'w';

  return (
    <>
      {/*
        * The input is found through the host rather than handed back by the component, because
        * `FilePick` owns the awkward part — hide it, click it from something, clear its value so
        * the same file twice is two openings — and that is worth keeping in one place.
        */}
      <span
        className={`${prefix}-file-picker`}
        ref={(host) => setPicker(host?.querySelector('input') ?? null)}
      >
        <FilePick
          title="파일 열기"
          accept={kind.accept ?? '.json,application/json'}
          ariaLabel={kind.ariaLabel ?? '문서 파일'}
          onPick={(file) => void openFile(file)}
        >
          열기
        </FilePick>
      </span>

      {/*
        * What was wrong with the file, in the chrome rather than in an alert.
        *
        * An `alert` stops the app to say a sentence and is gone before the reader can read it
        * twice; this stays until they try again. The refusal already names *which* of the four
        * things is wrong, which is the difference between a reader trying another file and a
        * reader filing a bug.
        */}
      {problem && (
        <span className={`${prefix}-file-problem`} role="alert">
          {problem}
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
