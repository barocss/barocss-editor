/**
 * A site to open the product with — and to **measure it against**.
 *
 * ## Why this one is elaborate
 *
 * The first sample was two pages and made the argument that a landing page is a column of stacks. It
 * proved the claim and taught nothing else, because a property panel can only be judged against a
 * document that uses the properties. So this one is deliberately dense: every attribute the site
 * schema adds is used somewhere, at more than one value, and the panel is built by looking at it.
 *
 * What it exercises, and where:
 *
 * | what | where |
 * | --- | --- |
 * | `layoutMode` — column, row, **grid** | the hero, the card row, the feature grid |
 * | `sizing` — fill, **hug**, **fixed** with `minWidth`/`maxWidth` | the CTA, the sidebar |
 * | `overrides` at **both** narrow widths, not only mobile | the hero, the grid, the card row |
 * | `alignItems` — start, center, end | the header bar, the CTA, the enquiry row |
 * | **design tokens** (`var:강조`, `var:바탕`, `var:먹`) | every accent on the site |
 * | `component` + `instance` with **bound values** | the header, the footer, the button |
 * | `collection` with `sortBy`, `limit`, **`where`/`equals`** | the products, the posts |
 * | `picture` with `fit`, `fill`, `stroke` | the hero image, the team photographs |
 * | marks — `fontColor` | the hero, the footer, the button |
 * | five pages with **addresses** | `/`, `/제품`, `/가격`, `/소개`, `/블로그` |
 *
 * Every node in it is the office schema's. That is still the argument; this is the argument made at
 * a size where it can be disbelieved.
 */
import type { SchemaDefinition } from '@barocss/schema';
import { mark, node, textNode } from '@barocss/model';

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

const heading = (level: number, value: string, extra: Record<string, unknown> = {}): Node =>
  node('heading', { level, ...extra }, [text(value) as never]) as unknown as Node;

const paragraph = (value: string | Node[], extra: Record<string, unknown> = {}): Node =>
  node('paragraph', extra, (typeof value === 'string' ? [text(value)] : value) as never) as unknown as Node;

/** A stack: the one container this product builds everything out of. */
const stack = (
  layoutMode: 'row' | 'column' | 'grid',
  attributes: Record<string, unknown>,
  content: Node[]
): Node => node('frame', { layoutMode, sizing: 'fill', ...attributes }, content as never) as unknown as Node;

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

/** A card: a column that fills its share of a row. */
const card = (title: string, body: string, extra: Record<string, unknown> = {}): Node =>
  stack('column', { gap: 120, padding: 360, fill: 'var:바탕', sizing: 'fill', ...extra }, [
    heading(3, title),
    paragraph(body)
  ]);

/**
 * A picture drawn from nothing.
 *
 * An SVG data URI rather than a file, for the reason every sample in this repository avoids assets:
 * a document that needs a server to look right is a document a test cannot open.
 */
const swatch = (fill: string, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${fill}"/><text x="160" y="108" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">${label}</text></svg>`
  )}`;

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
                { 제목: '한 문서 모델로 세 제품', 요약: '스키마가 먼저 있었다는 이야기.', 날짜: '2026-08-01', 추천: 'yes' },
                { 제목: '커서는 누구의 것인가', 요약: '입력 경로를 다시 그린 기록.', 날짜: '2026-07-12', 추천: 'no' },
                { 제목: '측정하고 나서 만들기', 요약: '스크린샷 한 장이 찾아낸 것들.', 날짜: '2026-06-30', 추천: 'yes' }
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
       */
      {
        stype: 'variables',
        attributes: {},
        content: [
          { stype: 'variable', attributes: { name: '강조', label: '강조색', kind: 'color', value: '#2563eb' } },
          { stype: 'variable', attributes: { name: '바탕', label: '카드 바탕', kind: 'color', value: '#f8fafc' } },
          { stype: 'variable', attributes: { name: '먹', label: '어두운 바탕', kind: 'color', value: '#0f172a' } },
          { stype: 'variable', attributes: { name: '회사', label: '회사 이름', kind: 'text', value: 'Barocss' } }
        ]
      }
    ]
  } as Node;
}

