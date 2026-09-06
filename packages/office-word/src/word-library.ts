import { documentLibrary, freeLibraryName } from '@barocss/shared';
import { wordTitle } from './word-file';

/**
 * **A reader's own documents, by name** — what Word could not do until today.
 *
 * `apps/word/src/main.tsx` loaded the sample on every reload. Whatever a reader wrote was gone
 * when they came back, and a file they had was a file they could not open. The deck could do both
 * because the deck wrote all of it for itself; the roadmap's diagram said the rest —
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * What is here is what a **document** is in a library. The keeping is
 * `@barocss/shared`'s: IndexedDB, keyed by name, most recently saved first, and the argument for
 * IndexedDB over `localStorage` (a document with two photographs in it is megabytes, and
 * `localStorage` fails by throwing in the middle of a save).
 *
 * ## The count is pages, and it is a lie a list can live with
 *
 * A deck counts slides and a note counts nothing; Word counts **flow surfaces**, which is not the
 * number of printed pages — pagination decides that, and pagination needs a browser and a width.
 * A list showing *"3 sections"* where a reader expects *"12 pages"* would be worse than showing
 * nothing, so this counts the thing the document actually holds and the surface names it.
 */
interface DocumentAccess {
  getNode(sid: string): { stype?: string; text?: string; content?: unknown } | undefined;
  getRootNodeId?(): string | undefined;
  rootId?: string;
}

const LIBRARY = documentLibrary({ db: 'barocss-word', store: 'documents' });

export interface WordLibraryRow {
  name: string;
  title: string;
  /** Flow surfaces, not printed pages — see the note above. */
  surfaces: number;
  savedAt: number;
}

/** How many flow surfaces the document holds, which is what a list can honestly say. */
export function surfaceCount(doc: DocumentAccess): number {
  const rootId = doc.getRootNodeId?.() ?? doc.rootId;
  if (!rootId) return 0;
  const children = (doc.getNode(rootId)?.content ?? []) as string[];
  return children.filter((sid) => doc.getNode(sid)?.stype === 'surface').length;
}

/** Every document the reader has kept, the most recently saved first. */
export async function wordLibraryRows(): Promise<WordLibraryRow[]> {
  const rows = await LIBRARY.rows();
  return rows.map(({ name, title, count, savedAt }) => ({
    name,
    title: title ?? '',
    surfaces: count ?? 0,
    savedAt
  }));
}

/** One document's file, or nothing when the library does not have that name. */
export const wordLibraryDocument = (name: string): Promise<string | undefined> =>
  LIBRARY.text(name);

/**
 * Put this document in the library under a name nothing else is using.
 *
 * An existing name is **kept**, for the reason the deck wrote down: saving the same document again
 * is saving the same document, and minting a second name would leave anything pointing at the old
 * copy — which is the one thing a durable reference must not do.
 */
export async function keepWordDocument(
  doc: DocumentAccess,
  text: string,
  /** The name to overwrite, when a reader is saving one they already have. */
  under?: string
): Promise<WordLibraryRow> {
  const rows = await wordLibraryRows();
  const title = wordTitle(doc) ?? '';
  const name = under ?? freeLibraryName(rows.map((row) => row.name), title, 'document');
  const kept = await LIBRARY.keep({ name, title, count: surfaceCount(doc) }, text);
  return { name: kept.name, title, surfaces: kept.count ?? 0, savedAt: kept.savedAt };
}

/** Take one out. */
export const dropWordDocument = (name: string): Promise<void> => LIBRARY.drop(name);
