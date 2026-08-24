import { useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Dialog, DialogButton, PropertyRow } from '@barocss/office-ui';
import {
  accessOfTree,
  componentBehindSource,
  componentSourceOf,
  componentsOf,
  deckFileText,
  readDeckFile
} from '@barocss/office-slides';
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
  /**
   * The definitions one library deck offers, once a reader asks to look inside it.
   *
   * Read on asking rather than for every row: a library of ten decks is ten files, and a list a
   * reader is scanning does not need to have opened all of them. `accessOfTree` is what makes this
   * cheap at all — the deck is answered *without being loaded*, so the deck on screen stays where
   * it is.
   */
  const [inside, setInside] = useState<{
    deck: string;
    parts: Array<{ id: string; name: string; here?: string; behind: boolean }>;
  } | null>(null);

  const reread = () => {
    void libraryRows()
      .then(setRows)
      .catch(() => setProblem('라이브러리를 읽을 수 없습니다.'));
  };

  useEffect(() => {
    if (!open) return;
    reread();
    /*
     * And what was open inside a deck is **forgotten**.
     *
     * Measured: the list of one deck's definitions stayed from the last time the dialog was open,
     * so the button that opens it closed it instead — and worse, that list is exactly the thing
     * that may have changed in between. A brand kit a reader edited two minutes ago is the case
     * this whole feature is for.
     */
    setInside(null);
    setSources({});
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

  /**
   * What that deck defines, and what this deck already has of it.
   *
   * Three states per definition, and they are three different sentences: not here yet, here and
   * the same, here and **behind**. The last one is the whole reason a library is not a paste —
   * `componentBehindSource` compares what the copy recorded with what the source says now.
   */
  const look = async (row: LibraryRow) => {
    const text = await libraryDeck(row.name);
    if (!text) return setProblem('그 덱을 찾을 수 없습니다.');
    const read = readDeckFile(text);
    if ('error' in read) return setProblem(read.error);

    const source = accessOfTree(read.document as never);
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    const host =
      store && rootId ? { rootId, getNode: (sid: string) => store.getNode(sid) } : undefined;
    const mine = host ? componentsOf(host as never) : [];

    setSources((was) => ({ ...was, [row.name]: read.document }));
    setInside({
      deck: row.name,
      parts: componentsOf(source).map((one) => {
        const copy = mine.find((made) => {
          const from = componentSourceOf(host as never, made);
          return from?.deck === row.name && from.id === one.id;
        });
        return {
          id: one.id,
          name: one.name || one.id,
          here: copy?.id,
          behind: copy ? componentBehindSource(host as never, copy, source) : false
        };
      })
    });
    setProblem(undefined);
  };

  /** The decks read while looking, so an import does not fetch the same file twice. */
  const [sources, setSources] = useState<Record<string, unknown>>({});

  const bring = async (deck: string, componentId: string) => {
    const source = sources[deck] ?? (await (async () => {
      const text = await libraryDeck(deck);
      if (!text) return undefined;
      const read = readDeckFile(text);
      return 'error' in read ? undefined : read.document;
    })());
    if (!source) return setProblem('그 덱을 읽을 수 없습니다.');

    /*
     * The command does the document work and this hands it the source, because whether `brand-kit`
     * is a name in a library or an address to fetch is the host's question (§11i) and a model that
     * reached for storage would be a model nobody could test in milliseconds.
     */
    await (editor as any)?.executeCommand?.('importComponent', { deck, componentId, source });
    const row = rows.find((one) => one.name === deck);
    if (row) await look(row);
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
                {/* What this deck *defines*, which is the other half of what a library is for. */}
                <DialogButton
                  data-library-look={row.name}
                  onClick={() => void (inside?.deck === row.name ? setInside(null) : look(row))}
                >
                  컴포넌트
                </DialogButton>
                <DialogButton data-library-open={row.name} onClick={() => void load(row)}>
                  열기
                </DialogButton>
                <DialogButton data-library-drop={row.name} onClick={() => void drop(row)}>
                  지우기
                </DialogButton>
              </span>
              {/*
                * The definitions that deck offers, in three states — not here, here, here and
                * behind. A library that could only *say* something has moved on would be a badge;
                * offering the newer copy beside it is what makes it a library.
                */}
              {inside?.deck === row.name && (
                <ol className="sl-library-parts" data-library-parts={row.name}>
                  {inside.parts.length === 0 ? (
                    <li className="sl-library-none">이 덱에는 컴포넌트가 없습니다.</li>
                  ) : (
                    inside.parts.map((part) => (
                      <li key={part.id} data-library-part={part.id}>
                        <span>{part.name}</span>
                        {part.here && !part.behind && (
                          <span className="sl-library-have" data-library-have={part.here}>
                            가져와 있음
                          </span>
                        )}
                        {part.behind && (
                          <span className="sl-library-behind" data-library-behind={part.here}>
                            뒤처짐
                          </span>
                        )}
                        <DialogButton
                          data-library-bring={part.id}
                          onClick={() => void bring(row.name, part.id)}
                        >
                          {part.behind ? '다시 가져오기' : part.here ? '덮어쓰기' : '가져오기'}
                        </DialogButton>
                      </li>
                    ))
                  )}
                </ol>
              )}
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
