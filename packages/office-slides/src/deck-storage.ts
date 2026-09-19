/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import { documentLibrary } from '@barocss/shared';
import { libraryEntry, libraryName, type LibraryEntry } from './deck-library';
import type { DeckAccess } from './deck';

/**
 * Where a reader's decks are **kept** — the half the model deliberately does not have.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * Measured before choosing: the sample deck is 42KB of JSON and the starter is 8KB, and both are
 * pictureless. A deck with two photographs in it is a base64 data URL or two — megabytes — and
 * `localStorage` has about five in total and fails by **throwing in the middle of a save**. A
 * store whose predictable failure is "the reader loses the deck they were saving" is not a store
 * this product should be built on.
 *
 * IndexedDB costs about sixty lines of promise-wrapping, which is the whole of what follows.
 *
 * ## Why this is here and not in the app — and what changed
 *
 * It was in the app, and the reason written here was that `office-slides` has no DOM in it: a
 * library's *naming* is a question about documents and lives in `deck-library.ts`, while where
 * the bytes are is a question about the host.
 *
 * That reason was half right and the half that was wrong is the one that matters. **A different
 * host would answer it differently — but there is only ever one answer per host, and the app was
 * not the only host.** Left in the app it would have been re-written by the second thing that
 * wanted a deck back: the presenter's window, a server-side render, the next product's importer.
 * That is the shape this repository finds every round — *있는데 못 닿는다*.
 *
 * What is still true is the boundary this file respects: **nothing here touches the DOM at import
 * time.** `indexedDB` is named inside functions, so the root entry point stays readable from Node
 * — which is exactly why this is not in `./ui`. It needs a browser, not React.
 *
 * A host without IndexedDB — a server, a test — calls none of this, and the naming half
 * (`deck-library.ts`) stays usable there on its own.
 */

/**
 * **이 파일이 자기가 만들던 것을 이제 `@barocss/shared` 에서 받는다.**
 *
 * 위 문단들의 논증은 그대로 참이고, 한 층 더 밖으로 나갔다: *다른 호스트는 다르게 답하지만
 * 호스트마다 답은 하나다* 가 **제품** 에도 적용된다. 문서에 대해 무엇을 기억하는지는 제품마다
 * 다르고, **바이트를 어디에 두는가** 는 그렇지 않다.
 *
 * 그리고 그 사이에 Word 가 이것을 갖게 됐다. 덱만 저장할 수 있던 동안 Word 는 새로고침마다
 * 샘플을 다시 실었다 — 로드맵 도표의 `[ 서비스 ] 거의 비어 있다` 가 그 자리였다.
 */
export interface LibraryRow extends LibraryEntry {
  savedAt: number;
}

const LIBRARY = documentLibrary({ db: 'barocss-slides', store: 'decks' });

/** Every deck the reader has kept, the most recently saved first. */
export async function libraryRows(): Promise<LibraryRow[]> {
  const rows = await LIBRARY.rows();
  return rows.map(({ name, title, count, savedAt }) => ({ name, title: title ?? '', pages: count ?? 0, savedAt }));
}

/** One deck's file, or nothing when the library does not have that name. */
export const libraryDeck = (name: string): Promise<string | undefined> => LIBRARY.text(name);

/**
 * Put this deck in the library, under a name nothing else is using.
 *
 * The name is minted from the deck's own title (`libraryName`), and an existing name is **kept**:
 * saving 가격표 again is saving the same deck, and minting `가격표-2` would leave every button
 * pointing at the old copy — which is the one thing a durable reference must not do.
 */
export async function keepInLibrary(
  doc: DeckAccess,
  text: string,
  /** The name to overwrite, when a reader is saving one they already have. */
  under?: string
): Promise<LibraryRow> {
  const rows = await libraryRows();
  const entry = libraryEntry(
    doc,
    under ?? libraryName(rows.map((row) => row.name), libraryEntry(doc, '').title)
  );
  const kept = await LIBRARY.keep({ name: entry.name, title: entry.title, count: entry.pages }, text);
  return { name: kept.name, title: entry.title, pages: entry.pages, savedAt: kept.savedAt };
}

/** Take one out. The decks that pointed at it are not changed: their button now warns, honestly. */
export const dropFromLibrary = (name: string): Promise<void> => LIBRARY.drop(name);
