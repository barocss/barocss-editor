/**
 * A site to open the product with — and to **measure it against**.
 *
 * ## Why this one is elaborate, and then why it was rebuilt
 *
 * The first sample was two pages and made the argument that a landing page is a column of stacks. It
 * proved the claim and taught nothing else, because a property panel can only be judged against a
 * document that uses the properties. So the second one was deliberately dense: every attribute the
 * site schema adds, used somewhere, at more than one value.
 *
 * It was dense and it was **ugly**, and that turned out to be a measurement rather than a matter of
 * taste. Asked to make it look like something a person would ship, the vocabulary ran out in four
 * specific places, all of them on the first screen: a navigation bar could not put the mark at one
 * end and the links at the other, a section could not have more air above it than below, a hero
 * could not have a picture behind its words, and a card could not have a shadow. Those four gaps are
 * `justifyContent`, the four paddings, `backgroundImage` and `shadowColor`, and every one of them
 * was found by trying to build something rather than by reading the schema.
 *
 * So this file is two things at once: the document the panel is judged against, and the argument
 * that the model can express a page somebody would put their name on.
 *
 * ## The design it is built to
 *
 * Ink and paper with one accent, which is a **deep green** rather than the blue every developer tool
 * defaults to; greys biased a few degrees toward that green so they read as chosen; one radius scale
 * (16px on a box, a pill on a button); and a single dark region at the foot of each page rather than
 * bands alternating down it. The type scale is the heading levels the document model already has,
 * because a site builder that needed a second one would be admitting the first is not a document.
 *
 * What it exercises, and where:
 *
 * | what | where |
 * | --- | --- |
 * | `layoutMode` — column, row, **grid** | the hero, the card row, the feature grid |
 * | `justifyContent` — between, center | the navigation bar, the numbers, the footer |
 * | per-side padding | every section: more air above a heading than below it |
 * | `sizing` — fill, **hug**, **fixed** with `minWidth`/`maxWidth` | the CTA, the sidebar, the trio |
 * | `overrides` at **both** narrow widths, not only mobile | the hero, the grid, the card row |
 * | `alignItems` — start, center, end | the header bar, the CTA, the enquiry row |
 * | **design tokens** (`var:강조`, `var:바탕`, `var:먹`) | every accent on the site |
 * | `gradientFrom`/`To`/`Angle` | the closing band, the post covers |
 * | `backgroundImage` with `tile` | the hero's grid |
 * | `shadowColor`/`Blur`/`Distance` | the cards, the hero's picture |
 * | `cornerRadius` and one four-cornered box | the cards; the featured plan |
 * | `component` + `instance` with **bound values** | the header, the footer, the button |
 * | `collection` with `sortBy`, `limit`, **`where`/`equals`** | the products, the posts |
 * | `picture` with `fit`, `fill`, `stroke` | the hero image, the portraits |
 * | marks — `fontColor`, `fontSize`, **`link` to a page of this site** | the hero, the navigation |
 * | five pages with **addresses** | `/`, `/제품`, `/가격`, `/소개`, `/블로그` |
 *
 * Every node in it is the office schema's. That is still the argument; this is the argument made at
 * a size where it can be disbelieved.
 */
import type { SchemaDefinition } from '@barocss/schema';
import { mark, node, textNode } from '@barocss/model';
import { pageRef } from './page-link';
import { enginePicture, gridTexture, monogram, portrait, postCover, wordmark } from './sample-art';

/**
 * A node as this fixture writes it.
 *
 * `Record<string, unknown>` rather than the store's `INode`, and the casts below hop through
 * `unknown` because the two do not overlap: `INode` has required fields a *tree being loaded* has not
 * got yet — the store fills them in. Which is the honest relationship between a document on disk and
 * a document in memory, and `loadDocument` is where it is crossed.
 */
type Node = Record<string, unknown>;

/**
 * The lengths this site is laid out on, in twips, where 15 twips is a CSS pixel.
 *
 * A scale rather than numbers at the call site, for the reason every design system has one: a page
 * whose sections are 96, 92 and 104 apart is a page that looks *almost* right and cannot be fixed by
 * looking at any one of them. Written as the pixel it becomes, because that is the number the panel
 * shows a reader.
 */
const px = (value: number): number => value * 15;

/** The rhythm: the air above a section, and the air below it, which are not the same number. */
const AIR = { top: px(112), bottom: px(96), side: px(72), tight: px(56) };
/** The gaps: between a section's parts, between a heading and its sentence, inside a card. */
const GAP = { wide: px(40), mid: px(24), tight: px(12), hair: px(6) };
/** One radius scale. A box is 16, a picture is 16, a button is a pill. */
const ROUND = { box: px(16), pill: px(40) };
/** The measure a page's text is read at, and the width the whole site is centred in. */
const WIDTH = { page: px(1200), text: px(680), aside: px(340) };

/**
 * The sample's own words for what a page is made of, built on the model's.
 *
 * `node`, `textNode` and `mark` have been in `@barocss/model` since it was written, beside the
 * operation builders nobody could import — and a fixture is exactly where a raw object literal hides
 * best, because a misspelt `stype` reads as a document decision until the schema refuses it. What is
 * left here is the *product's* vocabulary: a page is stacks, cards, placements and pictures, and
 * saying so is what makes the sample readable as an argument rather than as a tree.
 */
const text = (value: string, marks?: ReturnType<typeof mark>[]): Node =>
  (marks ? textNode('inline-text', value, marks) : textNode('inline-text', value)) as unknown as Node;

/** A run in a colour, which is how every product in this repository colours words. */
const inColour = (value: string, colour: string): Node =>
  text(value, [mark('fontColor', { color: colour, range: [0, value.length] })]);

/** A run at a size of its own — the one place this site sets type by hand rather than by level. */
const atSize = (value: string, size: string, colour?: string): Node =>
  text(value, [
    mark('fontSize', { size, range: [0, value.length] }),
    ...(colour ? [mark('fontColor', { color: colour, range: [0, value.length] })] : [])
  ]);

/**
 * A run that goes to **a page of this site**, named by its durable id rather than its address.
 *
 * `page:제품`, not `/제품`, so that renaming the address moves the link with it — the same shape as
 * `var:강조` for a colour and `field:이름` for a value from a row, resolved where it is drawn
 * (`page-link.ts`).
 */
const toPage = (value: string, id: string, colour?: string): Node =>
  text(value, [
    mark('link', { href: pageRef(id), range: [0, value.length] }),
    ...(colour ? [mark('fontColor', { color: colour, range: [0, value.length] })] : [])
  ]);

const heading = (level: number, value: string, extra: Record<string, unknown> = {}): Node =>
  node('heading', { level, ...extra }, [text(value) as never]) as unknown as Node;

const paragraph = (value: string | Node[], extra: Record<string, unknown> = {}): Node =>
  node('paragraph', extra, (typeof value === 'string' ? [text(value)] : value) as never) as unknown as Node;

