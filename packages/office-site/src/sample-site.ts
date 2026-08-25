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
      /**
       * The header, once, as a definition — and placed on both pages.
       *
       * A reusable block on a site is what a card is on a slide: one definition, many placements,
       * and the placements follow the definition. The mechanism is `office-canvas`'s and this is the
       * first product to use it for the thing it is most obviously for.
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
          }
        ]
      },

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

          // Three cards side by side — the row every landing page has.
          stack('row', { gap: 240, padding: 720 }, [
            card('문서', '문단, 표, 각주. 페이지로 나뉘는 것은 워드의 몫입니다.'),
            card('덱', '슬라이드, 도형, 모션. 좌표 위에 놓는 것은 덱의 몫입니다.'),
            card('사이트', '쌓이는 섹션. 배치는 브라우저가 합니다.')
          ]),

          stack('column', { gap: 120, padding: 480, fill: '#0f172a' }, [
            paragraph('© 2026 Barocss')
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
      }
    ]
  } as Node;
}
