import { useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Dialog, DialogButton, PropertyRow } from '@barocss/office-ui';
import { deckFileText, readDeckFile } from '@barocss/office-slides';
import { dropFromLibrary, keepInLibrary, libraryDeck, libraryRows, type LibraryRow } from './library';

/**
 * The reader's own decks, **by name**.
 *
 * ## What it is for
 *
 * Two features asked for the same thing and neither could have it: a button into another deck can
 * only point at a source the product can fetch (canvas-model §11h), and a shared component library
 * needs definitions that live in another document (§10). Both need *"the decks I have"* to be
 * something this product can say.
 *
 * ## What it is not
 *
 * Not a file manager, and not a replacement for 저장. A file is the deck a reader can email,
 * put in a repository and open on another machine; the library is the deck they can **point at
 * from inside a document**. So this sits beside 저장 rather than instead of it, and every row here
 * is also a file the moment they press 저장.
 */
export function LibraryDialog({
  editor,
  open,
  onClose,
  onOpened,
  /** The name this deck is kept under, if the reader opened it from the library. */
  name,
  onName
}: {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
  onOpened?: () => void;
  name?: string;
  onName?: (name: string | undefined) => void;
}) {
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [problem, setProblem] = useState<string>();

  const reread = () => {
    void libraryRows()
      .then(setRows)
      .catch(() => setProblem('라이브러리를 읽을 수 없습니다.'));
  };

  useEffect(() => {
    if (open) reread();
    // Re-read on opening rather than watching the store: another tab could have changed it, and a
    // list a reader is not looking at is a list nobody has to keep fresh.
  }, [open]);

  const keep = async () => {
    const tree = (editor as any)?.exportDocument?.();
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!tree || !store || !rootId) return;
    try {
      /*
       * The same text 저장 writes, so a row and a file cannot drift apart — and the name is kept
       * when the reader already has one: saving 가격표 again is saving *that* deck, and minting a
       * second name would leave every button pointing at the old copy.
       */
      const row = await keepInLibrary(
        { rootId, getNode: (sid: string) => store.getNode(sid) } as never,
        deckFileText(tree, new Date().toISOString()),
        name
      );
      onName?.(row.name);
      setProblem(undefined);
      reread();
    } catch {
      setProblem('이 덱을 라이브러리에 넣을 수 없습니다.');
    }
  };

  const load = async (row: LibraryRow) => {
    const text = await libraryDeck(row.name);
    if (!text) return setProblem('그 덱을 찾을 수 없습니다.');
    const read = readDeckFile(text);
    if ('error' in read) return setProblem(read.error);
    /*
     * The same confirmation 열기 asks, for the same reason: a new document takes the history with
     * it, so it is the one thing here a reader can lose work to — and it is asked only when there
     * *is* work to lose.
     */
    if ((editor as any)?.canUndo?.() && !window.confirm('저장하지 않은 변경이 사라집니다. 계속할까요?')) {
      return;
    }
    (editor as any)?.loadDocument?.(read.document, 'slides');
    onName?.(row.name);
    onClose();
    onOpened?.();
  };

  const drop = async (row: LibraryRow) => {
    // The decks that point at it are not changed: their button warns, honestly, which is what the
    // check already says about a link out of a deck.
    if (!window.confirm(`${row.title || row.name} 을 라이브러리에서 지울까요?`)) return;
    await dropFromLibrary(row.name);
    if (name === row.name) onName?.(undefined);
    reread();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="덱 라이브러리"
      description="이름으로 가리킬 수 있는 내 덱들입니다. 다른 덱으로 가는 버튼이 이 이름을 씁니다."
      footer={
        <>
          <DialogButton data-library-close onClick={onClose}>
            닫기
          </DialogButton>
          <DialogButton variant="primary" data-library-keep onClick={() => void keep()}>
            {name ? `${name} 에 저장` : '지금 덱 넣기'}
          </DialogButton>
        </>
      }
    >
      {problem && (
        <p className="text-xs text-[#b91c1c]" role="alert" data-library-problem>
          {problem}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">
          아직 넣은 덱이 없습니다. 지금 덱을 넣으면 다른 덱에서 이 이름으로 가리킬 수 있습니다.
        </p>
      ) : (
        <ol className="sl-library-list">
          {rows.map((row) => (
            <li key={row.name} data-library-row={row.name}>
              <span className="sl-library-name">
                <code>{row.name}</code>
                <span className="sl-library-title">{row.title || '제목 없음'}</span>
                <span className="sl-library-pages">{row.pages}장</span>
              </span>
              <span className="sl-library-actions">
                <DialogButton data-library-open={row.name} onClick={() => void load(row)}>
                  열기
                </DialogButton>
                <DialogButton data-library-drop={row.name} onClick={() => void drop(row)}>
                  지우기
                </DialogButton>
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* What a name is *for*, said where the names are. */}
      <PropertyRow label="쓰는 곳">
        <span className="text-xs text-neutral-500">
          도형의 <b>누르면 → 다른 덱</b> 에 이 이름을 적으면, 발표 중 그 덱이 열립니다.
        </span>
      </PropertyRow>
    </Dialog>
  );
}