/** A sentence in the muted grey, which is most of the sentences on a marketing page. */
const quiet = (value: string, extra: Record<string, unknown> = {}): Node =>
  paragraph([inColour(value, '5C6660')], extra);

/** A stack: the one container this product builds everything out of. */
const stack = (
  layoutMode: 'row' | 'column' | 'grid',
  attributes: Record<string, unknown>,
  content: Node[]
): Node => node('frame', { layoutMode, sizing: 'fill', ...attributes }, content as never) as unknown as Node;

/**
 * A **section**: the band across the page, and the column of content centred inside it.
 *
 * Two stacks rather than one, and it is the shape every site on the web has: the band is as wide as
 * the window and carries the colour, and the column inside it is as wide as the reading measure and
 * carries the words. A page builder that could only do one of the two would be a page builder whose
 * sections either touch the window's edges or cannot be coloured.
 */
const section = (
  name: string,
  attributes: Record<string, unknown>,
  content: Node[],
  inner: Record<string, unknown> = {}
): Node =>
  stack(
    'column',
    {
      name,
      alignItems: 'center',
      paddingTop: AIR.top,
      paddingBottom: AIR.bottom,
      paddingLeft: AIR.side,
      paddingRight: AIR.side,
      overrides: {
        tablet: { paddingTop: AIR.bottom, paddingBottom: AIR.tight, paddingLeft: px(40), paddingRight: px(40) },
        mobile: { paddingTop: AIR.tight, paddingBottom: AIR.tight, paddingLeft: px(20), paddingRight: px(20) }
      },
      ...attributes
    },
    [stack('column', { name: `${name} 안`, gap: GAP.wide, maxWidth: WIDTH.page, ...inner }, content)]
  );

const picture = (src: string, alt: string, extra: Record<string, unknown> = {}): Node =>
  node('picture', { src, alt, fit: 'cover', ...extra }, []) as unknown as Node;

/** A placement of a definition, with the answers it is given. */
const placed = (
  componentId: string,
  values: Record<string, string> = {},
  extra: Record<string, unknown> = {}
): Node =>
  node(
    'instance',
    { componentId, sizing: 'fill', ...extra },
    Object.entries(values).map(([name, value]) => node('componentValue', { name, value })) as never
  ) as unknown as Node;

/**
 * A card: a white box with a shadow, which is what a card *is* and could not be until now.
 *
 * The shadow is tinted toward the page's ink rather than pure black, and thrown down and soft — the
 * ordinary card, stated once here so that eleven of them agree.
 */
const card = (title: string, body: string, extra: Record<string, unknown> = {}): Node =>
  stack(
    'column',
    {
      gap: GAP.tight,
      padding: px(28),
      fill: 'var:면',
      sizing: 'fill',
      cornerRadius: ROUND.box,
      shadowColor: 'rgba(14, 21, 18, 0.07)',
      shadowBlur: px(24),
      shadowDistance: px(6),
      stroke: 'var:선',
      strokeWidth: px(1),
      /*
       * And what it says under the pointer. The **colour** of the border and the softness of the
       * shadow, never the border's width or the padding: those would resize the card, the card would
       * move out from under the pointer, and a visitor holding still would watch it flicker.
       */
      states: {
        hover: {
          stroke: 'var:강조',
          shadowColor: 'rgba(15, 122, 90, 0.18)',
          shadowBlur: px(32),
          shadowDistance: px(10)
        }
      },
      ...extra
    },
    [heading(3, title), quiet(body)]
  );

/**
 * One item of the navigation — a **box** with a word in it, rather than a word.
 *
 * It was a bare paragraph, and two things were wrong with that at once. A visitor on a phone had a
 * 14-pixel-tall target to hit, where every guideline asks for something near 44; and there was
 * nowhere for a hover to live, because a state is paint and a paragraph is not painted — text sizing
 * and text paint are the *stack's* question in this schema, asked one level up.
 *
 * So the hit area and the hover turn out to be the same fix, which is usually the sign that the
 * structure rather than the styling was the thing that was wrong.
 */
const navItem = (label: string, page: string): Node =>
  stack(
    'row',
    {
      partId: `nav-${page}`,
      // Named, so the layer list says 제품 rather than 가로 스택 four times in a row.
      name: label,
      alignItems: 'center',
      sizing: 'hug',
      paddingTop: px(8),
      paddingBottom: px(8),
      paddingLeft: px(12),
      paddingRight: px(12),
      cornerRadius: px(8),
      states: { hover: { fill: 'var:바탕' } }
    },
    [paragraph([toPage(label, page, '3A443E')], { partId: `nav-${page}-label` })]
  );

/**
 * A list of things, in the two kinds a page has.
 *
 * `type`, which is what the schema declares — the sample said `kind` and so did the insert command,
 * and neither of them was ever read: the marker came from Word's numbering, a site has none, and so
 * a list drew as an indented column of sentences whichever word was used. It is `<ul>` and `<ol>`
 * now, and the browser draws the markers.
 */
const listOf = (kind: 'bullet' | 'ordered', items: string[], extra: Record<string, unknown> = {}): Node => ({
  stype: 'list',
  attributes: { type: kind, ...extra },
  content: items.map((one) => ({
    stype: 'listItem',
    attributes: {},
    content: [paragraph(one)]
  }))
});

/**
 * A quotation, as the node for one.
 *
 * It was a bordered stack holding a big paragraph and a small one — which looked right and said
 * nothing: a published page carried two divs where a reader's browser, a screen reader and a search
 * engine all wanted a `blockquote`. The node has been in the schema since it was written; the sample
 * drew a picture of it instead, which is exactly the gap this round was looking for.
 */
const quoteOf = (said: string, who: string, extra: Record<string, unknown> = {}): Node => ({
  stype: 'blockQuote',
  /*
   * No `maxWidth` here, and it is worth the line: the sizing attributes are declared on the nodes a
   * page *arranges* — frame, collection, picture, instance, surface — and not on a text block, on
   * purpose. A heading that wants to hug its words goes in a stack that hugs, which is how every
   * auto-layout tool works: text sizing is the stack's question, asked one level up. Writing one
   * here would be an attribute nothing reads, which is the fault this round spent its morning on.
   */
  attributes: { ...extra },
  content: [paragraph([atSize(said, '20px')]), quiet(who)]
});

/** A division between two things, which is a block and not a border on one of them. */
const rule = (extra: Record<string, unknown> = {}): Node => ({
  stype: 'horizontalRule',
  attributes: extra,
  content: []
});

/** One person: a portrait with a name under it, which is a card without being one. */
const person = (name: string, role: string, art: string): Node =>
  stack('column', { name, gap: GAP.tight, sizing: 'fill' }, [
    picture(art, `${name} 사진`, { sizing: 'fill', cornerRadius: ROUND.box, fill: 'var:바탕' }),
    stack('column', { name: `${name} 이름`, gap: 0 }, [paragraph(name), quiet(role)])
  ]);

