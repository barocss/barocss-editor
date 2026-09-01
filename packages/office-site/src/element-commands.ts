/**
 * Putting something **on** a page — a heading, some words, a picture, a list.
 *
 * ## The hole this fills
 *
 * The product could make three kinds of stack and nothing to put in them. A reader could arrange an
 * empty page beautifully. Measured against the sample the panel was built from: of the eight kinds of
 * block on the site, a reader could create three, and all three were containers.
 *
 * ## Where a new block goes
 *
 * One rule, and every builder of this kind uses it because it is the only one a reader can predict:
 *
 * - **Into the container that is selected**, at the end of it. Selecting a section and adding a
 *   heading means the heading goes in the section — which is what a reader means and what a stack is
 *   *for*.
 * - **After the block that is selected**, otherwise. A heading selected and another added makes two
 *   headings, in the order they were made.
 * - **After whatever the caret is in**, when nothing is selected — the walk both other products do,
 *   and the reason "insert" means *next to what I am looking at* everywhere in this repository.
 * - **At the end of the page**, when there is no caret either. Which is the state a reader is
 *   actually in when they open a site and reach for the rail, and without it every row in 추가 was
 *   greyed out on a freshly opened page — a panel of things a reader may not have.
 *
 * ## One command per kind
 *
 * Rather than `insertBlock({ kind })`, which is the rule the conformance harness enforces and is
 * right here for the reason it is right everywhere: a control that could only answer "it depends"
 * about what it makes is a control nobody can put on a toolbar or bind to a key.
 */
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { addChild, node, textNode, transaction } from '@barocss/model';
import type { INode } from '@barocss/datastore';
import { CONTAINERS, holdsABlock, SELECTABLE } from './selection';
import { freshPartId, scopeOf } from './components';
import { servicesOf } from './form';

type Node = Record<string, any>;

/** What a new block is put next to, and where. */
interface Where {
  parentId: string;
  at: number;
}

/**
 * A picture with nothing in it yet.
 *
 * An SVG data URI rather than a blank `src`, for the reason the sample avoids assets and for one
 * more: a `picture` with no source draws a broken image, and a reader who has just added one should
 * see a *place for a picture* rather than a fault. The panel is where they put theirs.
 */
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
      '<rect width="320" height="200" fill="#e2e8f0"/>' +
      '<text x="160" y="108" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">이미지</text>' +
      '</svg>'
  );

/**
 * The words in a block.
 *
 * `textNode` rather than the object it becomes — the same reason the operations are builders now: a
 * misspelt `stype` is a compile error rather than a node the schema refuses at runtime. `node` and
 * `textNode` have been in `@barocss/model` since it was written, beside the operation builders that
 * nobody could import.
 */
const run = (text = ''): INode => textNode('inline-text', text);

/** 15 twips to the CSS pixel — the document's unit, written as the number a reader is shown. */
const px = (value: number): number => value * 15;

/**
 * The colour a new button arrives in.
 *
 * A literal rather than `var:강조`, and it is worth the sentence: a token is resolved against the
 * *document*, and a document that has not declared one would draw a button with no colour at all —
 * a reader's first button, on their first page, invisible. A reader who has tokens changes it in one
 * gesture; a reader who has none gets a button.
 */
const ACCENT = '#0F7A5A';
const ACCENT_DARK = '#0B5C44';
/**
 * The hairline and the faint fill an accordion and a tab strip are drawn with.
 *
 * Literals for the same reason `ACCENT` is one: a token is resolved against the document, and a
 * reader whose page has declared none would get a structure with no lines in it at all — which reads
 * as a broken insert rather than as a plain one.
 */
const LINE = '#E3E7E4';
const TINT = '#F4F6F4';

/**
 * One question of a form: a label a reader can see, and the control under it.
 *
 * `required` on all three, because a contact form whose message may be empty is a form that collects
 * blank messages — and a reader who wants one optional turns it off, which is one press against the
 * three they would otherwise have to turn on.
 */
const field = (label: string, name: string, kind: string): Node =>
  node('field', { label, name, kind, required: true, sizing: 'fill' }, []) as Node;