/** `/` — the one a visitor lands on. */
function home(): Node {
  return {
    stype: 'surface',
    attributes: { kind: 'flow', id: 'home', name: '홈', path: '/' },
    content: [
      placed('site-header'),

      /*
       * The hero: a **row** on a wide screen and a column on a phone, with the picture holding a
       * width of its own until there is no room for it beside the words.
       */
      stack(
        'row',
        {
          name: '히어로',
          gap: 480,
          padding: 720,
          alignItems: 'center',
          overrides: {
            tablet: { padding: 480, gap: 360 },
            mobile: { layoutMode: 'column', padding: 360, gap: 240 }
          }
        },
        [
          stack('column', { name: '히어로 글', gap: 240, sizing: 'fill', minWidth: 4800 }, [
            heading(1, '한 엔진, 여러 제품'),
            paragraph([
              text('워드프로세서와 프레젠테이션이 같은 문서 모델을 씁니다. '),
              inColour('이 페이지도 같은 모델입니다.', '2563EB')
            ]),
            placed('cta', { 문구: '무료로 시작하기' }, { sizing: 'hug' })
          ]),
          picture(swatch('#2563eb', 'Barocss'), '제품 화면', {
            sizing: 'fixed',
            maxWidth: 7200,
            stroke: 'var:강조',
            strokeWidth: 30,
            overrides: { mobile: { sizing: 'fill' } }
          })
        ]
      ),

      // Three cards side by side — stacked on a phone, with less padding on a tablet.
      stack(
        'row',
        {
          name: '카드 줄',
          gap: 240,
          padding: 720,
          overrides: {
            tablet: { padding: 480 },
            mobile: { layoutMode: 'column', padding: 360 }
          }
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
       * `sortBy: '순서'` is why the rows are not in the order they are written — the point of data
       * rather than typing — and `where`/`equals` keeps the bundle off the front page.
       */
      {
        stype: 'collection',
        attributes: {
          name: '상품 목록',
          source: '상품',
          sortBy: '순서',
          where: '분류',
          equals: '제품',
          layoutMode: 'row',
          gap: 240,
          padding: 720,
          sizing: 'fill',
          overrides: { mobile: { layoutMode: 'column', padding: 360 } }
        },
        content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
      },

      placed('site-footer')
    ]
  };
}

/** `/제품` — a **grid**, the third arrangement and the one nothing else on the site uses. */
function products(): Node {
  return {
    stype: 'surface',
    attributes: { kind: 'flow', id: 'products', name: '제품', path: '/제품' },
    content: [
      placed('site-header'),
      stack('column', { name: '머리', gap: 240, padding: 720 }, [
        heading(1, '제품'),
        paragraph('세 제품이 한 스키마 위에 있습니다.')
      ]),
      stack(
        'grid',
        {
          name: '기능 그리드',
          columns: 3,
          gap: 240,
          padding: 720,
          // Two columns on a tablet, one on a phone: the reason a grid states its columns at all.
          overrides: { tablet: { columns: 2, padding: 480 }, mobile: { columns: 1, padding: 360 } }
        },
        [
          card('스키마', '문서가 무엇으로 이루어지는지 한 곳에서 말합니다.'),
          card('명령', '읽을 수 있는 하나의 이름, 하나의 되돌리기.'),
          card('렌더러', '노드 하나가 그림 하나가 됩니다.'),
          card('선택', '집합입니다. 카드 셋을 한 번에 옮깁니다.'),
          card('반응형', '좁은 폭은 다른 것만 말합니다.'),
          card('데이터', '디자인 하나, 행 마흔 개.')
        ]
      ),
      placed('site-footer')
    ]
  };
}

/** `/가격` — a button that hugs and a sidebar that is fixed, which nothing else on the site is. */
function pricing(): Node {
  return {
    stype: 'surface',
    attributes: { kind: 'flow', id: 'pricing', name: '가격', path: '/가격' },
    content: [
      placed('site-header'),
      stack('column', { name: '머리', gap: 240, padding: 720, alignItems: 'center' }, [
        heading(1, '가격'),
        paragraph('쓰는 만큼. 언제든 그만둘 수 있습니다.')
      ]),
      {
        stype: 'collection',
        attributes: {
          name: '요금제',
          source: '상품',
          sortBy: '가격',
          sortDir: 'desc',
          limit: 3,
          layoutMode: 'row',
          gap: 240,
          padding: 720,
          alignItems: 'start',
          sizing: 'fill',
          overrides: { mobile: { layoutMode: 'column', padding: 360 } }
        },
        content: [placed('product-card', { 이름: 'field:이름', 설명: 'field:설명', 가격: 'field:가격' })]
      },
      stack(
        'row',
        {
          name: '문의',
          gap: 240,
          padding: 720,
          alignItems: 'end',
          fill: 'var:바탕',
          overrides: { mobile: { layoutMode: 'column', alignItems: 'start', padding: 360 } }
        },
        [
          stack('column', { name: '문의 글', gap: 120, sizing: 'fill' }, [
            heading(3, '더 큰 팀이신가요'),
            paragraph('좌석, 청구, 배포를 함께 이야기합니다.')
          ]),
          // A fixed sidebar: the one place on the site that states a width in twips.
          stack('column', { name: '문의 상자', gap: 120, sizing: 'fixed', minWidth: 3600, maxWidth: 3600, padding: 240 }, [
            placed('cta', { 문구: '영업팀에 연락' }, { sizing: 'fill' })
          ])
        ]
      ),
      placed('site-footer')
    ]
  };
}

/** `/소개` — pictures, a list, and words that are not in a card. */
function about(): Node {
  return {
    stype: 'surface',
    attributes: { kind: 'flow', id: 'about', name: '소개', path: '/소개' },
    content: [
      placed('site-header'),
      stack('column', { name: '머리', gap: 240, padding: 720, maxWidth: 14400 }, [
        heading(1, '소개'),
        paragraph('한 문서 모델 위에 세 제품을 올리는 일을 하고 있습니다.'),
        {
          stype: 'list',
          attributes: { kind: 'bullet' },
          content: [
            { stype: 'listItem', attributes: {}, content: [paragraph('스키마가 먼저입니다.')] },
            { stype: 'listItem', attributes: {}, content: [paragraph('측정하고 나서 만듭니다.')] },
            { stype: 'listItem', attributes: {}, content: [paragraph('놀란 것은 적어둡니다.')] }
          ]
        }
      ]),
      stack(
        'row',
        {
          name: '사람들',
          gap: 240,
          padding: 720,
          overrides: { mobile: { layoutMode: 'column', padding: 360 } }
        },
        [
          picture(swatch('#0f172a', '진호'), '진호', { sizing: 'fill', fit: 'contain', fill: 'var:바탕' }),
          picture(swatch('#334155', '수민'), '수민', { sizing: 'fill', fit: 'contain', fill: 'var:바탕' }),
          picture(swatch('#475569', '지연'), '지연', { sizing: 'fill', fit: 'contain', fill: 'var:바탕' })
        ]
      ),
      placed('site-footer')
    ]
  };
}

/** `/블로그` — a list filtered to what is recommended, newest first. */
function blog(): Node {
  return {
    stype: 'surface',
    attributes: { kind: 'flow', id: 'blog', name: '블로그', path: '/블로그' },
    content: [
      placed('site-header'),
      stack('column', { name: '머리', gap: 240, padding: 720 }, [
        heading(1, '블로그'),
        paragraph('무엇을 만들었고 무엇에 놀랐는지.')
      ]),
      {
        stype: 'collection',
        attributes: {
          name: '추천 글',
          source: '글',
          where: '추천',
          equals: 'yes',
          sortBy: '날짜',
          sortDir: 'desc',
          layoutMode: 'column',
          gap: 240,
          padding: 720,
          sizing: 'fill'
        },
        content: [placed('post-row', { 제목: 'field:제목', 요약: 'field:요약', 날짜: 'field:날짜' })]
      },
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
          stack('row', { gap: 240, padding: 240, alignItems: 'center', partId: 'bar', fill: 'var:바탕' }, [
            heading(4, 'Barocss', { partId: 'wordmark' }),
            paragraph('제품  ·  가격  ·  소개  ·  블로그', { partId: 'links' })
          ])
        ]
      },
      {
        stype: 'component',
        attributes: { id: 'site-footer', name: '꼬리말' },
        content: [
          stack('column', { gap: 120, padding: 480, fill: 'var:먹', partId: 'foot' }, [
            {
              stype: 'paragraph',
              attributes: { partId: 'note' },
              content: [inColour('© 2026 Barocss', 'E2E8F0')]
            }
          ])
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
            { partId: 'cta-box', gap: 0, padding: 180, fill: 'var:강조', alignItems: 'center', sizing: 'hug' },
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
          stack('column', { gap: 120, padding: 360, fill: 'var:바탕', partId: 'p-card', sizing: 'fill' }, [
            heading(3, '상품', { partId: 'p-name' }),
            paragraph('설명', { partId: 'p-body' }),
            paragraph('0원', { partId: 'p-price' })
          ])
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
          stack('row', { gap: 240, padding: 240, alignItems: 'start', partId: 'b-row', sizing: 'fill' }, [
            stack('column', { gap: 60, sizing: 'fixed', minWidth: 1800, partId: 'b-when' }, [
              paragraph('', { partId: 'b-date' })
            ]),
            stack('column', { gap: 60, sizing: 'fill', partId: 'b-what' }, [
              heading(3, '제목', { partId: 'b-title' }),
              paragraph('요약', { partId: 'b-body' })
            ])
          ])
        ]
      }
    ]
  };
}
