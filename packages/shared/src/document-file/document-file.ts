/**
 * **A document as a file** — the envelope, the sids that must not go in it, and the four refusals.
 *
 * ## Why this is here and not in a product
 *
 * `office-slides` wrote it first, and wrote it well: `deck-file.ts` is 219 lines and every
 * paragraph in it is an argument. Reading it, exactly two things in it are about **decks**: the
 * word `barocss-slides`, and where the title comes from. Everything else — stripping the sids,
 * the version envelope, telling a reader *which* of the four things is wrong with their file — is
 * true of any document this engine holds.
 *
 * And the diagram at the top of `docs/ROADMAP.md` says the rest: **`[ 서비스 ] 거의 비어 있다`**.
 * Word and the site builder cannot save at all — `apps/word/src/main.tsx:83` and
 * `apps/site/src/main.tsx:63` load the sample on every reload, so whatever a reader writes is gone
 * when they come back. The deck can, because the deck built the whole of this for itself.
 *
 * This repository's rule for that shape is written in `note.md`: *"아래로 안 내려간 것은 셋째
 * 제품에서 다시 발명된다."* Here it is being moved down before the **second**.
 *
 * ## What a product still says
 *
 * Four things, and they are the four that differ:
 *
 * | | deck | why it cannot be shared |
 * |---|---|---|
 * | `format` | `barocss-slides` | the string is how a file says which product it is |
 * | `version` | 1 | products version independently |
 * | `titleOf` | the words on the first slide | a deck's title is a slide, Word's is `docTitle` |
 * | `extension` | `.deck.json` | what a reader sees in their downloads |
 *
 * ## Sids are left out, and that is the design being paid off
 *
 * A sid is `session:counter`, handed out at load in document order, so it means nothing in
 * another session and *collides* in the same one. They are stripped on the way out and the loader
 * hands out its own. That is only safe because nothing in these documents refers to a node by sid
 * — a build names its shape by a name the shape carries, a slide names its layout by `layoutId`,
 * a comment names its thread by `id`. Every one an identifier the **document** owns rather than
 * one the session lends it.
 *
 * The one thing this deliberately does **not** do is check the document against a schema.
 * `loadDocument` already does that and reports every fault with its path — and a document that is
 * *nearly* right should open with a warning rather than be refused, because the alternative is a
 * reader with a file they cannot get their work out of.
 */

interface TreeNode {
  sid?: string;
  parentId?: string;
  stype?: string;
  content?: unknown;
  [key: string]: unknown;
}

/** The envelope a file carries around a document. */
export interface DocumentFile {
  format: string;
  version: number;
  savedAt?: string;
  document: unknown;
}

/** What a product has to say for itself before any of this can run. */
export interface FileFormat {
  /** How a file says which product it is — `barocss-slides`, `barocss-word`. */
  format: string;
  /**
   * What a reader calls this — 슬라이드, 문서, 사이트.
   *
   * A refusal is read by a person, and *"이 파일은 문서 파일이 아닙니다"* in the deck is a
   * sentence about somebody else's program. The four refusals are shared; the noun in them is not.
   */
  noun: string;
  /** This product's file version. A file from a newer one is refused by name. */
  version: number;
  /** What the document is *about*, for naming a download. */
  titleOf?: (document: unknown) => string | undefined;
  /** What a reader sees in their downloads folder — `.deck.json`. */
  extension: string;
}

export type FileRead = { document: unknown; version: number } | { error: string };

/**
 * The document with every session-lent name taken out.
 *
 * Recursive over `content`, which is where the tree lives. Exported because the loader's mirror
 * image — hand out fresh sids — is the product's, and a test of one wants the other.
 */
export function forFile(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forFile);
  if (!node || typeof node !== 'object') return node;

  const { sid, parentId, ...rest } = node as TreeNode;
  void sid;
  void parentId;

  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray((node as TreeNode).content)) {
    out.content = ((node as TreeNode).content as unknown[]).map(forFile);
  }
  return out;
}

/**
 * The four things a product needs, made once from what it says about itself.
 *
 * A factory rather than four functions taking a `FileFormat` each: a product binds this at module
 * scope and the rest of it never restates the format string. Restating it is how the writer and
 * the reader of a file drift apart, which is the failure this whole file exists to prevent.
 */
export function documentFileFormat(spec: FileFormat) {
  const file = (document: unknown, savedAt?: string): DocumentFile => ({
    format: spec.format,
    version: spec.version,
    ...(savedAt ? { savedAt } : {}),
    document: forFile(document)
  });

  /**
   * Indented, because a document file is a thing a person will open in an editor, diff in a pull
   * request and paste into a bug report. The bytes saved by one line are worth less than any of
   * those.
   */
  const text = (document: unknown, savedAt?: string): string =>
    `${JSON.stringify(file(document, savedAt), null, 2)}\n`;

  /**
   * Reading a file, and saying **why not**.
   *
   * Four refusals, each with the sentence a reader needs rather than the one a parser produces:
   * it is not JSON, it is not this product's file, it is from a newer version, or it holds no
   * document. A message that names *which* is the difference between a reader trying another file
   * and a reader filing a bug.
   */
  const read = (source: string): FileRead => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return { error: '이 파일은 JSON이 아닙니다.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: `이 파일은 ${spec.noun} 파일이 아닙니다.` };
    }

    const held = parsed as Partial<DocumentFile>;
    if (held.format !== spec.format) {
      return { error: `이 파일은 Barocss ${spec.noun} 파일이 아닙니다.` };
    }

    const version = typeof held.version === 'number' ? held.version : 0;
    if (version > spec.version) {
      return {
        error: `이 파일은 더 새로운 버전(${version})으로 저장되었습니다. 프로그램을 업데이트하세요.`
      };
    }

    const document = held.document as TreeNode | undefined;
    if (!document || typeof document !== 'object' || typeof document.stype !== 'string') {
      return { error: '이 파일에는 문서가 없습니다.' };
    }

    return { document, version };
  };

  /**
   * A filename from the title, safe on every platform a reader might be on.
   *
   * `/` and `\` are separators, `:` is one on macOS and forbidden on Windows, and the rest are
   * refused by Windows outright. Tabs and newlines go too — a title can carry them and a
   * filename cannot. A **leading dot** is taken off separately and last: it makes the file
   * hidden on unix, so a reader would save their work and not be able to see it.
   *
   * A title of only those characters leaves nothing, so a product supplies a fallback — a
   * download with no name is a download a reader cannot find again.
   *
   * Every clause here came from `office-slides`, which wrote this first and got it right.
   */
  const fileName = (title: string | undefined, fallback: string): string => {
    const cleaned = (title ?? '')
      .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 60)
      .trim();
    return `${cleaned || fallback}${spec.extension}`;
  };

  return { file, text, read, fileName, titleOf: spec.titleOf, spec };
}