/**
 * One row of an accordion: the question, and the answer that is not there until it is asked for.
 *
 * The body is a **sibling** of the header rather than a child of it, which is the one structural
 * fact this whole feature turns on: the switch is put immediately before the block it opens, and a
 * switch inside a `display: none` is a switch no key can reach (`states.ts`).
 */
const accordionItem = (part: string, n: number): Node =>
  node(
    'frame',
    {
      name: '항목',
      layoutMode: 'column',
      sizing: 'fill',
      gap: 0,
      stroke: LINE,
      strokeWidth: px(1)
    },
    [
      node(
        'frame',
        {
          name: '질문',
          layoutMode: 'row',
          sizing: 'fill',
          justifyContent: 'between',
          alignItems: 'center',
          paddingTop: px(16),
          paddingBottom: px(16),
          paddingLeft: px(20),
          paddingRight: px(20),
          // Already the colour it will change *from*, so the state changes a value rather than
          // inventing one — the same rule `insertButton` follows about a border's width.
          fill: '#FFFFFF',
          opens: part,
          states: { hover: { fill: TINT }, open: { fill: TINT } },
          transitionMs: 120
        },
        [node('paragraph', {}, [run(`질문 ${n + 1}`)]) as never]
      ) as never,
      node(
        'frame',
        {
          name: '답',
          partId: part,
          layoutMode: 'column',
          sizing: 'fill',
          paddingBottom: px(20),
          paddingLeft: px(20),
          paddingRight: px(20),
          visible: false,
          states: { open: { visible: true } }
        },
        [node('paragraph', {}, [run('답을 입력하세요')]) as never]
      ) as never
    ]
  ) as Node;

/** One tab: a target a thumb can hit, and a look for having been chosen. */
const tab = (part: string, n: number): Node =>
  node(
    'frame',
    {
      name: `탭 ${n + 1}`,
      layoutMode: 'row',
      sizing: 'hug',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: px(12),
      paddingBottom: px(12),
      paddingLeft: px(20),
      paddingRight: px(20),
      fill: '#FFFFFF',
      stroke: '#FFFFFF',
      strokeWidth: px(1),
      cornerRadius: px(10),
      // The first one has already been pressed: a tab strip showing nothing is not a tab strip.
      ...(n === 0 ? { openAtRest: true } : {}),
      opens: part,
      states: { hover: { fill: TINT }, open: { fill: TINT, stroke: ACCENT } },
      transitionMs: 120
    },
    [node('paragraph', {}, [run(`탭 ${n + 1}`)]) as never]
  ) as Node;

/** One panel: exactly an accordion's answer, and that is the point of both being one mechanism. */
const panel = (part: string, n: number): Node =>
  node(
    'frame',
    {
      name: `탭 ${n + 1} 내용`,
      partId: part,
      layoutMode: 'column',
      sizing: 'fill',
      padding: px(20),
      stroke: LINE,
      strokeWidth: px(1),
      cornerRadius: px(10),
      visible: false,
      states: { open: { visible: true } }
    },
    [node('paragraph', {}, [run(`탭 ${n + 1}의 내용입니다`)]) as never]
  ) as Node;

export class SiteElementExtension implements Extension {
  name = 'siteElements';
  priority = 48;

