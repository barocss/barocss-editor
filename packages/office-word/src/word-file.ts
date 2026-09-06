import { documentFileFormat } from '@barocss/shared';

/**
 * **A document as a file** — Word's four sentences, and nothing else.
 *
 * ## What this file is not
 *
 * It is not a file format. `@barocss/shared`'s `document-file.ts` is, and it is 200 lines: the
 * envelope, stripping the session's sids, the four refusals with the sentence a reader needs
 * rather than the one a parser produces, and a filename safe on every platform. Every clause in it
 * came from `office-slides`, which wrote the whole of it for itself first.
 *
 * What is here is the four things a **product** has to say: its name, the word a reader calls it,
 * its version, and where its title is. That ratio — four lines against two hundred — is the
 * measurement this file exists to record.
 *
 * ## Why Word had none of this
 *
 * `apps/word/src/main.tsx` loaded the sample on every reload. A reader could write a page and it
 * was gone when they came back, and there was no way to open a file they had. The deck could do
 * both, because the deck built all of it alone. The roadmap's own diagram said so —
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * The rule this repository keeps rediscovering is in `note.md`: *"아래로 안 내려간 것은 셋째
 * 제품에서 다시 발명된다."* The shared layer went down before the second, and this is what the
 * second costs now that it is there.
 */

/** What every Word file says it is. */
export const WORD_FORMAT = 'barocss-word';

/**
 * The shape of the file, which is one number.
 *
 * Bumped when a document written by this product would be **misread** by an older one — not when
 * the schema grows an attribute, which is the whole point of attributes being optional and read
 * with defaults.
 */
export const WORD_FILE_VERSION = 1;

/** Enough of the store to read a title out of, and no more. */
interface DocumentAccess {
  getNode(sid: string): { stype?: string; text?: string; content?: unknown } | undefined;
  getRootNodeId?(): string | undefined;
  rootId?: string;
}

/**
 * What the document is *about*: the words in `docTitle`.
 *
 * Word keeps its title in `docMeta`, out of the flow, which is the schema decision this reads —
 * a title is a fact about the document rather than the first thing printed on it. A deck has to
 * go and look at the first slide because a deck's title *is* a slide.
 *
 * Not the first heading: a document may open with 목차 or with nothing, and a reader who typed a
 * title into the title bar has already said what this is called.
 */
export function wordTitle(doc: DocumentAccess): string | undefined {
  const rootId = doc.getRootNodeId?.() ?? doc.rootId;
  if (!rootId) return undefined;

  const textUnder = (sid: string): string => {
    const node = doc.getNode(sid);
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return ((node.content ?? []) as string[]).map(textUnder).join('');
  };

  const under = (sid: string, stype: string): string | undefined =>
    ((doc.getNode(sid)?.content ?? []) as string[]).find(
      (child) => doc.getNode(child)?.stype === stype
    );

  const meta = under(rootId, 'docMeta');
  const title = meta ? under(meta, 'docTitle') : undefined;
  const words = title ? textUnder(title).trim() : '';
  return words || undefined;
}

const FORMAT = documentFileFormat({
  format: WORD_FORMAT,
  noun: '문서',
  version: WORD_FILE_VERSION,
  extension: '.word.json'
});

/** The text of the file — what 저장 writes and 열기 reads, so the two cannot drift apart. */
export const wordFileText = (document: unknown, savedAt?: string): string =>
  FORMAT.text(document, savedAt);

/** Reading a Word file, and saying which of the four things is wrong with it. */
export const readWordFile = FORMAT.read;

/** What a reader sees in their downloads folder. */
export const wordFileName = (title: string | undefined): string => FORMAT.fileName(title, '문서');
