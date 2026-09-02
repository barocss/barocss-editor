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
import { componentsOf, documentVars, isVarRef, varNameOf } from '@barocss/office-canvas';
import { collectionFaults } from './data';
import { embedFaults } from './embed';
import { linkFaults, linkOf } from './page-link';
import { attrsAt, overrideFaults } from './responsive';
import { BREAKPOINTS, type SiteWidth } from './breakpoints';
import { pagesOf } from './selection';
import { SITE_SURFACE_KIND } from './site-schema';

/**
 * Where a search result cuts a description, which is a fact about the world rather than a rule this
 * product invented — every major engine renders about this much and truncates the rest mid-word.
 *
 * A round number for a thing that is not exact on purpose: the real limit is measured in pixels and
 * differs per engine and per query. Telling a reader *about* 160 is honest; enforcing 155 would be a
 * precision this product does not have.
 */
const DESCRIPTION_LIMIT = 160;

/** The three a page has one of. `nav` and `aside` are not among them — see `documentFaults`. */
const ONE_EACH = ['header', 'main', 'footer'];

/** What a reader calls each, which is what the panel calls it. */
const NAME_OF: Record<string, string> = { header: '머리말', main: '본문', footer: '꼬리말' };
import { opensOf, stateFaults, statesOf } from './states';
import { formFaults, serviceNamed } from './form';
import { assetFaults, assetNameOf, assetNamed, isAssetRef } from './assets';
import { pathFaults } from './slug';

/** What a walk needs of a document: where it starts, and how to get a node. */
type Access = { rootId: string; getNode: (sid: string) => any };