  onCreate(editor: Editor): void {
    /**
     * One place the engine is reached through, which is why the cast is here and not per command.
     *
     * `registerCommand` is not on the published `Editor` type, so registering needs one — and one is
     * all this file writes. The count in `editor-is-typed.test.ts` is a ratchet: a second identical
     * cast a few lines down would have been a number going up for no new reason, which is what that
     * check exists to make impossible to do quietly.
     */
    const command = (spec: unknown) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand(spec);

    const register = (
      name: string,
      make: () => Node,
      can: (payload?: Record<string, unknown>) => boolean = (payload) =>
        !!this._where(editor, payload?.selection, payload?.pageId)
    ) =>
      command({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
          await this._put(editor, make(), payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /**
     * The same, for an insert that has to know **where it is landing** before it can build itself.
     *
     * An accordion mints `partId`s, and a name is unique inside a page or a definition — so the one
     * thing it cannot do is decide what to make without first knowing which page it is going onto.
     * Every other insert here is the same block wherever it lands, which is why this is the second
     * shape rather than the only one.
     */
    const registerMade = (name: string, make: (where: Where) => Node) =>
      command({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
          const where = this._where(editor, payload?.selection, payload?.pageId);
          return where ? await this._put(editor, make(where), payload) : false;
        },
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
          !!this._where(editor, payload?.selection, payload?.pageId)
      });

    /** A heading. Level 2, because a page has one level 1 and it is the page's own title. */
    register('insertHeading', () => node('heading', { level: 2 }, [run('제목')]) as Node);

    /**
     * Words.
     *
     * `insertBodyText` rather than `insertText`, which is the shared kit's name for **typing** — two
     * commands with one name is one of them being unreachable, and the check that counts what a
     * reader can run would not have seen which.
     */
    register('insertBodyText', () => node('paragraph', {}, [run('본문을 입력하세요')]) as Node);

    /** A picture, with a place for a picture in it. */
    register(
      'insertPicture',
      () => node('picture', { src: PLACEHOLDER, alt: '', fit: 'cover', sizing: 'fill' }, []) as Node
    );

    /**
     * A list of things, with one thing in it a reader can type over.
     *
     * `type`, which is what the schema declares. It said `kind: 'bullet'` from the day it was
     * written — an attribute nothing reads, on the one node whose whole question is *which kind* —
     * and nothing noticed because the marker came from Word's numbering and a site has none, so
     * every list drew as a stack of paragraphs whichever word was used.
     */
    register(
      'insertBulletList',
      () =>
        node('list', { type: 'bullet' }, [
          node('listItem', {}, [node('paragraph', {}, [run('항목')])])
        ]) as Node
    );

    /** And the other kind, which is `<ol>` and is the browser's to number. */
    register(
      'insertNumberList',
      () =>
        node('list', { type: 'ordered' }, [
          node('listItem', {}, [node('paragraph', {}, [run('항목')])])
        ]) as Node
    );

    /**
     * A **quotation**.
     *
     * `blockQuote` holds blocks rather than words — `content: 'block+'` — which is the standard
     * schema's answer and the right one: a pulled-out quotation on a page is usually two sentences
     * and an attribution, and a node that held only inline content could not carry the second.
     */
    register(
      'insertQuote',
      () =>
        node('blockQuote', {}, [
          node('paragraph', {}, [run('인용할 문장을 여기에 씁니다.')]),
          node('paragraph', {}, [run('— 말한 사람')])
        ]) as Node
    );

    /**
     * A **rule** between two things.
     *
     * An atom — it holds nothing and is the one block on a page that is purely a division. A frame
     * with a top border would have drawn the same line and would have been a box a reader could put
     * things in by accident, which is the difference between a separator and a container.
     */
    register('insertRule', () => node('horizontalRule', {}, []) as Node);

    /**
     * Code, kept as it was typed.
     *
     * Held back for a round because the node could be placed and not typed into: inside code Enter
     * must be a newline and not a new block, and the text stack answered the prose question. It does
     * not any more — the schema says `code: true` and the view reads it — so the block is offered.
     *
     * The language is the panel's to say and the default is none: a page that highlights does so
     * from `data-language`, and a block that has not said which language it is in is a block nobody
     * has told yet rather than one in the wrong one.
     */
    register(
      'insertCode',
      () => node('codeBlock', { language: '' }, [run('function 안녕() {\n  return 1;\n}')]) as Node
    );

    /**
     * A **button**: the one thing on a page that is a composition rather than a node.
     *
     * ## Why it is not a node
     *
     * There is no `button` in this schema and there should not be. A button is a box with a word in
     * it, a colour, a radius, a hit area and — since states — an answer to the pointer; every one of
     * those is a thing a frame already says, and a node would be a second way to say them that the
     * panel would then have to offer twice. The deck reached the same conclusion about its own
     * shapes, one product earlier.
     *
     * ## Then why is it a command
     *
     * Because *the composition* is the knowledge. A reader who wants a button and is handed a frame
     * has to know that a hit area is 44 high, that a border must exist before it can change colour,
     * that the radius is the pill and not the box, and that a hover which changes the padding
     * flickers. That is four decisions and a paragraph of arithmetic, and putting them in a command
     * is how a product has taste rather than opinions.
     *
     * The link is left empty on purpose: a reader chooses the page, and the mark is `linkToPage`'s
     * to write. A button with a made-up destination is worse than one with none.
     */
    register(
      'insertButton',
      () =>
        node(
          'frame',
          {
            name: '버튼',
            layoutMode: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            sizing: 'hug',
            // A target a thumb can hit: 44 is what every guideline asks for, and this is 20 + 12 + 12.
            paddingTop: px(12),
            paddingBottom: px(12),
            paddingLeft: px(20),
            paddingRight: px(20),
            fill: ACCENT,
            cornerRadius: px(40),
            /*
             * A border that is already the width it will be, so only its colour changes later — a
             * border that grows on hover reflows the words inside it and the box leaves the pointer.
             */
            stroke: ACCENT,
            strokeWidth: px(1),
            states: { hover: { fill: ACCENT_DARK, stroke: ACCENT_DARK } }
          },
          [node('paragraph', {}, [run('버튼')]) as never]
        ) as Node
    );

    /**
     * **An accordion** — a stack of questions, each with an answer that is not on the page until it
     * is asked for.
     *
     * ## Why this is a command and not four gestures
     *
     * Every piece of it already existed: a column, a row with words in it, a second column with
     * `visible: false`, and `opens` naming the second from the first. A reader could have built one
     * — by knowing that the body has to be a *sibling* of the header rather than inside it, that it
     * needs a `partId` because `opens` records a name, and that the name has to be one nothing else
     * on the page is using. That is three facts about the mechanism and none about their page, which
     * is the definition of something a product should be doing for them.
     *
     * ## The name, minted here
     *
     * `opens` resolves a name inside the page or definition it is in, and **the first match wins**.
     * Two accordions on one page both calling their body 내용 is the second accordion's header
     * opening the first accordion's body — silently, and only in the published page. `freshPartId`
     * is what stops it, and the three names are minted against each other as well as against the
     * page, because they do not exist yet when the second one is asked for.
     *
     * ## Checkboxes, not radios
     *
     * No `opensOne`, so each answer opens and closes on its own and a visitor can have three open at
     * once. An author who wants one at a time turns 하나만 열림 on in the panel, and the same
     * structure becomes radios — which is the difference between an accordion and a tab strip stated
     * as one switch rather than as two features.
     */
    registerMade('insertAccordion', (where) => {
      const store = this._store(editor)!;
      const scope = scopeOf(store as never, where.parentId);
      const parts: string[] = [];
      for (let n = 0; n < 3; n += 1) parts.push(freshPartId(store as never, scope, '내용', parts));

      return node(
        'frame',
        { name: '아코디언', layoutMode: 'column', sizing: 'fill', gap: 0 },
        parts.map((part, n) => accordionItem(part, n) as never)
      ) as Node;
    });

    /**
     * **A tab strip** — the same two blocks as an accordion, with one switch turned on.
     *
     * `opensOne` on the outer block is the whole difference: the switches inside become radios that
     * share a name, so choosing the second tab unchecks the first and its panel falls back to what
     * it says at rest, which is `visible: false`. No rule keeps them in step, because a radio group
     * *is* the rule and the browser has had it since 1993.
     *
     * Two things a tab strip needs that an accordion does not, and both are one attribute:
     *
     * - **one already chosen** — `openAtRest` on the first tab, because a tab strip showing nothing
     *   is the one state it must never be in;
     * - **the chosen tab looking chosen** — `states.open` on the *tab*, which is the one 열림 that
     *   cannot be written as `switch:checked + block` (the tab is not beside its switch; the panel
     *   is). `openerRules` publishes it by the switch's id.
     */
    registerMade('insertTabs', (where) => {
      const store = this._store(editor)!;
      const scope = scopeOf(store as never, where.parentId);
      const parts: string[] = [];
      for (let n = 0; n < 3; n += 1) parts.push(freshPartId(store as never, scope, '탭 내용', parts));

      return node(
        'frame',
        { name: '탭', layoutMode: 'column', sizing: 'fill', gap: 0, opensOne: true },
        [
          node(
            'frame',
            {
              name: '탭 줄',
              layoutMode: 'row',
              sizing: 'fill',
              alignItems: 'center',
              gap: px(4),
              paddingBottom: px(4)
            },
            parts.map((part, n) => tab(part, n) as never)
          ) as never,
          ...parts.map((part, n) => panel(part, n) as never)
        ]
      ) as Node;
    });

    /**
     * **A form** — the one block on an ordinary site that had no node behind it.
     *
     * ## Why the insert is a whole form and not an empty one
     *
     * A `<form>` with nothing in it is not a thing anybody wants, and the arrangement is where the
     * knowledge is: a label above every control rather than a placeholder standing in for one, a
     * submit that is a real button so the Enter key works, and an `email` field that is actually
     * `type="email"` so a phone shows the right keyboard and the browser checks it for free.
     *
     * ## And it arrives **broken on purpose**
     *
     * With no 보낼 곳, which `formFaults` reports the moment it exists. There is deliberately no
     * default destination and none of this product's own: a builder that quietly posted a stranger's
     * message to its own server would be doing something nobody asked for with somebody else's data.
     *
     * So the reader is handed a form that is complete except for the one decision only they can make,
     * and told so — rather than one that looks finished and silently sends messages into nothing,
     * which is what a form with an empty `action` does.
     */
    const formNode = (sends: string): Node =>
      node(
        'form',
        {
          name: '폼',
          /*
           * The connection it sends through, by name — minted with the form when the document has
           * none. A reader who inserts their first form gets a form **and** a place to put the
           * address, both incomplete and both reported; a reader who has one already gets a form
           * pointed at it, which is what makes five forms one address rather than five copies.
           */
          sends,
          layoutMode: 'column',
          sizing: 'fill',
          gap: px(16),
          padding: px(24),
          fill: '#FFFFFF',
          stroke: LINE,
          strokeWidth: px(1),
          cornerRadius: px(14),
          maxWidth: px(520)
        },
        [
          node('heading', { level: 3 }, [run('연락하기')]) as never,
          field('이름', 'name', 'text') as never,
          field('이메일', 'email', 'email') as never,
          field('하고 싶은 말', 'message', 'paragraph') as never,
          node(
            'field',
            {
              kind: 'submit',
              label: '보내기',
              name: 'submit',
              sizing: 'hug',
              fill: ACCENT,
              ink: '#FFFFFF',
              stroke: ACCENT,
              strokeWidth: px(1),
              cornerRadius: px(40)
            },
            []
          ) as never
        ]
      ) as Node;

    /**
     * **A table** — a comparison, which is what a table on a page is for.
     *
     * ## Why this is the product's own and not the shared kit's
     *
     * `insertTable` exists in `@barocss/extensions` and puts a table **at the caret**, which is
     * Word's gesture: a table lands in the prose a reader is typing. This rail's gesture is the other
     * one — a block goes after what is selected, or at the end of the page a reader is looking at —
     * and with nothing selected there is no caret at all, so the shared command refuses.
     *
     * Two commands with one name is one of them unreachable, and the check that counts what a reader
     * can run would not have said which. So this is named for what it makes, exactly as
     * `insertBodyText` is named beside the kit's `insertText`.
     *
     * ## Three columns, a header row, and a caption
     *
     * A comparison: features down the side, plans across the top. The header row is the reason this
     * is a table rather than a stack — a screen reader reads a cell with the name of its column, and
     * a grid of boxes reads as a wall of words — so it is there from the first press rather than
     * being a switch a reader has to find.
     */
    register('insertTableBlock', () => {
      const cell = (words: string, header = false): Node =>
        node(header ? 'bTableHeaderCell' : 'bTableCell', {}, [run(words)]) as Node;

      return node(
        'bTable',
        { caption: '' },
        [
          node('bTableHeader', {}, [
            cell('', true) as never,
            cell('기본', true) as never,
            cell('프로', true) as never
          ]) as never,
          node(
            'bTableBody',
            {},
            [
              node('bTableRow', {}, [
                cell('페이지 수') as never,
                cell('5') as never,
                cell('무제한') as never
              ]) as never,
              node('bTableRow', {}, [
                cell('도메인 연결') as never,
                cell('아니오') as never,
                cell('예') as never
              ]) as never
            ]
          ) as never
        ]
      ) as Node;
    });

    /**
     * **A form**, and the connection it sends through — in **one** transaction.
     *
     * Two nodes and one undo, because it is one sentence a reader means: *put a form here that sends
     * somewhere*. Two commands would be a form that exists for one keystroke with no destination, and
     * a reader who pressed ⌘Z once and got a document with a connection nobody uses.
     *
     * The connection is the document's first when it has one — which is what makes five forms on a
     * site five references to one address rather than five copies of it — and a fresh empty one when
     * it has none.
     */
    command({
      name: 'insertForm',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
        const where = this._where(editor, payload?.selection, payload?.pageId);
        if (!where) return false;

        const store = this._store(editor)!;
        const root = this._rootOf(editor, where.parentId);
        const doc = { rootId: String(root ?? ''), getNode: (sid: string) => store.getNode(sid) };

        const held = servicesOf(doc as never)[0];
        const sends = held?.name ?? '문의함';

        const steps: unknown[] = [];
        if (!held) {
          /*
           * Into `resources`, beside the datasets — the container this schema keeps referred-to
           * things in, and the reason a form can name one at all.
           *
           * **Empty on purpose**: there is no default address and none of this product's own, so the
           * reader is handed the one thing only they can supply, named and reported by
           * `documentFaults`, rather than a form that looks finished and sends nowhere.
           */
          const box = ((store.getNode(String(root ?? ''))?.content ?? []) as unknown[])
            .filter((sid): sid is string => typeof sid === 'string')
            .map((sid) => store.getNode(sid))
            .find((one) => one?.stype === 'resources');
          if (!box) return false;
          steps.push(
            addChild(
              String(box.sid),
              node('service', { name: sends, label: '문의함', method: 'post' }, []) as never,
              ((box.content ?? []) as unknown[]).length
            )
          );
        }

        steps.push(addChild(where.parentId, formNode(sends) as never, where.at));
        const done = await transaction(editor, steps as never).commit();
        if (done.success !== true) return false;

        const made = ((store.getNode(where.parentId)?.content ?? []) as string[])[where.at];
        if (made) {
          void (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
            'setNode',
            { nodeIds: [made] }
          );
        }
        return true;
      },
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        !!this._where(editor, payload?.selection, payload?.pageId)
    });

    /**
     * A **placement** of a definition — the header, the button, the card.
     *
     * The one insert that takes an argument, because a placement without a definition is a placement
     * of nothing. The panel offers the definitions the document holds; this refuses a name it does
     * not have, rather than putting an empty box on the page.
     */
    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'insertPlacement',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
        await this._put(
          editor,
          node('instance', { componentId: String(payload?.componentId ?? ''), sizing: 'fill' }, []) as Node,
          payload
        ),
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        !!this._where(editor, payload?.selection, payload?.pageId) &&
        this._hasComponent(editor, payload?.componentId)
    });

