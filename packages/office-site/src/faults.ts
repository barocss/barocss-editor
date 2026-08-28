/**
 * Everything wrong with a document, in one walk.
 *
 * ## Why this exists at the third check rather than the first
 *
 * Three functions in this package answer "what is wrong with this": `overrideFaults` for a width
 * that says something the node cannot hold, `linkFaults` for a link naming a page that is not there,
 * and now `stateFaults` for a state that would move the block out from under the pointer. Each was
 * written with a unit test beside it, and **nothing ran any of them over a real document**.
 *
 * That is worse than not having them. A check nobody runs reads, to the next person, exactly like a
 * check that passes — which is the failure this repository has already written down twice about
 * itself. Two was a coincidence; three is the thing nobody wrote, so here it is.
 *
 * ## What it is not
 *
 * Not validation. Nothing here refuses an edit or blocks a save: a document that arrives holding a
 * fault is a document a reader still has to be able to open and fix, and a builder that would not
 * open it has turned a wrong colour into a lost afternoon. It **reports**, in the words a reader
 * would use, against the node they would click.
 */
import { collectionFaults } from './data';
import { linkFaults } from './page-link';
import { overrideFaults } from './responsive';
import { pagesOf } from './selection';
import { SITE_SURFACE_KIND } from './site-schema';

/** The three a page has one of. `nav` and `aside` are not among them — see `documentFaults`. */
const ONE_EACH = ['header', 'main', 'footer'];

/** What a reader calls each, which is what the panel calls it. */
const NAME_OF: Record<string, string> = { header: '머리말', main: '본문', footer: '꼬리말' };
import { stateFaults } from './states';

/** What a walk needs of a document: where it starts, and how to get a node. */
type Access = { rootId: string; getNode: (sid: string) => any };

export interface Fault {
  /** The node a reader would click to fix it. */
  sid: string;
  /** Which question found it, so a panel can group them. */
  kind: 'width' | 'state' | 'link' | 'data' | 'landmark';
  /** What is wrong, in the words a reader would use. */
  said: string;
}

/**
 * The four questions, in the words a reader would use — because a list of faults is a **surface**.
 *
 * Declared here rather than in the panel that draws them, for the reason `toolbar-model.ts` and
 * `panel-model.ts` already give about their own surfaces: a heading written in JSX is a heading
 * nothing can read. A fifth `kind` added to `Fault` without a line here is a group of rows with no
 * title, which is what `kindsAreNamed` in the tests refuses.
 *
 * `why` is the sentence under the group, and it is the half that is hard to get back: each of these
 * checks was written with a reason, and a list that only says *what* is wrong teaches a reader to
 * dismiss it.
 */
export const FAULT_KINDS: { id: Fault['kind']; label: string; why: string }[] = [
  {
    id: 'landmark',
    label: '페이지 역할',
    why: '한 페이지에 머리말·본문·꼬리말은 하나씩입니다. 둘이면 화면 낭독기가 어느 쪽이 본문인지 말할 수 없습니다.'
  },
  {
    id: 'link',
    label: '끊어진 링크',
    why: '가리키던 페이지가 지워졌습니다. 링크는 그대로 글자로 그려지므로 화면만 봐서는 찾을 수 없습니다.'
  },
  {
    id: 'data',
    label: '목록',
    why: '반복할 틀이 없거나, 데이터에 없는 칸을 가리킵니다.'
  },
  {
    id: 'width',
    label: '너비별 설정',
    why: '좁은 화면에서만 쓰는 값이 이 블록에 없는 속성을 가리킵니다. 그 화면에서는 아무 일도 일어나지 않습니다.'
  },
  {
    id: 'state',
    label: '상태',
    why: '포인터를 올렸을 때 블록이 포인터 아래에서 벗어나거나, 이 블록에 없는 속성을 바꿉니다.'
  }
];

/**
 * Where a faulty node **lives**, which is what a reader needs before they can go to it.
 *
 * A list of faults across a five-page site is a list of places, and a row that says only what is
 * wrong is a row a reader cannot act on: the node is on a page they are not looking at, or inside a
 * definition, which is not a page at all and is reached a different way.
 *
 * Walked up through `parentId` rather than searched down from the root once per fault — the same
 * chain `pathFromPage` walks, and the reason it can stop early is that a page and a definition are
 * both direct children of the root: whichever is met first is the one that holds this node.
 */