export interface Fault {
  /** The node a reader would click to fix it. */
  sid: string;
  /** Which question found it, so a panel can group them. */
  kind:
    | 'width'
    | 'state'
    | 'link'
    | 'data'
    | 'landmark'
    | 'form'
    | 'asset'
    | 'address'
    | 'reference'
    | 'found'
    | 'press';
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
  },
  {
    id: 'form',
    label: '폼',
    /*
     * The one group here about something that happens **after** the page is drawn, and the reason it
     * is worth a fault rather than a nicety: a form with nowhere to send to looks exactly like a form
     * that works, right up until somebody presses 보내기 and nobody ever hears from them.
     */
    why: '보낼 곳이 없거나, 이름이 가리키는 연결이 사라졌거나, 보내기 단추가 없습니다. 화면은 멀쩡해 보이고, 방문자가 보낸 내용은 아무 데도 가지 않습니다.'
  },
  {
    id: 'address',
    label: '페이지 주소',
    /*
     * The invisible one. Two pages at one address publish two files with one name — so one overwrites
     * the other in the archive — and every link to either resolves to whichever the walk found first.
     * The lost page is still in the panel and still editable, which is exactly what stops a reader
     * from noticing.
     */
    why: '두 페이지가 같은 주소를 씁니다. 한쪽은 발행되지 않고, 그쪽을 가리키는 링크는 모두 다른 페이지로 갑니다.'
  },
  {
    id: 'press',
    label: '누르는 것',
    /*
     * The one group whose evidence is **dead CSS** rather than a judgement about design.
     *
     * `:focus-visible` fires on a thing a keyboard can reach, and nothing else — a `<div>` never
     * receives focus, whatever it is painted like. So a block that writes a focus rule has said, in
     * the one vocabulary that cannot mean anything else, *a visitor arrives here by pressing Tab*,
     * and if nothing makes it a control the rule is a decoration that can never draw.
     *
     * Found by exporting the sample: seven `무료로 시작하기` buttons across five pages, each with an
     * accent fill, a pill radius, a `:hover` that darkens and a `:focus-visible` ring — published as
     * `<div><p><span>무료로 시작하기</span></p></div>`. The primary call to action on every page was
     * unreachable without a mouse and announced as a paragraph, and every check here passed.
     *
     * A `:hover` alone is deliberately **not** asked about. Nine cards in that same sample lift under
     * the pointer and are not meant to be pressed, which is an ordinary design; a fault list that
     * argued with all nine to catch the one is a fault list nobody reads to the end.
     */
    why: '포인터가 올라올 때만이 아니라 키보드가 들어올 때도 달라진다고 적어놓고, 정작 키보드가 갈 수 없는 블록입니다. `:focus-visible`은 초점을 받는 것에만 걸리므로 그 규칙은 영영 그려지지 않고, 방문자는 마우스 없이 이 블록에 닿을 수 없습니다.'
  },
  {
    id: 'found',
    label: '검색과 공유',
    /*
     * The one group about a page a reader **never sees while making it**, and the reason it is a
     * fault rather than a nicety is the same one the form group gives: the page looks finished.
     *
     * Measured on this product's own sample, five pages published: `lang`, `<title>`, a viewport and
     * nothing else. So every search result was whatever an engine could scrape out of the first
     * paragraph — on a landing page, the words 무료로 시작하기 — and every link anybody pasted into a
     * chat unfurled as a bare address. The schema has carried `description` and `image` since the
     * head was written, the panel has offered both, and `setPageInfo` has accepted both. Nobody had
     * ever written one, and nothing had ever said so.
     *
     * Which is the shape this product keeps finding: a mechanism alive in all four places and dead
     * in the only document anybody looks at.
     */
    why: '설명이 없는 페이지는 검색 결과와 공유 카드가 스스로 채워집니다 — 첫 문단에서 긁어온 아무 문장으로. 화면은 완성돼 보이고, 그것을 볼 수 있는 자리는 편집기 어디에도 없습니다.'
  },
  {
    id: 'reference',
    label: '이름이 가리키는 것',
    /*
     * The fault a **paste** makes, and the reason it was written the same day carrying was:
     * copying a card into a site that does not define its component puts an *empty placement* on the
     * page — it draws nothing, it selects like a block, and nothing anywhere says why. The same
     * shape one level smaller for a `var:이름`, which falls back to the attribute's own value and so
     * comes out in a colour nobody chose.
     *
     * The other three reference kinds are checked where they already were — a dataset by the
     * collection, a connection by the form, a file by the picture — and this closes the two that had
     * no check at all.
     */
    why: '가리키는 컴포넌트나 변수가 이 문서에 없습니다. 빈 자리로 그려지거나 엉뚱한 값이 쓰이고, 화면에는 아무 말도 없습니다.'
  },
  {
    id: 'asset',
    label: '그림 파일',
    /*
     * Two things a document can be wrong about a file, and neither shows on screen: a picture naming
     * a file that is not there draws a broken image only on the page that uses it, and a document
     * that has quietly become large is a document that is slow to open with nothing saying why.
     */
    why: '가리키는 그림 파일이 없거나, 문서에 담긴 그림이 너무 커졌습니다. 화면에서는 한 장이 깨져 보일 뿐이고, 무거워진 이유는 어디에도 적혀 있지 않습니다.'
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

/**
 * Whether pressing this block does anything — the question `press` is the other half of.
 *
 * A link mark is looked for **inside**, not on the block, because a mark covers words and a block is
 * a box: the sample's navigation is a frame whose hover is on the box and whose link is on the word
 * in it, which is a real control with a smaller target than it looks. `goes` exists because that
 * trade should be a choice rather than the only shape available.
 */
function pressable(doc: Access, sid: string, attrs: Record<string, unknown>): boolean {
  if (typeof attrs.goes === 'string' && attrs.goes.trim()) return true;
  if (opensOf(attrs)) return true;

  /*
   * And **above it**, because a link is a wrapper: a block inside one is inside it. A row of three
   * cards in a single `goes` frame is one control with three things drawn in it, which is an
   * ordinary design and not three dead blocks.
   */
  let up = doc.getNode(sid)?.parentId as string | undefined;
  for (let depth = 0; depth < 40 && up; depth += 1) {
    const above = doc.getNode(up);
    if (!above) break;
    const said = above.attributes?.goes;
    if (typeof said === 'string' && said.trim()) return true;
    if (opensOf(above.attributes as Record<string, unknown> | undefined)) return true;
    up = above.parentId as string | undefined;
  }

  let hit = false;
  const look = (at: string, depth = 0) => {
    if (depth > 30 || hit) return;
    const node = doc.getNode(at);
    if (!node) return;
    if (linkOf(node as never)) {
      hit = true;
      return;
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1);
    }
  };
  look(sid);
  return hit;
}

