/**
 * A site to open the product with.
 *
 * Two pages, because one page cannot show what a *site* is: an address, a link between them, and a
 * header that is the same thing on both — which is a `component` placed twice, the deck's own
 * mechanism doing a job nobody wrote it for.
 *
 * Every node here is the office schema's. Read it as the argument: a landing page is a column of
 * stacks holding headings, paragraphs and pictures, and there is not one node type in it that a
 * word processor and a deck did not already have.
 */
import type { SchemaDefinition } from '@barocss/schema';

type Node = Record<string, unknown>;

const text = (value: string): Node => ({ stype: 'inline-text', text: value });

const heading = (level: number, value: string, extra: Record<string, unknown> = {}): Node => ({
  stype: 'heading',
  attributes: { level, ...extra },
  content: [text(value)]
});

const paragraph = (value: string, extra: Record<string, unknown> = {}): Node => ({
  stype: 'paragraph',
  attributes: extra,
  content: [text(value)]
});

/** A stack: the one container this product builds everything out of. */
const stack = (
  layoutMode: 'row' | 'column' | 'grid',
  attributes: Record<string, unknown>,
  content: Node[]
): Node => ({
  stype: 'frame',
  attributes: { layoutMode, sizing: 'fill', ...attributes },
  content
});

/** A card: a column that hugs nothing and fills its share of the row. */
const card = (title: string, body: string): Node =>
  stack('column', { gap: 120, padding: 360, fill: '#f8fafc', sizing: 'fill' }, [
    heading(3, title),
    paragraph(body)
  ]);

/**
 * The site, as a document.
 *
 * `path` is what makes a page a page of a site — two pages may be called the same thing and only
 * one of them can answer on `/`.
 */
