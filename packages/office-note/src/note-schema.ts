import { getOfficeSchemaDefinition, getStandardSchemaDefinition, type SchemaDefinition } from '@barocss/schema';

/**
 * **한 편의 글** — the schema of a written body, on its own.
 *
 * ## Why this is a package and not a corner of the site builder
 *
 * It was a corner of it. A 서식 있는 글 column's value is a `richText` node in the site document's
 * `resources`, edited by a second view over **the same editor and the same store** — which bought
 * one selection, one history and every mark command for free, and was written down as the reason.
 *
 * What it also bought was a body whose toolbar is the page builder's toolbar. The caret in a blog
 * post moved the ribbon behind the drawer's scrim; the undo of a paragraph and the undo of a page
 * were one stack; and the bar over the body read the page's own declarations to decide what to
 * offer. Reported as *이걸 페이지 빌더랑 같이 쓰게 되면 상당히 복잡해질 것 같아*, which is the
 * correct reading: writing a post and arranging a page are two jobs, and the second one's chrome
 * has no business being the first one's.
 *
 * So a body gets its own schema, its own store and its own editing session. And then it is a thing
 * in its own right — a CMS field, a note, a comment — rather than a mode of a site builder.
 *
 * ## The test this package had to pass
 *
 * The one `docs/SHARED-LAYER.md` sets and `office-text` already passed: *can it be stated without
 * naming a product?* A body of prose, its marks, its blocks and what Enter does in it. Every part of
 * that is answerable without the word *site*, *slide* or *page*.
 *
 * ## What it reuses, which is nearly everything
 *
 * The **nodes** are the standard schema's. Measured before writing a line: renderers are registered
 * globally by stype, and `office-text` already draws `paragraph`, `heading`, `list`, `listItem`,
 * `codeBlock`, `blockQuote`, `bTable*`, `horizontalRule`, `inline-image`, `emoji`, `hardBreak` and
 * `inline-text`. So a note is *drawn* by a package that already exists, and what was missing was
 * only a declaration of which of those a body may hold, and a kit to edit one with.
 *
 * That is also why the nodes stay the interchange format rather than a serialised one: a card in a
 * site draws a body with the site's own renderers because the stypes are the same. A note is a
 * different **document**, not a different vocabulary.
 */

/**
 * What a body may hold, in the order a writer meets them.
 *
 * Written out rather than taken as a group, and the reason is what `block` turned out to be: the
 * page builder's own vocabulary, so `block+` on a body permitted a **폼, a 차트, a 목록 and a
 * canvasBlock inside a blog post** and did not permit a `picture`, which is `group: 'scene'`.
 * Exactly backwards, and invisible until somebody tried to put an image in a post.
 *
 * Out is everything that arranges rather than says: a frame, a collection, a chart, a form, a
 * placement. **A body is written; a page is arranged.** A writer who wants two columns is asking for
 * a page, and this model says so rather than half-answering.
 *
 * `pageBreak` is out too — a Word idea, and a note has no pages. `listItem` is a list's child and
 * never a body's.
 */
/**
 * **몸의 블록은 `@barocss/office-text` 의 것이다** — 여기서 노트의 이름으로 다시 내보낸다.
 *
 * 여기 있었고 프로세가 *"one declaration, read by everything"* 이라 적었다. 그 결정은 맞았고 집이
 * 틀렸다: `office-site` 가 이것을 읽으면서 **제품이 제품을 의존하게** 됐다. 읽는 쪽이 둘이 되면
 * 그 선언은 아래층의 것이다(`docs/specs/architecture.md`).
 *
 * 노트 안에서 `NOTE_BLOCKS` 라고 계속 부르는 것은 이 패키지를 읽는 사람이 그 이름으로 찾기
 * 때문이고, 이름이 옮기는 값을 막지 않는다.
 */
export {
  BODY_BLOCKS as NOTE_BLOCKS,
  BODY_CONTENT as NOTE_CONTENT,
  type BodyBlock as NoteBlock
} from '@barocss/office-text';
import { BODY_CONTENT as NOTE_CONTENT } from '@barocss/office-text';

/**
 * A note as a document of its own: one `note` node holding blocks, plus the `resources` region the
 * shared vocabulary keeps definitions in.
 *
 * The top node is **`note`** and not `document`, and not `surface`. `surface` is the shared schema's
 * seam — *a Word document's pages, a deck's slides, a site's pages* — and a body is none of those:
 * nothing paginates it and nothing lays it out beside its siblings. Giving it that name would make
 * the seam mean two things.
 */
export function getNoteSchemaDefinition(): SchemaDefinition {
  const office = getOfficeSchemaDefinition();
  const nodes = office.nodes as Record<string, any>;
  /**
   * **A video and an embed, taken from the standard schema** — which office deliberately leaves
   * behind, on the argument that *a document that cannot play one has no word for it*.
   *
   * True of a printed document and not of a written one: a post with a clip in it is ordinary, and
   * `office-site` takes the same two for the same reason one layer over.
   *
   * Found by pressing the buttons. `NOTE_BLOCKS` named both, the content expression admitted both,
   * the bar offered both — and the model answered **Unknown node type**, because naming a type in an
   * expression does not declare it. Three places agreeing about a node that does not exist.
   */
  const standard = getStandardSchemaDefinition().nodes as Record<string, any>;

  return {
    ...office,
    /**
     * **Where a note starts.** The store validates against this, which is the whole point of the
     * package: a `form` written into a body is refused by the model rather than merely not offered
     * by a toolbar — and a toolbar that is the only thing saying no is a toolbar somebody will work
     * around with a paste.
     */
    topNode: 'note',
    nodes: {
      ...nodes,
      mediaVideo: standard.mediaVideo,
      mediaEmbed: standard.mediaEmbed,
      note: {
        name: 'note',
        content: `${NOTE_CONTENT} resources?`,
        attrs: {
          /**
           * What this note is called, when it is a thing on its own rather than a cell's value.
           *
           * Optional, because a body in a site's row is named by the cell that points at it and has
           * no title of its own — which is the same reason `richText.id` stopped being required.
           */
          title: { type: 'string' as const, required: false }
        }
      }
    }
  } as SchemaDefinition;
}