/** The definition a placement draws, by the id it names. */
function definitionFor(doc: Access, componentId: unknown): string | undefined {
  if (typeof componentId !== 'string' || !componentId) return undefined;
  for (const child of (doc.getNode(doc.rootId)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string' || doc.getNode(child)?.stype !== 'components') continue;
    for (const one of (doc.getNode(child)?.content ?? []) as unknown[]) {
      if (typeof one === 'string' && doc.getNode(one)?.attributes?.id === componentId) return one;
    }
  }
  return undefined;
}

/** Whether anything in a definition says a keyboard arrives at it. */
function focusInside(doc: Access, sid: string | undefined): boolean {
  if (!sid) return false;
  let hit = false;
  const look = (at: string, depth = 0) => {
    if (depth > 40 || hit) return;
    const node = doc.getNode(at);
    if (!node) return;
    if (statesOf(node.attributes as Record<string, unknown> | undefined).focus) {
      hit = true;
      return;
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1);
    }
  };
  look(sid);
  return hit;
}

export function documentFaults(
  doc: Access,
  options?: {
    declares?: Declares;
    /**
     * The widths this document is designed at — three unless it says otherwise.
     *
     * Two questions here need them and both got the wrong answer from a constant: whether an
     * override names a width that is drawn, and whether a block placed by coordinates is on the
     * board at all.
     */
    widths?: SiteWidth[];
  }
): Fault[] {
  const found: Fault[] = [];
  const declares = options?.declares ?? (() => []);
  const widths = options?.widths ?? BREAKPOINTS;

  const walk = (sid: string, depth = 0, inForm = false, inDefinition = false) => {
    if (depth > 64) return;
    const node = doc.getNode(sid) as { stype?: unknown; attributes?: Record<string, unknown>; content?: unknown[] } | undefined;
    if (!node) return;

    const attrs = node.attributes ?? {};
    const declared = declares(node);

    /*
     * A placement naming a definition this document has not got, and a `var:이름` naming a variable
     * it has not got. Both are what a paste from another site leaves behind, and both draw as
     * *something* — which is why neither was ever noticed.
     */
    if (node.stype === 'instance' && typeof attrs.componentId === 'string' && attrs.componentId) {
      if (!componentsOf(doc as never).some((one) => one.id === attrs.componentId)) {
        found.push({ sid, kind: 'reference', said: `'${attrs.componentId}' 컴포넌트가 없습니다` });
      }
    }
    for (const value of Object.values(attrs)) {
      if (!isVarRef(value)) continue;
      const name = varNameOf(value);
      if (!documentVars(doc as never).some((one) => one.name === name)) {
        found.push({ sid, kind: 'reference', said: `'${name}' 변수가 없습니다` });
      }
    }
    /*
     * **An embed naming nothing it can draw**, which is the one fault this node has and is invisible:
     * a frame with no source is a box, and a box is what an embed looks like before it loads. A
     * reader cannot tell *waiting* from *wrong* by looking, which is exactly the shape every fault in
     * this list has.
     */
    if (node.stype === 'mediaEmbed') {
      for (const said of embedFaults(attrs)) found.push({ sid, kind: 'reference', said });
    }
    /*
     * And a **video with no file**. `src` is required by the schema, so an insert puts a space there
     * — the node is legal, draws nothing, and says so here rather than looking like a video that has
     * not started.
     */
    if (node.stype === 'mediaVideo' && !String(attrs.src ?? '').trim()) {
      found.push({ sid, kind: 'asset', said: '영상 파일을 정하지 않았습니다' });
    }

    for (const said of overrideFaults(attrs, declared, widths))
      found.push({ sid, kind: 'width', said });

    /**
     * **A block placed by coordinates that is off a narrower board.**
     *
     * The one fault absolute placement produces on its own, and the reason this product treats
     * placement as a decoration layer rather than a peer of stacking: a page **re-flows**, and a
     * block at coordinates opts out of that — so a card at x=900 on a 1280 board is simply *not on*
     * a 390 one, and nothing on the wide board a reader is looking at says so.
     *
     * Measured rather than moralised. It does not say *you promised to place this at every width*,
     * which is a lecture; it says which widths the block is outside of, which is a fact and a thing
     * to go and fix. The gesture stays — it is what makes a page rich, and it was asked for — and
     * the document says where it is incomplete.
     *
     * Only the left edge, and only past the far side. A block above the top of a board is unusual
     * and legitimate (something pulled up into a band above it); a block past the right edge is
     * always a reader who has not looked at that width yet.
     */
    if (attrs.position === 'absolute') {
      const off = widths.filter((one) => {
        const at = attrsAt(attrs, one.id, widths);
        const left = Number(at.insetLeft);
        /* Twips in the document, CSS pixels on a board — the conversion every length here makes. */
        return Number.isFinite(left) && left / 15 >= one.width;
      });
      if (off.length > 0) {
        found.push({
          sid,
          kind: 'width',
          said: `자유 배치인데 ${off.map((one) => one.label).join(' · ')}에서 화면 밖에 있습니다`
        });
      }
    }
    for (const said of stateFaults(attrs, declared)) found.push({ sid, kind: 'state', said });

    /*
     * And what is wrong with a **form**, asked here rather than inside the walk of its children,
     * because two of its three faults are about the set: whether anything in it sends, and whether
     * two questions arrive under one name.
     */
    if (node.stype === 'form') {
      const fields = (node.content ?? [])
        .filter((child): child is string => typeof child === 'string')
        .map((child) => doc.getNode(child))
        .filter((child) => child?.stype === 'field')
        .map((child) => child.attributes as Record<string, unknown> | undefined);
      for (const said of formFaults(attrs, fields, serviceNamed(doc as never, attrs.sends)))
        found.push({ sid, kind: 'form', said });
    }

    /*
     * And a picture naming a file the document does not hold — the same shape as a link to a page
     * that was deleted, and just as invisible: the image breaks on the one page that draws it.
     */
    if (node.stype === 'picture' && isAssetRef(attrs.src)) {
      const name = assetNameOf(attrs.src);
      if (!assetNamed(doc as never, name)) {
        found.push({ sid, kind: 'asset', said: `'${name}' 그림 파일이 없습니다` });
      }
    }

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

    /*
     * And **a block that says a keyboard arrives at it, which a keyboard cannot reach**.
     *
     * Three things make a block a control in this model, and a fourth makes it moot:
     *
     * - `goes` — the export wraps it in an `<a href>` (`goesLinks`)
     * - `opens` — the export puts a checkbox before it and a `<label>` around it (`openSwitches`)
     * - a **link mark** on words inside it — the words are the control, which is a smaller target
     *   than the box but is a control
     * - inside a `form` — the submit is a real `<button>`, drawn by the form renderer
     *
     * Everything else painted like a button is a `<div>`, and the focus rule on it is dead.
     *
     * ## Asked of the placement, not of the definition
     *
     * The look is the definition's and the destination is the placement's — which is the whole of
     * what a component is, and it means neither node can answer this alone. A `버튼` definition
     * declares the focus ring once; seven placements each say where they go, and an eighth added
     * next month says nothing and is dead. So the question is asked where it can be answered and
     * reported where it can be fixed: against the placement a reader would click.
     */
    if (node.stype === 'instance' && !inForm && focusInside(doc, definitionFor(doc, attrs.componentId)) && !pressable(doc, sid, attrs)) {
      const called =
        (typeof attrs.name === 'string' && attrs.name && `'${attrs.name}'`) ||
        (typeof attrs.componentId === 'string' && attrs.componentId && `'${attrs.componentId}'`) ||
        '이 블록';
      found.push({
        sid,
        kind: 'press',
        said: `${called}에 키보드 초점 표시가 있지만 갈 곳이 없습니다 — 누르면 어디로 갈지 정해주세요`
      });
    }
    /*
     * And a block that is its own button, which is the simpler half: a frame a designer painted and
     * gave a focus ring, standing on a page. Inside a definition it is skipped — the placements
     * above answer for it, and reporting both would be one fault written twice.
     */
    if (
      node.stype !== 'instance' &&
      !inForm &&
      !inDefinition &&
      statesOf(attrs).focus &&
      !pressable(doc, sid, attrs)
    ) {
      const called =
        (typeof attrs.name === 'string' && attrs.name && `'${attrs.name}'`) ||
        (typeof attrs.partId === 'string' && attrs.partId && `'${attrs.partId}'`) ||
        '이 블록';
      found.push({
        sid,
        kind: 'press',
        said: `${called}에 키보드 초점 표시가 있지만 갈 곳이 없습니다 — 누르면 어디로 갈지 정해주세요`
      });
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') {
        walk(child, depth + 1, inForm || node.stype === 'form', inDefinition || node.stype === 'component');
      }
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

  /*
   * And what is wrong with the **document's own** files rather than with a block: how large the
   * pictures have made it. Reported against the root, because that is where a reader would go — there
   * is no block to click on for "this document is 12MB".
   */
  for (const said of assetFaults(doc as never)) {
    found.push({ sid: doc.rootId, kind: 'asset', said });
  }

  /*
   * And two pages at one address, which nothing could see: the panel lists both, both are editable,
   * and only one of them is ever served.
   */
  for (const fault of pathFaults(pagesOf(doc as never))) {
    found.push({ sid: fault.sid, kind: 'address', said: fault.said });
  }

  /*
   * And **what a page says about itself to everything that is not a browser**.
   *
   * Two pages are deliberately not asked. A `notFound` page is served for a request that matched
   * nothing — nobody arrives at it from a search result, and describing it describes an error — and
   * a `noIndex` page has *said* it does not want to be found, so telling a reader to describe it is
   * telling them to undo a decision they made on purpose. A fault list that argues with the reader's
   * own settings is a fault list they learn to close.
   *
   * The length is the second half, and it is the one nothing else could catch: an engine cuts a
   * description at about 160 characters, mid-word, and shows the cut. A reader who wrote three
   * sentences sees all three in the panel and two and a half in the world.
   */
  for (const page of pagesOf(doc as never)) {
    const attrs = (doc.getNode(page.sid)?.attributes ?? {}) as Record<string, unknown>;
    if (attrs.notFound === true || attrs.noIndex === true) continue;

    const about = typeof attrs.description === 'string' ? attrs.description.trim() : '';
    const name = typeof attrs.name === 'string' && attrs.name ? attrs.name : page.name;
    if (!about) {
      found.push({
        sid: page.sid,
        kind: 'found',
        said: `'${name}'에 설명이 없습니다 — 검색 결과와 공유 카드가 비어서 나갑니다`
      });
    } else if (about.length > DESCRIPTION_LIMIT) {
      found.push({
        sid: page.sid,
        kind: 'found',
        said: `'${name}'의 설명이 ${about.length}자입니다 — 검색 결과는 ${DESCRIPTION_LIMIT}자에서 자릅니다`
      });
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