export function createSampleSite(): SchemaDefinition extends never ? never : Node {
  return {
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'surface',
        attributes: { kind: 'flow', id: 'home', name: '홈', path: '/' },
        content: [
          { stype: 'instance', attributes: { componentId: 'site-header', sizing: 'fill' }, content: [] },

          // The hero: a column that fills the page and breathes.
          stack('column', { gap: 240, padding: 720 }, [
            heading(1, '한 엔진, 여러 제품'),
            paragraph(
              '워드프로세서와 프레젠테이션이 같은 문서 모델을 씁니다. 이 페이지도 같은 모델입니다.'
            )
          ]),

          /*
           * Three cards side by side — the row every landing page has, and the one block on this
           * page that cannot stay as it is on a phone.
           *
           * `overrides` is the whole responsive story in one attribute: at 390 this row is a column
           * with less padding, and everything else about it — the gap, the cards, the words in them
           * — is still what the page says. Not a second copy of the row, which is what makes editing
           * three widths at once mean anything.
           */
          stack(
            'row',
            {
              gap: 240,
              padding: 720,
              overrides: { mobile: { layoutMode: 'column', padding: 360 } }
            },
            [
              card('문서', '문단, 표, 각주. 페이지로 나뉘는 것은 워드의 몫입니다.'),
              card('덱', '슬라이드, 도형, 모션. 좌표 위에 놓는 것은 덱의 몫입니다.'),
              card('사이트', '쌓이는 섹션. 배치는 브라우저가 합니다.')
            ]
          ),

          /*
           * The product list: **one** placement in the document, three cards on the screen.
           *
           * `sortBy: '순서'` is why the rows are not in the order they are written, which is the
           * point of data rather than typing — and `overrides` stacks the grid on a phone, because a
           * collection is a stack and says what every other stack says.
           */
          {
            stype: 'collection',
            attributes: {
              source: '상품',
              sortBy: '순서',
              layoutMode: 'row',
              gap: 240,
              padding: 720,
              sizing: 'fill',
              overrides: { mobile: { layoutMode: 'column', padding: 360 } }
            },
            content: [
              {
                stype: 'instance',
                attributes: { componentId: 'product-card', sizing: 'fill' },
                content: [
                  { stype: 'componentValue', attributes: { name: '이름', value: 'field:이름' } },
                  { stype: 'componentValue', attributes: { name: '설명', value: 'field:설명' } },
                  { stype: 'componentValue', attributes: { name: '가격', value: 'field:가격' } }
                ]
              }
            ]
          },

          /*
           * The footer, and a mark rather than an attribute for the colour of the words — which is
           * how every product in this repository colours text, because a colour that is part of a
           * *run* survives being split, merged, copied and pasted, and one on the paragraph does
           * not. Written here because a dark stack with the default ink drew black on navy, which
           * is a thing no test looked at and one glance at the page found.
           */
          stack('column', { gap: 120, padding: 480, fill: '#0f172a' }, [
            {
              stype: 'paragraph',
              attributes: {},
              content: [
                {
                  stype: 'inline-text',
                  text: '© 2026 Barocss',
                  /* `stype` and a `range`, which is how a mark is written everywhere in this
                     repository: a mark covers a span of the run rather than the whole of it. */
                  marks: [{ stype: 'fontColor', range: [0, 14], attrs: { color: 'E2E8F0' } }]
                }
              ]
            }
          ])
        ]
      },

      {
        stype: 'surface',
        attributes: { kind: 'flow', id: 'about', name: '소개', path: '/about' },
        content: [
          { stype: 'instance', attributes: { componentId: 'site-header', sizing: 'fill' }, content: [] },
          stack('column', { gap: 240, padding: 720 }, [
            heading(1, '소개'),
            paragraph('두 번째 페이지입니다. 머리말은 위와 같은 정의를 놓은 것입니다.')
          ])
        ]
      },

      /**
       * The **data** the page draws from.
       *
       * A resource, beside the footnote bodies and header definitions this schema already keeps
       * there: a thing referenced by name from the flow, saved and undone with the document, and
       * not laid out anywhere itself.
       *
       * Three rows because a sample is for designing against; a real catalogue is `kind: 'url'`
       * with these kept as what the reader lays the card out on.
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
              /* Declared, so a misspelt `field:` is a fault a reader can be told about. */
              fields: ['이름', '설명', '가격', '순서'],
              records: [
                { 이름: '문서', 설명: '문단, 표, 각주까지.', 가격: '월 9,900원', 순서: 2 },
                { 이름: '덱', 설명: '슬라이드, 도형, 모션.', 가격: '월 12,900원', 순서: 3 },
                { 이름: '사이트', 설명: '쌓이는 섹션, 브라우저가 배치.', 가격: '월 7,900원', 순서: 1 }
              ]
            },
            content: []
          }
        ]
      },

      /**
       * The header, once, as a definition — and placed on both pages.
       *
       * A reusable block on a site is what a card is on a slide: one definition, many placements,
       * and the placements follow the definition. The mechanism is `office-canvas`'s and this is the
       * first product to use it for the thing it is most obviously for.
       *
       * **After** the pages, because that is where the document's content model puts a resource:
       * `docMeta? surface+ resources? components? variables?`. It was written first here and the
       * document was invalid from the day the product opened — the check that should have said so
       * was calling a method that does not exist, and passing.
       */
      {
        stype: 'components',
        attributes: {},
        content: [
          {
            stype: 'component',
            attributes: { id: 'site-header', name: '머리말' },
            content: [
              stack('row', { gap: 240, padding: 240, alignItems: 'center', partId: 'bar' }, [
                heading(4, 'Barocss', { partId: 'wordmark' }),
                paragraph('제품  ·  가격  ·  문서', { partId: 'links' })
              ])
            ]
          },

          /**
           * The card a **product** is drawn as — one design, and the list below draws it per row.
           *
           * Read the three declarations as the argument: `componentVar` is a question the card asks,
           * `componentBind` says which part answers it and in what, and that is the deck's card
           * mechanism with no change at all. What makes it a *data* card is one string in the
           * placement — `field:이름` instead of a value.
           */
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
                { gap: 120, padding: 360, fill: '#f8fafc', partId: 'p-card', sizing: 'fill' },
                [
                  heading(3, '상품', { partId: 'p-name' }),
                  paragraph('설명', { partId: 'p-body' }),
                  paragraph('0원', { partId: 'p-price' })
                ]
              )
            ]
          }
        ]
      }
    ]
  } as Node;
}