export function createSampleSite(): SchemaDefinition extends never ? never : Node {
  return {
    stype: 'document',
    attributes: {},
    content: [
      home(),
      products(),
      pricing(),
      about(),
      blog(),

      /**
       * The **data** the pages draw from.
       *
       * A resource, beside the footnote bodies and header definitions this schema already keeps
       * there: a thing referenced by name from the flow, saved and undone with the document, and not
       * laid out anywhere itself.
       */
      {
        stype: 'resources',
        attributes: {},
        content: [
          {
            stype: 'dataset',
            attributes: {
              name: '상품',
              label: '상품 목록',
              kind: 'inline',
              fields: ['이름', '설명', '가격', '순서', '분류'],
              records: [
                { 이름: '문서', 설명: '문단, 표, 각주까지.', 가격: '월 9,900원', 순서: 2, 분류: '제품' },
                { 이름: '덱', 설명: '슬라이드, 도형, 모션.', 가격: '월 12,900원', 순서: 3, 분류: '제품' },
                { 이름: '사이트', 설명: '쌓이는 섹션, 브라우저가 배치.', 가격: '월 7,900원', 순서: 1, 분류: '제품' },
                { 이름: '스위트', 설명: '셋 다, 한 계정으로.', 가격: '월 19,900원', 순서: 4, 분류: '묶음' }
              ]
            },
            content: []
          },
          {
            stype: 'dataset',
            attributes: {
              name: '글',
              label: '블로그 글',
              kind: 'inline',
              fields: ['제목', '요약', '날짜', '추천'],
              records: [
                { 제목: '한 문서 모델로 세 제품', 요약: '스키마가 먼저 있었다는 이야기.', 날짜: '2026-08-02', 추천: '예' },
                { 제목: '커서는 누구의 것인가', 요약: '입력 경로를 다시 그린 기록.', 날짜: '2026-07-19', 추천: '예' },
                { 제목: '측정하고 나서 만들기', 요약: '스크린샷 한 장이 찾아낸 것들.', 날짜: '2026-06-30', 추천: '아니오' }
              ]
            },
            content: []
          }
        ]
      },

      components(),

      /**
       * The site's **design tokens**.
       *
       * `variable` is the deck's node doing on a page the job it is most obviously for: a brand
       * colour written once and referred to as `var:강조` everywhere. Changing it changes the site,
       * and a file records the reference rather than what it meant on the day it was saved.
       *
       * The palette is ink, paper and one accent. The accent is a **deep green** because the blue
       * this sample used to be is the colour every developer tool reaches for first, and the greys
       * are mixed a few degrees toward it so they read as chosen rather than inherited.
       */
      {
        stype: 'variables',
        attributes: {},
        content: [
          { stype: 'variable', attributes: { name: '강조', label: '브랜드 색', kind: 'color', value: '#0F7A5A' } },
          { stype: 'variable', attributes: { name: '강조밝음', label: '브랜드 밝은 쪽', kind: 'color', value: '#34C08A' } },
          /*
           * The pressed-in green, which exists because **three** things wanted the same darker
           * brand colour under a pointer — the button, the ghost button and the navigation. A hover
           * colour written three times is three colours that drift, which is what a token is for.
           */
          { stype: 'variable', attributes: { name: '강조진함', label: '브랜드 눌린 쪽', kind: 'color', value: '#0B5C44' } },
          { stype: 'variable', attributes: { name: '바탕', label: '카드 바탕', kind: 'color', value: '#EEF1EE' } },
          { stype: 'variable', attributes: { name: '면', label: '카드 면', kind: 'color', value: '#FFFFFF' } },
          { stype: 'variable', attributes: { name: '종이', label: '페이지 바탕', kind: 'color', value: '#F6F7F5' } },
          { stype: 'variable', attributes: { name: '먹', label: '어두운 바탕', kind: 'color', value: '#0E1512' } },
          { stype: 'variable', attributes: { name: '선', label: '경계선', kind: 'color', value: '#DFE3DF' } },
          { stype: 'variable', attributes: { name: '보조', label: '한 번만 쓰는 색', kind: 'color', value: '#C9762A' } },
          { stype: 'variable', attributes: { name: '회사', label: '회사 이름', kind: 'text', value: 'Barocss' } }
        ]
      }
    ]
  } as Node;
}

/** Every page wears the same paper. */
const pageAttrs = (id: string, name: string, path: string) => ({
  kind: 'flow',
  id,
  name,
  path,
  fill: 'var:종이'
});