    /**
     * A **list that comes from data**: one design, drawn once per row.
     *
     * Two arguments, and both are required for the same reason `insertPlacement` needs one — a list
     * with no data draws nothing, and a list with nothing to draw for each row draws nothing either.
     * The panel offers a dataset and a definition; the command refuses anything else.
     */
    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'insertDataList',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
        await this._put(
          editor,
          node(
            'collection',
            {
              source: String(payload?.source ?? ''),
              layoutMode: 'row',
              gap: 240,
              padding: 0,
              sizing: 'fill'
            },
            [node('instance', { componentId: String(payload?.componentId ?? ''), sizing: 'fill' }, [])]
          ) as Node,
          payload
        ),
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        !!this._where(editor, payload?.selection, payload?.pageId) &&
        this._hasComponent(editor, payload?.componentId) &&
        this._hasDataset(editor, payload?.source)
    });
  }

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    return (editor as never as { dataStore?: { getNode: (sid: string) => Node } }).dataStore;
  }

  private _resource(editor: Editor, holder: string, stype: string, name: unknown, key: string): boolean {
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId || typeof name !== 'string' || !name) return false;

    const root = store.getNode(rootId);
    const box = ((root?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .find((child) => child?.stype === holder);

    return ((box?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .some((one) => one?.stype === stype && one?.attributes?.[key] === name);
  }

  private _hasComponent(editor: Editor, id: unknown): boolean {
    return this._resource(editor, 'components', 'component', id, 'id');
  }

  private _hasDataset(editor: Editor, name: unknown): boolean {
    return this._resource(editor, 'resources', 'dataset', name, 'name');
  }


  /** The document a block is in — the root, walked up. */
  private _rootOf(editor: Editor, sid: string): string | undefined {
    const store = this._store(editor);
    let at: string | undefined = sid;
    for (let hop = 0; at && hop < 24; hop += 1) {
      const parent: unknown = store?.getNode(at)?.parentId;
      if (typeof parent !== 'string' || !parent) return at;
      at = parent;
    }
    return at;
  }

  /** Where a new block goes — see the header for the rule. */
  private _where(editor: Editor, given?: unknown, page?: unknown): Where | null {
    const store = this._store(editor);
    if (!store) return null;

    const chosen = selectedNodeIds((editor as never as { selection?: never }).selection).filter((sid) =>
      store.getNode(sid)
    );

    if (chosen.length === 1) {
      const node = store.getNode(chosen[0])!;
      // Into the container that is selected: what a reader means, and what a stack is for.
      if (CONTAINERS.has(String(node.stype))) {
        return { parentId: chosen[0], at: ((node.content ?? []) as unknown[]).length };
      }
      // After the block that is selected.
      const parent = node.parentId ? store.getNode(String(node.parentId)) : undefined;
      const at = ((parent?.content ?? []) as unknown[]).indexOf(chosen[0]);
      if (parent && at >= 0) return { parentId: String(parent.sid), at: at + 1 };
    }

    const caret = this._atCaret(editor, given);
    if (caret) return caret;

    /*
     * Nothing selected and no caret: the end of the page the reader is looking at.
     *
     * The page is the app's to say — the model has no notion of "on screen" and should not grow one
     * — so the rail passes it. Without this, opening a site and reaching for 추가 offered a list of
     * things every one of which was greyed out.
     */
    const pageId = typeof page === 'string' ? page : undefined;
    const node = pageId ? store.getNode(pageId) : undefined;
    return node ? { parentId: pageId!, at: ((node.content ?? []) as unknown[]).length } : null;
  }

  /**
   * After whatever the caret is in — the same walk both other products do.
   *
   * Up from what the selection names until it reaches something whose parent lists it, is a block a
   * reader can select, **and sits somewhere a block may go**. The last of those is `holdsABlock`,
   * and it is there because a table cell is all three of the first ones and its parent holds cells:
   * without it every insert here put a block inside a table row and the validator threw it away.
   */
  private _atCaret(editor: Editor, given?: unknown): Where | null {
    const store = this._store(editor);
    const selection: any = given ?? (editor as never as { selection?: unknown }).selection;
    if (!store || !selection?.startNodeId) return null;

    let node: any = store.getNode(selection.startNodeId);
    let depth = 0;
    while (node && depth++ < 64) {
      const parent: any = node.parentId ? store.getNode(node.parentId) : undefined;
      const at = parent?.content?.indexOf?.(node.sid) ?? -1;
      if (
        parent &&
        at >= 0 &&
        typeof node.text !== 'string' &&
        node.stype !== 'inline-text' &&
        SELECTABLE.has(String(node.stype)) &&
        holdsABlock(store as never, parent.stype)
      ) {
        return { parentId: String(parent.sid), at: at + 1 };
      }
      node = parent;
    }
    return null;
  }

  /**
   * Put it there, and **select it**.
   *
   * Selected because a reader who has just added a block is about to say something about it — where
   * it sits, what it is called, what colour it is — and a panel showing the thing they added is the
   * difference between a tool and a list of buttons. It is also the rule `duplicateBlocks` learned
   * the hard way: a command that acted on a set has to say what the set is afterwards.
   */
  private async _put(editor: Editor, child: Node, payload?: Record<string, unknown>): Promise<boolean> {
    const where = this._where(editor, payload?.selection, payload?.pageId);
    if (!where) return false;

    const store = this._store(editor)!;
    const done = await transaction(editor, [
      addChild(where.parentId, child as never, where.at)
    ] as never).commit();
    if (done.success !== true) return false;

    const made = ((store.getNode(where.parentId)?.content ?? []) as string[])[where.at];
    if (made) {
      (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
        'setNode',
        { nodeIds: [made] }
      );
    }
    return true;
  }
}

export function createElementCommands(): Extension {
  return new SiteElementExtension();
}
