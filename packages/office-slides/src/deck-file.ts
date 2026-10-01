/** Slides v2 stores connector bindings by document-owned object identity. */
import { documentFileFormat } from '@barocss/shared';
import { normalizeSlidesNativeDocument, assertSlidesNativeReferences } from './native-identity';
import { childrenOf, deckSlides, type DeckAccess } from './deck';


/** What every deck file says it is. */
export const DECK_FORMAT = 'barocss-slides';

/**
 * The shape of the file, which is one number.
 *
 * Bumped when a document written by this product would be *misread* by an older
 * one — not when the schema grows an attribute, which is the whole point of
 * attributes being optional and read with defaults.
 */
export const DECK_FILE_VERSION = 2;

export interface DeckFile {
  format: typeof DECK_FORMAT;
  version: number;
  /** When it was written, so a reader can tell two files apart. */
  savedAt?: string;
  document: unknown;
}

/**
 * A tree with the session's own bookkeeping taken out.
 *
 * `sid` and `parentId` are the store's, not the document's. Leaving them in is
 * how a file becomes unloadable in the session that wrote it: the loader would be
 * asked to mint ids that already exist.
 */
/**
 * **이제 `@barocss/shared` 의 것이다.** 이 이름은 덱의 것이 아니었다 — 세션이 빌려준 이름을
 * 걷어내는 일은 이 엔진이 담는 모든 문서에 대해 참이고, Word 와 사이트가 저장을 갖게 되는 날
 * 세 번째로 다시 쓰였을 것이다. 이름은 여기 남겨 부르던 곳이 안 바뀌게 한다.
 */
export const forFile = normalizeSlidesNativeDocument;

/**
 * **덱이 자기에 대해 말하는 넷** — 그리고 나머지는 전부 공용 층의 것이다.
 *
 * `document-file.ts` 를 읽으면 왜 이것만 남는지 나온다: 봉투도, sid 를 걷어내는 것도, 넷 중
 * 어느 것인지 말하는 거절도 이 엔진이 담는 모든 문서에 대해 참이다. 덱의 것은 자기 이름
 * (`barocss-slides`), 자기 판 번호, 제목이 어디 있는가, 그리고 독자가 내려받기 폴더에서 보는 것.
 */
const FORMAT = documentFileFormat({
  format: DECK_FORMAT,
  noun: '슬라이드',
  version: DECK_FILE_VERSION,
  extension: '.slides.json'
});

/** The envelope for a deck, ready to be written. */
export const deckFile = (document: unknown, savedAt?: string): DeckFile =>
  FORMAT.file(normalizeSlidesNativeDocument(document), savedAt) as DeckFile;

/** The text of the file. */
export const deckFileText = (document: unknown, savedAt?: string): string =>
  FORMAT.text(normalizeSlidesNativeDocument(document), savedAt);

/** Reading a deck file, and saying which of the four things is wrong with it. */
export const readDeckFile = (text: string): DeckFileRead => {
  const read = FORMAT.read(text) as DeckFileRead;
  if ('error' in read) return read;
  if (typeof JSON.parse(text).version !== 'number') return { error: '지원하지 않는 Slides 파일 버전입니다.' };
  if (read.version !== 0 && read.version !== 1 && read.version !== DECK_FILE_VERSION) return { error: '지원하지 않는 Slides 파일 버전입니다.' };
  try {
    assertSlidesNativeReferences(read.document);
    if (read.version < 2) {
      const hasNewIdentity = (value: unknown): boolean => {
        const node = value as { attributes?: Record<string, unknown>; content?: unknown[] };
        return !!node.attributes && ['objectId', 'startObjectId', 'endObjectId'].some(key => Object.hasOwn(node.attributes!, key))
          || !!node.content?.some(hasNewIdentity);
      };
      if (hasNewIdentity(read.document)) throw new Error('Slides v2 identities require file version 2.');
    }
    return read;
  } catch (error) { return { error: error instanceof Error ? error.message : '잘못된 Slides 연결 대상입니다.' }; }
};



export type DeckFileRead =
  | { document: unknown; version: number }
  | { error: string };


/**
 * What the deck is *about*: the words in the first slide's title.
 *
 * Not the first slide's `name`, which is the author's label for the slide
 * ("Title", "Agenda") and reads as a filename nobody chose. What a reader would
 * have typed into a save dialog is the sentence on the opening slide, which is
 * what this reads.
 */
export function deckTitle(doc: DeckAccess): string | undefined {
  const slides = deckSlides(doc);
  if (slides.length === 0) return undefined;

  const textOf = (sid: string, depth: number): string => {
    if (depth > 16) return '';
    const node = doc.getNode(sid);
    if (!node) return '';
    const own = (node as { text?: unknown }).text;
    if (typeof own === 'string') return own;
    return childrenOf(node)
      .map((child) => textOf(child, depth + 1))
      .join('');
  };

  const find = (sid: string, depth: number): string | undefined => {
    if (depth > 16) return undefined;
    const node = doc.getNode(sid);
    if (!node) return undefined;

    if (node.attributes?.role === 'title') {
      const text = textOf(sid, 0).trim();
      if (text) return text;
    }
    for (const child of childrenOf(node)) {
      const found = find(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  return find(slides[0].sid, 0);
}

/**
 * What to call the file, from the deck itself.
 *
 * A deck with no title gets `슬라이드`, and either way the name is made safe for
 * a filesystem: no separators, no leading dots, and short enough that the browser
 * does not truncate it into nonsense.
 */
export const deckFileName = (title: string | undefined): string => FORMAT.fileName(title, '슬라이드');
