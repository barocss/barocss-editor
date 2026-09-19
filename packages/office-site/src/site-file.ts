import { documentFileFormat, documentLibrary, freeLibraryName } from '@barocss/shared';
import { documentTitle, type MetaAccess } from '@barocss/office-text';
import { pagesOf } from './selection';

/**
 * **A site as a file, and a reader's own sites by name** — what this product could not do.
 *
 * `apps/site/src/main.tsx:63` loaded the sample on every reload. Whatever a reader built was gone
 * when they came back, and a file they had was a file they could not open. The deck could do both
 * because the deck wrote all of it for itself; the roadmap's diagram said the rest —
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * What is here is what the site says about itself. The envelope, the session sids that must not go
 * in a file, the four refusals, the safe filename, IndexedDB and minting a free name are all
 * `@barocss/shared`'s — three hundred and eighty lines this file does not restate. Word's binding
 * is the same shape and the same length, which is the measurement worth keeping: **the second
 * product cost four sentences.**
 *
 * ## What a site counts, and why not pages of a browser
 *
 * Pages. A `page` is a node in the document and the reader put it there, so a list can say *"7
 * 페이지"* and be right whatever the browser does. That is the opposite of Word, where the pages
 * are pagination's answer and depend on a width — there the honest count is flow surfaces, and
 * `word-library.ts` says so where a reader can read it.
 */

/** What every site file says it is. */
export const SITE_FORMAT = 'barocss-site';

/**
 * The shape of the file, which is one number.
 *
 * Bumped when a document written by this product would be **misread** by an older one — not when
 * the schema grows an attribute, which is the whole point of attributes being optional and read
 * with defaults.
 */
export const SITE_FILE_VERSION = 1;

/**
 * What the site is called.
 *
 * `docMeta → docTitle`, the same place Word keeps it and the same reader — the site's `<title>`,
 * its canonical link and its Open Graph tags already come from there, so a save that invented a
 * second answer would be a site whose file is named one thing and whose pages say another.
 */
export const siteTitle = (doc: MetaAccess): string | undefined => documentTitle(doc);

const FORMAT = documentFileFormat({
  format: SITE_FORMAT,
  noun: '사이트',
  version: SITE_FILE_VERSION,
  extension: '.site.json'
});

/** The text of the file — what 저장 writes and 열기 reads, so the two cannot drift apart. */
export const siteFileText = (document: unknown, savedAt?: string): string =>
  FORMAT.text(document, savedAt);

/** Reading a site file, and saying which of the four things is wrong with it. */
export const readSiteFile = FORMAT.read;

/** What a reader sees in their downloads folder. */
export const siteFileName = (title: string | undefined): string => FORMAT.fileName(title, '사이트');

/* ── The library ──────────────────────────────────────────────────────────── */

const LIBRARY = documentLibrary({ db: 'barocss-site', store: 'sites' });

export interface SiteLibraryRow {
  name: string;
  title: string;
  /** Pages the document holds — a fact about the document, not about a viewport. */
  pages: number;
  savedAt: number;
}

/**
 * How many pages the site holds, which is what a list can honestly say.
 *
 * **`pagesOf` 를 부른다 — 세는 법을 다시 적지 않는다.** 첫 판은 `stype === 'page'` 인 노드를
 * 재귀로 셌고 0이 나왔다. 사이트에 `page` 라는 노드는 없다 — 페이지는 `kind` 가 사이트의 것인
 * `surface` 이고, 그 판정이 이미 `selection.ts` 에 있다. 그 파일의 주석이 정확히 이것을 경고한다:
 * *"페이지를 뜻하는 함수가 둘이면, 페이지가 뿌리의 직계 자식이 아니게 되는 날 하나가 낡는다."*
 */
export function pageCount(doc: MetaAccess): number {
  const rootId = doc.getRootNodeId?.() ?? doc.rootId;
  if (!rootId) return 0;
  return pagesOf({ rootId, getNode: (sid: string) => doc.getNode(sid) } as never).length;
}

/** Every site the reader has kept, the most recently saved first. */
export async function siteLibraryRows(): Promise<SiteLibraryRow[]> {
  const rows = await LIBRARY.rows();
  return rows.map(({ name, title, count, savedAt }) => ({
    name,
    title: title ?? '',
    pages: count ?? 0,
    savedAt
  }));
}

/** One site's file, or nothing when the library does not have that name. */
export const siteLibraryDocument = (name: string): Promise<string | undefined> =>
  LIBRARY.text(name);

/**
 * Put this site in the library under a name nothing else is using.
 *
 * An existing name is **kept**: saving the same site again is saving the same site, and minting a
 * second name would leave anything pointing at the old copy — which is the one thing a durable
 * reference must not do.
 */
export async function keepSite(
  doc: MetaAccess,
  text: string,
  /** The name to overwrite, when a reader is saving one they already have. */
  under?: string
): Promise<SiteLibraryRow> {
  const rows = await siteLibraryRows();
  const title = siteTitle(doc) ?? '';
  const name = under ?? freeLibraryName(rows.map((row) => row.name), title, 'site');
  const kept = await LIBRARY.keep({ name, title, count: pageCount(doc) }, text);
  return { name: kept.name, title, pages: kept.count ?? 0, savedAt: kept.savedAt };
}

/** Take one out. */
export const dropSite = (name: string): Promise<void> => LIBRARY.drop(name);