/** `/` — the one a visitor lands on. */
function home(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs('home', '홈', '/'),
    content: [
      placed('site-header'),

      /**
       * The hero: words on the left, the product on the right, and a grid faintly behind both.
       *
       * Asymmetric rather than centred, and 7 to 5 rather than half and half, because a centred hero
       * is what a page looks like when nobody decided. The picture holds a width of its own until
       * there is no room for it beside the words, and then the whole thing becomes a column.
       *
       * Two sentences under the claim rather than one — see `docs/specs/site-content.md`: the first
       * says what this is and the second says what it replaces, and a hero with only the first is
       * the shape a reader called thin.
       */
      stack(
        'column',
        {
          name: '히어로',
          alignItems: 'center',
          paddingTop: px(104),
          paddingBottom: px(112),
          paddingLeft: AIR.side,
          paddingRight: AIR.side,
          backgroundImage: gridTexture('#0E1512', 0.05),
          backgroundFit: 'tile',
          overrides: {
            tablet: { paddingTop: px(64), paddingBottom: px(72), paddingLeft: px(40), paddingRight: px(40) },
            mobile: { paddingTop: px(48), paddingBottom: px(56), paddingLeft: px(20), paddingRight: px(20) }
          }
        },
        [
          stack(
            'row',
            {
              name: '히어로 줄',
              gap: px(64),
              alignItems: 'center',
              maxWidth: WIDTH.page,
              overrides: { mobile: { layoutMode: 'column', gap: px(32) } }
            },
            [
              stack('column', { name: '히어로 글', gap: GAP.mid, sizing: 'fill', minWidth: px(360) }, [
                heading(1, '문서 한 벌로 세 가지를 만듭니다'),
                paragraph([
                  inColour(
                    '워드프로세서와 프레젠테이션과 웹사이트가 같은 스키마, 같은 렌더러 위에서 움직입니다. 표를 슬라이드에서 문서로 옮겨도 표인 채로 남고, 편집기에서 본 화면이 그대로 내보내집니다.',
                    '3A443E'
                  )
                ]),
                paragraph([
                  inColour('세 제품을 따로 사서 붙이던 자리를 대신합니다. ', '3A443E'),
                  inColour('이 페이지도 그중 하나로 만들었습니다.', '0F7A5A')
                ]),
                stack('row', { name: '히어로 버튼', gap: GAP.tight, sizing: 'hug', alignItems: 'center' }, [
                  placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' }),
                  placed('ghost', { 문구: '문서 읽기' }, { sizing: 'hug' })
                ])
              ]),
              picture(enginePicture(), '문서와 덱과 페이지가 한 화면에 놓인 그림', {
                sizing: 'fixed',
                minWidth: px(440),
                maxWidth: px(520),
                cornerRadius: ROUND.box,
                shadowColor: 'rgba(14, 21, 18, 0.16)',
                shadowBlur: px(48),
                shadowDistance: px(18),
                overrides: {
                  tablet: { minWidth: px(320), maxWidth: px(380) },
                  mobile: { sizing: 'fill', minWidth: 0 }
                }
              })
            ]
          )
        ]
      ),

      /*
       * Who uses it, directly under the hero rather than inside it — the hero is for the claim and
       * the one thing to press. Marks and nothing else: a category label under a logo tells a reader
       * what they can already see.
       */
      section(
        '쓰는 곳',
        {
          paddingTop: 0,
          paddingBottom: px(28),
          overrides: {
            tablet: { paddingTop: 0, paddingBottom: px(20), paddingLeft: px(40), paddingRight: px(40) },
            mobile: { paddingTop: 0, paddingBottom: px(16), paddingLeft: px(20), paddingRight: px(20) }
          }
        },
        [
          stack(
            'row',
            {
              name: '로고 줄',
              justifyContent: 'between',
              alignItems: 'center',
              gap: GAP.mid,
              overrides: { mobile: { layoutMode: 'grid', columns: 2, gap: GAP.mid } }
            },
            [
              picture(monogram('한결제작소', '#0E1512'), '한결제작소', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('여름출판', '#0E1512'), '여름출판', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('삼각연구소', '#0E1512'), '삼각연구소', { sizing: 'hug', fit: 'contain', maxWidth: px(150) }),
              picture(monogram('물결', '#0E1512'), '물결', { sizing: 'hug', fit: 'contain', maxWidth: px(150) })
            ]
          )
        ],
        { gap: GAP.mid }
      ),

      /**
       * The turn: the sentence that makes the rest worth reading.
       *
       * One paragraph on its own measure, before any feature is named. A page that goes from the
       * claim straight to a row of cards is a page that never said why the cards matter.
       */
      section('문제', { paddingBottom: px(48) }, [
        stack('column', { name: '문제 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(2, '같은 표를 세 번 만들고 계신가요'),
          quiet(
            '문서에서 만든 표를 슬라이드에 붙이면 그림이 되고, 그 슬라이드를 웹에 올리면 다시 이미지가 됩니다. 도구가 셋이면 서식도 셋이고, 고칠 곳도 셋입니다.'
          ),
          quiet(
            '한 모델 위에 올리면 그 셋이 한 번이 됩니다. 표는 어디로 가도 표이고, 브랜드 색을 바꾸면 세 제품이 함께 바뀝니다.'
          )
        ])
      ]),

      /**
       * The trio, and it is deliberately **not** three of the same width.
       *
       * Three identical cards side by side is the layout a page falls into when the content was not
       * ranked. The first one is the product this page is about and is wider; the other two are the
       * pair it is usually bought with. Each card is a noun and two sentences — the length the
       * content model says a capability takes.
       */
      section('카드 줄', {}, [
        stack('column', { name: '카드 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '세 제품, 한 문서'),
          quiet('무엇을 만들든 문단은 문단이고 표는 표입니다. 제품이 다른 것은 그것을 어떻게 배치하느냐뿐입니다.')
        ]),
        stack(
          'row',
          {
            name: '제품 셋',
            gap: GAP.mid,
            alignItems: 'stretch',
            overrides: {
              tablet: { gap: px(16) },
              mobile: { layoutMode: 'column', gap: px(16) }
            }
          },
          [
            card(
              '사이트',
              '섹션을 쌓으면 브라우저가 배치합니다. 폭마다 다른 것만 적어두면 한 문서가 세 화면이 됩니다. 이 페이지가 그 결과입니다.',
              { minWidth: px(380), overrides: { mobile: { minWidth: 0 } } }
            ),
            card('문서', '문단, 표, 각주, 목차. 페이지로 나누고 머리말을 반복하는 일은 워드가 맡습니다.'),
            card('덱', '슬라이드 위 좌표에 도형을 놓고, 순서대로 등장시킵니다. 발표자 화면과 노트가 함께 옵니다.')
          ]
        )
      ]),

      /*
       * The product list: **one** placement in the document, three cards on the screen.
       *
       * `sortBy: '순서'` is why the rows are not in the order they are written — the point of data
       * rather than typing — and `where`/`equals` keeps the bundle off the front page.
       */
      section('요금 미리보기', {}, [
        stack('column', { name: '요금 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '값은 쓰는 만큼'),
          quiet('제품 하나만 쓰거나, 셋을 한 계정으로 씁니다. 사람 수가 아니라 계정 수로 셉니다.')
        ]),
        {
          stype: 'collection',
          attributes: {
            name: '상품 목록',
            source: '상품',
            sortBy: '순서',
            where: '분류',
            equals: '제품',
            layoutMode: 'row',
            gap: GAP.mid,
            sizing: 'fill',
            alignItems: 'stretch',
            overrides: { mobile: { layoutMode: 'column', gap: px(16) } }
          },
          content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
        }
      ]),

      /**
       * One engine, said as a sentence and then as three numbers.
       *
       * The layout family here is used once on the site: a wide statement with the numbers spread
       * under it by `justifyContent`. Repeating a family is what makes a page read as a template.
       */
      section('한 엔진', { fill: 'var:바탕' }, [
        stack('column', { name: '한 엔진 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(2, '엔진이 하나라서 생기는 일'),
          quiet(
            '스키마가 한 벌이면 덱에서 붙여 넣은 표가 문서에서도 표입니다. 렌더러가 한 벌이면 편집기가 그린 것과 내보낸 파일이 같습니다.'
          ),
          quiet('그래서 새 제품이 하나 늘어도 배워야 할 문서 모델은 그대로입니다.')
        ]),
        stack(
          'row',
          {
            name: '숫자',
            justifyContent: 'between',
            gap: GAP.wide,
            paddingTop: px(12),
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            stack('column', { name: '숫자 하나', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('107', '44px', '0F7A5A')]),
              paragraph('문서 모델이 아는 노드 종류'),
              quiet('문단부터 각주, 도형, 표까지 한 스키마 안에 있습니다.')
            ]),
            stack('column', { name: '숫자 둘', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('24', '44px', '0F7A5A')]),
              paragraph('글자에 붙는 서식'),
              quiet('굵기와 색부터 각주 표시, 언어 표시까지 같은 방식으로 붙습니다.')
            ]),
            stack('column', { name: '숫자 셋', gap: GAP.hair, sizing: 'fill' }, [
              paragraph([atSize('1', '44px', '0F7A5A')]),
              paragraph('편집기와 내보내기가 함께 쓰는 렌더러'),
              quiet('화면과 파일이 다를 수 있는 자리가 아예 없습니다.')
            ])
          ]
        )
      ]),

      /**
       * How it works: three verbs.
       *
       * Not `1단계 / 2단계 / 3단계` — the step's own word is the label, and a number in front of it
       * is a number a reader has to read before the word.
       */
      section('시작하는 법', {}, [
        stack('column', { name: '순서 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '오늘 안에 첫 페이지'),
          quiet('설치할 것도, 옮겨올 것도 없습니다. 계정을 만들면 빈 문서 하나가 열립니다.')
        ]),
        stack(
          'grid',
          {
            name: '순서 셋',
            columns: 3,
            gap: GAP.wide,
            overrides: { tablet: { columns: 3, gap: px(24) }, mobile: { columns: 1, gap: px(20) } }
          },
          [
            stack('column', { name: '쌓기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '쌓기'),
              quiet('섹션을 세로로 쌓고 그 안에 글과 그림을 넣습니다. 폭은 브라우저가 정합니다.')
            ]),
            stack('column', { name: '묶기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '묶기'),
              quiet('반복되는 카드는 컴포넌트로 묶습니다. 한 곳을 고치면 놓인 자리가 모두 바뀝니다.')
            ]),
            stack('column', { name: '내보내기', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '내보내기'),
              quiet('페이지마다 HTML 한 벌. 좁은 폭 규칙까지 함께 나옵니다.')
            ])
          ]
        )
      ]),

      /* One quote, two lines, with a name and a role under it. */
      section('한마디', { paddingTop: px(64) }, [
        stack(
          'column',
          {
            name: '인용',
            gap: GAP.mid,
            maxWidth: WIDTH.text,
            padding: px(32),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1)
          },
          [
            quoteOf(
              '“편집기에서 본 것과 내보낸 파일이 같습니다. 검수에 쓰던 시간이 절반으로 줄었어요.”',
              '임세라 · 한결제작소 편집팀'
            )
          ]
        )
      ]),

      /**
       * The questions a reader leaves over, answered where they would leave.
       *
       * Two levels of stack rather than a list: a question and its answer are a tight pair, and the
       * pairs are far apart. One list with one gap cannot say that, which is what the content model
       * means by "a column with a small gap inside a larger one".
       */
      section('묻는 것들', { paddingTop: px(64) }, [
        stack('column', { name: '질문 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [heading(2, '자주 묻는 것')]),
        stack(
          'grid',
          {
            name: '질문 넷',
            columns: 2,
            gap: px(32),
            overrides: { mobile: { columns: 1, gap: px(24) } }
          },
          [
            ask('쓰던 문서를 가져올 수 있나요', '워드 파일을 열면 문단과 표와 각주가 그대로 들어옵니다. 그림은 도형으로 들어와서 계속 편집할 수 있습니다.'),
            ask('내보낸 페이지는 어디에 올리나요', '정적 파일이라 아무 데나 올라갑니다. 서버도, 이 회사의 계정도 필요 없습니다.'),
            ask('팀으로 쓰면 어떻게 되나요', '계정을 나눠 쓰고 문서는 링크로 공유합니다. 동시에 편집하는 기능은 아직 없습니다.'),
            ask('그만두면 문서는요', '전부 내려받을 수 있습니다. 문서 형식이 공개되어 있어 다른 도구에서도 읽힙니다.')
          ]
        )
      ]),

      /**
       * The closing band, and the **one** place on the page where the theme flips.
       *
       * A page that alternates light and dark down its length reads as several pages stapled
       * together. One switch, at the end, running into the footer, is a decision a reader can see.
       */
      section(
        '마무리',
        {
          fill: 'var:먹',
          gradientFrom: '#0E1512',
          gradientTo: '#0B3D31',
          gradientAngle: 160,
          paddingTop: px(96),
          paddingBottom: px(96)
        },
        [
          stack('column', { name: '마무리 글', gap: GAP.mid, alignItems: 'center', maxWidth: WIDTH.text }, [
            heading(2, '문서 하나로 시작해 보세요'),
            paragraph([
              inColour('계정을 만들면 세 제품이 함께 열립니다. 카드 정보는 나중에 물어봅니다.', 'C8D3CD')
            ]),
            placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' })
          ])
        ],
        { alignItems: 'center' }
      ),

      placed('site-footer')
    ]
  };
}