export function holderOf(
  doc: { getNode: (sid: string) => any },
  sid: string
): { kind: 'page' | 'component'; sid: string; name: string } | undefined {
  let at: string | undefined = sid;
  let depth = 0;
  while (at && depth++ < 64) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (node.stype === 'surface' && node.attributes?.kind === SITE_SURFACE_KIND) {
      return {
        kind: 'page',
        sid: String(node.sid),
        name: typeof node.attributes?.name === 'string' ? node.attributes.name : '이름 없는 페이지'
      };
    }
    if (node.stype === 'component') {
      return {
        kind: 'component',
        // The **id**, not the sid: that is what opening a definition for editing is asked by.
        sid: typeof node.attributes?.id === 'string' ? node.attributes.id : String(node.sid),
        name:
          (typeof node.attributes?.name === 'string' && node.attributes.name) ||
          (typeof node.attributes?.id === 'string' ? node.attributes.id : '이름 없는 컴포넌트')
      };
    }
    at = node.parentId as string | undefined;
  }
  return undefined;
}

/**
 * What a node **declares**, which both attribute checks need and neither can get on its own.
 *
 * A caller with a schema passes one in. Without it the two checks fall back to their empty-set
 * behaviour — every name is accepted — which is the right default here rather than a guess: a check
 * that invented the list would report a correct document as faulty, and a report that cries wolf is
 * one nobody reads twice.
 */
export type Declares = (node: { stype?: unknown }) => Iterable<string>;

export function documentFaults(
  doc: Access,
  options?: { declares?: Declares }
): Fault[] {
  const found: Fault[] = [];
  const declares = options?.declares ?? (() => []);

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid) as { stype?: unknown; attributes?: Record<string, unknown>; content?: unknown[] } | undefined;
    if (!node) return;

    const attrs = node.attributes ?? {};
    const declared = declares(node);
    for (const said of overrideFaults(attrs, declared)) found.push({ sid, kind: 'width', said });
    for (const said of stateFaults(attrs, declared)) found.push({ sid, kind: 'state', said });

    if (node.stype === 'collection') {
      /*
       * The template is the collection's first child — the thing drawn once per row. Asked of the
       * document rather than assumed, because a collection whose template has been deleted is one of
       * the two faults `collectionFaults` exists to name.
       */
      const first = (node.content ?? []).find((child) => typeof child === 'string') as string | undefined;
      const template = first ? doc.getNode(first) : undefined;
      for (const said of collectionFaults(doc, node as never, template as never)) {
        found.push({ sid, kind: 'data', said });
      }
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(doc.rootId);

  /**
   * **One header, one body, one footer, per page.**
   *
   * The fault the landmark field creates the moment it exists, and it is the reader-facing half of
   * what makes landmarks worth having: a screen reader offers a list of them to jump between, and
   * two things both calling themselves the page's body is a list that cannot be used. HTML permits
   * several `<header>`s — they scope to the nearest sectioning element — but a page builder's blocks
   * are all in one flow, so on a page there is one of each.
   *
   * `nav` and `aside` are **not** counted: several navigations is ordinary (a bar and a footer's
   * links) and so is more than one aside. Which is the difference between a rule and a habit, and
   * the reason this counts three rather than five.
   */
  for (const page of pagesOf(doc as never)) {
    const seen = new Map<string, string[]>();
    const look = (sid: string, depth = 0) => {
      if (depth > 64) return;
      const node = doc.getNode(sid);
      if (!node) return;
      const said = node.attributes?.landmark;
      if (typeof said === 'string' && ONE_EACH.includes(said)) {
        seen.set(said, [...(seen.get(said) ?? []), sid]);
      }
      for (const child of (node.content ?? []) as unknown[]) {
        if (typeof child === 'string') look(child, depth + 1);
      }
    };
    look(page.sid);
    for (const [said, where] of seen) {
      if (where.length < 2) continue;
      // Every one of them, so a reader can go to each and decide which is the real one.
      for (const sid of where) {
        found.push({
          sid,
          kind: 'landmark',
          // 머리말·본문·꼬리말 all end in a consonant, so the particle is 이 and needs no hedge.
          said: `'${page.name}'에 ${NAME_OF[said]}이 ${where.length}개 있습니다`
        });
      }
    }
  }

  for (const fault of linkFaults(doc)) {
    /*
     * The **missing page first**, which is a fact about reading a list rather than about links.
     * Six broken links read as six copies of one sentence when the sentence leads with *이 링크가*,
     * and the only part that differs — which page is gone — lands at the end of a wrapped line. The
     * other checks already lead with the name for the same reason.
     */
    found.push({ sid: fault.sid, kind: 'link', said: `'${fault.missing}' 페이지가 없습니다` });
  }

  return found;
}