/** A question and its answer: a tight pair, drawn as one block. */
const ask = (question: string, answer: string): Node =>
  stack('column', { name: question, gap: GAP.hair, sizing: 'fill' }, [heading(3, question), quiet(answer)]);

/** `/제품` — a **grid**, the third arrangement and the one nothing else on the site uses. */
function products(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs('products', '제품', '/제품'),
    content: [
      placed('site-header'),
      section('제품 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '제품 머리 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(1, '세 제품, 한 스키마'),
          quiet(
            '무엇을 만들든 문서는 같은 규칙을 따릅니다. 아래는 그 규칙이 실제로 무엇이고, 그것이 만드는 사람에게 무엇을 덜어주는지입니다.'
          )
        ])
      ]),
      /*
       * The order a reader does things in — a **numbered** list, which is the one case where the
       * marker carries information rather than decorating it: swap two of these and the sentence is
       * wrong, which is not true of the bullets on 소개.
       */
      section('시작하는 순서', { paddingTop: 0, paddingBottom: px(40) }, [
        stack('column', { name: '순서 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(2, '시작하는 순서'),
          listOf('ordered', [
            '문서를 하나 만듭니다. 워드로 시작하든 사이트로 시작하든 같은 문서입니다.',
            '브랜드 색과 글꼴을 한 번 적습니다. 세 제품이 그것을 씁니다.',
            '만든 것을 내보냅니다. 편집기에서 본 것이 그대로 나옵니다.'
          ])
        ])
      ]),
      section('기능 그리드', { paddingTop: 0 }, [
        stack(
          'grid',
          {
            name: '기능 여섯',
            columns: 3,
            gap: GAP.mid,
            // Two columns on a tablet, one on a phone: the reason a grid states its columns at all.
            overrides: { tablet: { columns: 2 }, mobile: { columns: 1 } }
          },
          [
            card('스키마', '문서가 무엇으로 이루어지는지 한 곳에서 말합니다. 노드 하나를 더하면 세 제품이 함께 알게 됩니다.'),
            card('명령', '읽을 수 있는 하나의 이름, 하나의 되돌리기. 마흔 칸을 한 번에 바꿔도 Ctrl+Z 한 번입니다.'),
            card('렌더러', '노드 하나가 그림 하나가 됩니다. 편집기와 내보내기가 같은 함수를 씁니다.'),
            card('선택', '선택은 집합입니다. 카드 셋을 함께 옮기고, 함께 채우고, 함께 지웁니다.'),
            card('반응형', '좁은 폭은 다른 것만 적습니다. 넓은 폭을 고치면 좁은 폭도 따라옵니다.'),
            card('데이터', '디자인 하나에 행 마흔 개. 표를 고치면 카드 마흔 장이 함께 바뀝니다.')
          ]
        )
      ]),
      /*
       * A comparison that is not a table with a hairline under every row: three columns of two
       * sentences each, which is the same information a reader can actually read.
       */
      section('무엇이 다른가', { fill: 'var:바탕' }, [
        stack('column', { name: '비교 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '무엇이 다르고, 무엇이 같은가'),
          quiet('셋은 배치만 다릅니다. 문단과 표와 도형은 세 곳에서 같은 것을 뜻합니다.')
        ]),
        stack(
          'row',
          {
            name: '비교 셋',
            gap: GAP.wide,
            alignItems: 'start',
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            stack('column', { name: '비교 문서', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '문서는 페이지로 나뉩니다'),
              quiet('A4 위에서 줄이 넘치면 다음 장으로 갑니다. 머리말과 쪽 번호가 따라 붙습니다.')
            ]),
            stack('column', { name: '비교 덱', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '덱은 좌표에 놓습니다'),
              quiet('슬라이드 위 정해진 자리에 도형이 놓이고, 등장 순서가 시간 위에 그려집니다.')
            ]),
            stack('column', { name: '비교 사이트', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '사이트는 폭이 정합니다'),
              quiet('섹션이 세로로 쌓이고, 남은 배치는 브라우저가 합니다. 좁아지면 규칙만 바뀝니다.')
            ])
          ]
        )
      ]),
      section('제품 마무리', { paddingTop: px(64) }, [
        stack(
          'row',
          {
            name: '제품 마무리 줄',
            justifyContent: 'between',
            alignItems: 'center',
            gap: GAP.wide,
            padding: px(28),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            stack('column', { name: '제품 마무리 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '어느 것부터 열어도 됩니다'),
              quiet('한 계정으로 셋이 함께 열립니다. 쓰지 않는 제품은 값을 내지 않습니다.')
            ]),
            placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' })
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** `/가격` — a highlighted plan and a fixed sidebar, which nothing else on the site is. */
function pricing(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs('pricing', '가격', '/가격'),
    content: [
      placed('site-header'),
      section('가격 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '가격 머리 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(1, '가격'),
          quiet('쓰는 만큼 냅니다. 언제든 그만둘 수 있고, 남은 기간은 돌려드립니다. 카드 정보는 무료로 쓰는 동안 묻지 않습니다.')
        ])
      ]),

      /**
       * The recommended plan, ahead of the list rather than taller than it.
       *
       * A pricing page is three towers with one of them stretched, in every product that has one.
       * This says the same thing with colour and position instead: the plan being recommended is
       * *out of the row*, above it, and it is the only place on the site that uses the second
       * accent — which is what "one accent" means in practice.
       */
      section('추천 요금제', { paddingTop: 0, paddingBottom: px(28) }, [
        stack(
          'row',
          {
            name: '추천',
            gap: GAP.wide,
            alignItems: 'center',
            padding: px(28),
            fill: 'var:면',
            stroke: 'var:보조',
            strokeWidth: px(2),
            // The one four-cornered box on the site: square where it meets the row under it.
            cornerTopLeft: ROUND.box,
            cornerTopRight: ROUND.box,
            cornerBottomRight: px(4),
            cornerBottomLeft: px(4),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            stack('column', { name: '추천 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '스위트'),
              quiet('문서, 덱, 사이트를 한 계정으로. 두 제품 이상 쓰는 팀이면 이쪽이 쌉니다.')
            ]),
            paragraph([atSize('월 19,900원', '22px', '0E1512')]),
            placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' })
          ]
        )
      ]),

      section('요금제', { paddingTop: 0 }, [
        {
          stype: 'collection',
          attributes: {
            name: '요금제',
            source: '상품',
            sortBy: '가격',
            sortDir: 'desc',
            limit: 3,
            layoutMode: 'row',
            gap: GAP.mid,
            alignItems: 'stretch',
            sizing: 'fill',
            overrides: { mobile: { layoutMode: 'column', gap: px(16) } }
          },
          content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
        }
      ]),

      /* What every plan has, so a reader is not comparing absences. */
      section('모두 포함', { paddingTop: px(56) }, [
        stack('column', { name: '포함 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '어느 요금제든 이건 됩니다'),
          quiet('가격에 따라 달라지는 것은 쓸 수 있는 제품 수뿐입니다.')
        ]),
        stack(
          'grid',
          {
            name: '포함 넷',
            columns: 4,
            gap: GAP.mid,
            overrides: { tablet: { columns: 2 }, mobile: { columns: 1, gap: px(16) } }
          },
          [
            ask('파일 내보내기', '문서, 슬라이드, HTML을 언제든 내려받습니다.'),
            ask('버전 기록', '되돌리기는 문서를 닫아도 남습니다.'),
            ask('글꼴과 색', '브랜드 값을 한 번 적으면 세 제품이 씁니다.'),
            ask('지원', '평일에 묻고 하루 안에 답을 받습니다.')
          ]
        )
      ]),

      section('문의', { fill: 'var:바탕' }, [
        stack(
          'row',
          {
            name: '문의',
            gap: GAP.wide,
            alignItems: 'end',
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(20) } }
          },
          [
            stack('column', { name: '문의 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '더 큰 팀이신가요'),
              quiet('좌석, 청구, 배포를 함께 이야기합니다. 보통 하루 안에 답합니다.')
            ]),
            // A fixed sidebar: the one place on the site that states a width in twips.
            stack(
              'column',
              { name: '문의 상자', gap: GAP.tight, sizing: 'fixed', minWidth: WIDTH.aside, maxWidth: WIDTH.aside },
              [placed('cta', { 문구: '영업팀에 연락' }, { sizing: 'fill' })]
            )
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** `/소개` — portraits, a list, and words that are not in a card. */
function about(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs('about', '소개', '/소개'),
    content: [
      placed('site-header'),
      section('소개 머리', { paddingBottom: px(40) }, [
        stack('column', { name: '소개 머리 글', gap: GAP.mid, maxWidth: WIDTH.text }, [
          heading(1, '문서 모델을 만듭니다'),
          quiet(
            '제품 세 개를 만들면서 같은 것을 세 번 만들지 않으려고 했습니다. 그래서 화면보다 스키마가 먼저였고, 기능보다 측정이 먼저였습니다.'
          ),
          quiet(
            '지금은 워드프로세서와 프레젠테이션과 사이트 빌더가 한 저장소 안에서 같은 노드를 씁니다. 새 제품을 만들 때 다시 만드는 것은 배치뿐입니다.'
          ),
          listOf('bullet', [
            '스키마가 먼저입니다. 문서가 무엇인지 정하지 않고 화면부터 그리면 세 번 만들게 됩니다.',
            '측정하고 나서 만듭니다. 없는 기능보다 있는데 아무도 못 쓰는 기능이 더 많았습니다.',
            '놀란 것은 적어둡니다. 다음 사람이 같은 자리에서 다시 놀라지 않도록.'
          ])
        ])
      ]),
      section('사람들', { paddingTop: 0 }, [
        stack('column', { name: '사람들 머리', gap: GAP.hair, maxWidth: WIDTH.text }, [
          heading(2, '만드는 사람들'),
          quiet('셋이서 만들고 있습니다. 각자 맡은 곳이 있지만 문서 모델은 함께 정합니다.')
        ]),
        stack(
          'row',
          {
            name: '사람 줄',
            gap: GAP.mid,
            alignItems: 'start',
            overrides: { mobile: { layoutMode: 'column', gap: px(20) } }
          },
          [
            person('박진호', '문서 모델과 스키마', portrait('#0E1512', '#0F7A5A')),
            person('임세라', '렌더러와 내보내기', portrait('#12201B', '#34C08A')),
            person('구현우', '편집 경험과 입력', portrait('#1A2C25', '#0F7A5A'))
          ]
        )
      ]),
      section('연락', { fill: 'var:바탕', paddingTop: px(64) }, [
        stack(
          'row',
          {
            name: '연락 줄',
            justifyContent: 'between',
            alignItems: 'center',
            gap: GAP.wide,
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            stack('column', { name: '연락 글', gap: GAP.hair, sizing: 'fill' }, [
              heading(3, '무엇이든 물어보세요'),
              quiet('문서 모델에 대한 질문이든, 안 되는 것에 대한 제보든 같은 곳으로 옵니다.')
            ]),
            placed('ghost', { 문구: 'hello@barocss.com' }, { sizing: 'hug' })
          ]
        )
      ]),
      placed('site-footer')
    ]
  };
}

/** `/블로그` — a featured post, then the rest, newest first. */
function blog(): Node {
  return {
    stype: 'surface',
    attributes: pageAttrs('blog', '블로그', '/블로그'),
    content: [
      placed('site-header'),
      section('블로그 머리', { paddingBottom: px(28) }, [
        stack('column', { name: '블로그 머리 글', gap: GAP.tight, maxWidth: WIDTH.text }, [
          heading(1, '무엇을 고쳤는지'),
          quiet('측정한 것과, 측정하고 나서 놀란 것을 적습니다. 대부분은 기능을 더한 이야기가 아니라 이미 있던 것을 읽은 이야기입니다.')
        ])
      ]),
      section('머리글', { paddingTop: 0, paddingBottom: px(28) }, [
        stack(
          'row',
          {
            name: '머리글 카드',
            gap: GAP.wide,
            alignItems: 'center',
            padding: px(24),
            fill: 'var:면',
            cornerRadius: ROUND.box,
            stroke: 'var:선',
            strokeWidth: px(1),
            shadowColor: 'rgba(14, 21, 18, 0.07)',
            shadowBlur: px(24),
            shadowDistance: px(6),
            overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(16) } }
          },
          [
            picture(postCover('#0F7A5A', '#0B3D31', 150), '한 문서 모델로 세 제품', {
              sizing: 'fixed',
              minWidth: px(260),
              maxWidth: px(300),
              cornerRadius: px(12),
              overrides: { mobile: { sizing: 'fill', minWidth: 0 } }
            }),
            stack('column', { name: '머리글 글', gap: GAP.tight, sizing: 'fill' }, [
              quiet('2026-08-02'),
              heading(2, '한 문서 모델로 세 제품'),
              quiet(
                '스키마가 먼저 있었다는 이야기. 워드에서 시작한 노드가 덱과 사이트로 흘러간 경로를 따라가고, 그 과정에서 무엇을 세 번 만들지 않아도 되었는지 셉니다.'
              )
            ])
          ]
        )
      ]),
      section('글 목록', { paddingTop: 0 }, [
        /*
         * A rule between the featured post and the rest, which is the one place on this site where a
         * division is the content rather than the frame's border: the two things are the same kind of
         * thing and the line says *and then the others*.
         */
        rule(),
        {
          stype: 'collection',
          attributes: {
            name: '글 목록',
            source: '글',
            sortBy: '날짜',
            sortDir: 'desc',
            layoutMode: 'column',
            gap: 0,
            sizing: 'fill'
          },
          content: [placed('post-row', { 제목: 'field:제목', 요약: 'field:요약', 날짜: 'field:날짜' })]
        }
      ]),
      placed('site-footer')
    ]
  };
}

/** The definitions every page places. */
function components(): Node {
  return {
    stype: 'components',
    attributes: {},
    content: [
      {
        stype: 'component',
        attributes: { id: 'site-header', name: '머리말' },
        content: [
          /**
           * The bar: the mark at one end, the links and the button at the other.
           *
           * The row every site on the web has, and the one this model could not say until
           * `justifyContent` existed — the workaround was a spacer stack that fills, which is a node
           * a reader has to know to make and has to keep the right way round.
           */
          stack(
            'row',
            {
              partId: 'bar',
              justifyContent: 'between',
              alignItems: 'center',
              gap: GAP.mid,
              paddingTop: px(16),
              paddingBottom: px(16),
              paddingLeft: AIR.side,
              paddingRight: AIR.side,
              fill: 'var:종이',
              stroke: 'var:선',
              strokeWidth: px(1),
              overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
            },
            [
              stack('row', { partId: 'mark', gap: GAP.hair, alignItems: 'center', sizing: 'hug' }, [
                picture(wordmark(), 'Barocss', {
                  sizing: 'fixed',
                  minWidth: px(24),
                  maxWidth: px(24),
                  fit: 'contain'
                }),
                heading(4, 'Barocss', { partId: 'wordmark' })
              ]),
              /*
               * The navigation, and until the link mark drew an `<a>` it was **four words that
               * looked like links** — the sample had five pages with addresses and not one anchor in
               * it. Each run names a page rather than an address, so `/제품` becoming `/products`
               * moves all four.
               */
              stack('row', { partId: 'nav', name: '내비게이션', gap: GAP.hair, alignItems: 'center', sizing: 'hug' }, [
                navItem('제품', 'products'),
                navItem('가격', 'pricing'),
                navItem('소개', 'about'),
                navItem('블로그', 'blog'),
                placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' })
              ])
            ]
          )
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'site-footer', name: '꼬리말' },
        content: [
          stack(
            'column',
            {
              gap: GAP.mid,
              paddingTop: px(48),
              paddingBottom: px(40),
              paddingLeft: AIR.side,
              paddingRight: AIR.side,
              fill: 'var:먹',
              partId: 'foot',
              overrides: { mobile: { paddingLeft: px(20), paddingRight: px(20) } }
            },
            [
              stack(
                'row',
                {
                  partId: 'foot-row',
                  justifyContent: 'between',
                  alignItems: 'center',
                  gap: GAP.mid,
                  overrides: { mobile: { layoutMode: 'column', alignItems: 'start', gap: px(12) } }
                },
                [
                  {
                    stype: 'paragraph',
                    attributes: { partId: 'note' },
                    content: [inColour('© 2026 Barocss', 'C8D3CD')]
                  },
                  stack('row', { partId: 'foot-links', gap: GAP.mid, sizing: 'hug' }, [
                    paragraph([toPage('제품', 'products', '8FA39A')]),
                    paragraph([toPage('가격', 'pricing', '8FA39A')]),
                    paragraph([toPage('소개', 'about', '8FA39A')])
                  ])
                ]
              ),
              {
                stype: 'paragraph',
                attributes: { partId: 'legal' },
                content: [inColour('서울특별시 · 사업자등록번호 000-00-00000 · 개인정보처리방침', '5C6660')]
              }
            ]
          )
        ]
      },
      /**
       * A **button**, as a component with one question.
       *
       * There is no button node and there does not need to be: a button is a stack with a colour, a
       * padding and words in it, and the one thing that differs between two of them is what it says.
       * Which is exactly what a component variable is for.
       */
      {
        stype: 'component',
        attributes: { id: 'cta', name: '버튼' },
        content: [
          { stype: 'componentVar', attributes: { name: '문구', kind: 'text', value: '시작하기' } },
          { stype: 'componentBind', attributes: { part: 'cta-label', attr: 'text', var: '문구' } },
          stack(
            'row',
            {
              partId: 'cta-box',
              gap: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: px(10),
              paddingBottom: px(10),
              paddingLeft: px(18),
              paddingRight: px(18),
              fill: 'var:강조',
              cornerRadius: ROUND.pill,
              sizing: 'hug',
              /*
               * A button that does not answer the pointer is a picture of a button. And a keyboard
               * ring beside it, because the visitor who most needs to know what is focused is the one
               * who cannot see where their mouse is — `:focus-visible`, so a click never flashes it.
               */
              states: {
                hover: { fill: 'var:강조진함' },
                focus: { stroke: 'var:강조진함', shadowColor: 'rgba(15, 122, 90, 0.35)', shadowBlur: px(8) }
              }
            },
            [
              {
                stype: 'paragraph',
                attributes: { partId: 'cta-label' },
                content: [inColour('시작하기', 'FFFFFF')]
              }
            ]
          )
        ]
      },
      /** The same button with the colour taken out, for the second thing a reader can do. */
      {
        stype: 'component',
        attributes: { id: 'ghost', name: '보조 버튼' },
        content: [
          { stype: 'componentVar', attributes: { name: '문구', kind: 'text', value: '더 보기' } },
          { stype: 'componentBind', attributes: { part: 'ghost-label', attr: 'text', var: '문구' } },
          stack(
            'row',
            {
              partId: 'ghost-box',
              gap: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: px(10),
              paddingBottom: px(10),
              paddingLeft: px(18),
              paddingRight: px(18),
              stroke: 'var:선',
              strokeWidth: px(1),
              cornerRadius: ROUND.pill,
              sizing: 'hug',
              // The border is already the width it will be; only its colour changes, so nothing moves.
              states: { hover: { stroke: 'var:먹', fill: 'var:바탕' } }
            },
            [
              {
                stype: 'paragraph',
                attributes: { partId: 'ghost-label' },
                content: [inColour('더 보기', '0E1512')]
              }
            ]
          )
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'product-card', name: '상품 카드' },
        content: [
          { stype: 'componentVar', attributes: { name: '이름', kind: 'text', value: '상품' } },
          { stype: 'componentVar', attributes: { name: '설명', kind: 'text', value: '설명' } },
          { stype: 'componentVar', attributes: { name: '가격', kind: 'text', value: '0원' } },
          { stype: 'componentBind', attributes: { part: 'p-name', attr: 'text', var: '이름' } },
          { stype: 'componentBind', attributes: { part: 'p-body', attr: 'text', var: '설명' } },
          { stype: 'componentBind', attributes: { part: 'p-price', attr: 'text', var: '가격' } },
          stack(
            'column',
            {
              gap: GAP.tight,
              padding: px(28),
              fill: 'var:면',
              partId: 'p-card',
              sizing: 'fill',
              cornerRadius: ROUND.box,
              stroke: 'var:선',
              strokeWidth: px(1),
              shadowColor: 'rgba(14, 21, 18, 0.07)',
              shadowBlur: px(24),
              shadowDistance: px(6)
            },
            [
              heading(3, '상품', { partId: 'p-name' }),
              paragraph([inColour('설명', '5C6660')], { partId: 'p-body' }),
              paragraph([inColour('0원', '0F7A5A')], { partId: 'p-price' })
            ]
          )
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'post-row', name: '글 줄' },
        content: [
          { stype: 'componentVar', attributes: { name: '제목', kind: 'text', value: '제목' } },
          { stype: 'componentVar', attributes: { name: '요약', kind: 'text', value: '요약' } },
          { stype: 'componentVar', attributes: { name: '날짜', kind: 'text', value: '' } },
          { stype: 'componentBind', attributes: { part: 'b-title', attr: 'text', var: '제목' } },
          { stype: 'componentBind', attributes: { part: 'b-body', attr: 'text', var: '요약' } },
          { stype: 'componentBind', attributes: { part: 'b-date', attr: 'text', var: '날짜' } },
          /*
           * A row of a list rather than a card: the date holds a fixed column so the titles line up,
           * which is the whole reason a list of posts is not a stack of cards.
           *
           * **No rule between the rows**, and that is a gap rather than a decision: a page's frame
           * has one `stroke` for all four sides, so a hairline between rows would be ten boxes down
           * the page. Word's blocks have `borderTop`…`borderLeft`; a page has not, and it is on the
           * record in `BACKLOG.md`.
           */
          stack(
            'row',
            {
              gap: GAP.wide,
              paddingTop: px(20),
              paddingBottom: px(20),
              alignItems: 'start',
              partId: 'b-row',
              sizing: 'fill',
              overrides: { mobile: { layoutMode: 'column', gap: px(6) } }
            },
            [
              stack('column', { gap: 0, sizing: 'fixed', minWidth: px(120), partId: 'b-when' }, [
                paragraph([inColour('', '5C6660')], { partId: 'b-date' })
              ]),
              stack('column', { gap: GAP.hair, sizing: 'fill', partId: 'b-what' }, [
                heading(3, '제목', { partId: 'b-title' }),
                paragraph([inColour('요약', '5C6660')], { partId: 'b-body' })
              ])
            ]
          )
        ]
      }
    ]
  };
}
