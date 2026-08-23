import type { INode } from '@barocss/datastore';
import { blankLine, createStarterDeck, deckDefinitions } from './starter-deck';
import { slideSize } from './geometry';

/**
 * The decks a reader can start from.
 *
 * ## A template **is a document**
 *
 * Which is the whole design, and it is worth saying because it is the thing a gallery
 * usually gets wrong: a template is not a special kind of file, a bundle, or a set of
 * instructions for building a deck. It is a deck — the same shape as one opened from disk,
 * with the same definitions under it — so everything that already reads a deck reads a
 * template, and a reader who edits one has edited a deck.
 *
 * The corollary is what makes this cheap: `createStarterDeck` was already "what a new deck
 * is", so a template is that with different slides, and the *definitions* (theme, master,
 * layouts) come from one place (`deckDefinitions`) rather than being restated per template.
 *
 * ## What is in one, and what is deliberately not
 *
 * **Structure, not prose.** Each slide carries its *title* — 목차, 문제, 다음 단계 — and an
 * empty body. The titles are the thing a reader chose the template for; the body is theirs.
 * A template full of invented sentences reads as somebody else's deck and has to be emptied
 * before it can be used, and the starter deck's own rule is that a deck saved straight after
 * being made contains **no words this product invented**. A template a reader asked for by
 * name is the one place that rule is relaxed, and only as far as the headings.
 *
 * **No pictures.** A stock photograph would be a file this product ships, licensed and
 * weighed, to say "a picture goes here" — which a placeholder already says.
 */

/** A deck to start from: what it is called, what it is for, and how to make one. */
export interface DeckTemplate {
  id: string;
  name: string;
  /** One line: what a reader would use it for. */
  note: string;
  make: () => INode;
}

/** A slide with a title and an empty body, in the layout named. */
function titled(name: string, title: string, layoutId: 'layout-title' | 'layout-body'): INode {
  const heading: INode = {
    stype: 'textFrame',
    attributes:
      layoutId === 'layout-title'
        ? {
            role: 'title',
            x: 1920,
            y: 3600,
            width: 15360,
            height: 2400,
            verticalAlign: 'middle'
          }
        : { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
    content: [
      {
        stype: 'paragraph',
        attributes:
          layoutId === 'layout-title'
            ? { alignment: 'center', fontSize: 108, bold: true }
            : { fontSize: 66, bold: true },
        content: [{ stype: 'inline-text', text: title }]
      }
    ]
  };

  // A section divider is a title and nothing else: a body box on one is a box that stays
  // empty for the life of the deck.
  const body: INode[] =
    layoutId === 'layout-body'
      ? [
          {
            stype: 'textFrame',
            attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
            content: [blankLine({ fontSize: 40 })]
          }
        ]
      : [];

  return {
    stype: 'surface',
    attributes: { kind: 'slide', name, layoutId },
    content: [heading, ...body]
  };
}

function deckOf(title: string, slides: INode[]): INode {
  return {
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'docMeta',
        attributes: {},
        // The file is named after this — `deckFileName` reads it — so a template's deck
        // saves itself under the template's own name until the reader changes it.
        content: [
          { stype: 'docTitle', attributes: {}, content: [{ stype: 'inline-text', text: title }] }
        ]
      },
      ...slides,
      deckDefinitions()
    ]
  };
}

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    id: 'blank',
    name: '빈 프레젠테이션',
    note: '제목 한 장에서 시작합니다.',
    // The same document 새로 만들기 makes: a gallery that could not offer "nothing" would
    // make the plainest choice the one you cannot pick.
    make: createStarterDeck
  },
  {
    id: 'talk',
    name: '발표',
    note: '목차와 섹션이 있는 이야기 구조.',
    make: () =>
      deckOf('발표', [
        titled('제목', '제목', 'layout-title'),
        titled('목차', '목차', 'layout-body'),
        titled('섹션', '첫 번째 이야기', 'layout-title'),
        titled('내용', '내용', 'layout-body'),
        titled('마무리', '마무리', 'layout-body')
      ])
  },
  {
    id: 'report',
    name: '보고',
    note: '요약이 먼저 오고, 근거가 뒤에 옵니다.',
    make: () =>
      deckOf('보고', [
        titled('제목', '보고', 'layout-title'),
        titled('요약', '요약', 'layout-body'),
        titled('지표', '지표', 'layout-body'),
        titled('원인', '무엇이 이렇게 만들었나', 'layout-body'),
        titled('다음', '다음 단계', 'layout-body')
      ])
  },
  {
    id: 'pitch',
    name: '제안',
    note: '문제에서 요청까지 다섯 장.',
    make: () =>
      deckOf('제안', [
        titled('제목', '제안', 'layout-title'),
        titled('문제', '문제', 'layout-body'),
        titled('해결', '해결', 'layout-body'),
        titled('근거', '근거', 'layout-body'),
        titled('요청', '요청', 'layout-body')
      ])
  }
];

/** One slide, sketched: where its boxes are as fractions of the slide. */
export interface SketchedSlide {
  name: string;
  boxes: { x: number; y: number; width: number; height: number; role?: string }[];
}

/**
 * A template drawn small, **from the document** rather than from a picture.
 *
 * A gallery has to show what it is offering, and the two usual answers are both wrong here.
 * A screenshot is a file that goes stale the day the theme changes and has to be regenerated
 * by somebody. Rendering each template into a hidden editor is a second document loaded per
 * tile, for a picture two centimetres wide.
 *
 * So the tile draws the **shape** of the deck: where the boxes are, as fractions, which is
 * what a reader is actually choosing between — a title slide, a title with a body, five of
 * them in a row. Fractions rather than twips because the tile decides how big it is, and a
 * preview that had to know the slide's size in pixels would be a second place that knows
 * about slides.
 */
export function templateSketch(deck: INode): SketchedSlide[] {
  const kids = (node: INode | undefined): INode[] =>
    (node?.content ?? []).filter((child): child is INode => typeof child !== 'string');

  return kids(deck)
    .filter((node) => node.stype === 'surface' && node.attributes?.kind === 'slide')
    .map((slide) => {
      const size = slideSize(slide.attributes as never);
      const width = size.width || 1;
      const height = size.height || 1;
      return {
        name: typeof slide.attributes?.name === 'string' ? slide.attributes.name : '',
        boxes: kids(slide)
          .filter((box) => typeof box.attributes?.width === 'number')
          .map((box) => {
            const attrs = box.attributes as Record<string, number | string>;
            return {
              x: (Number(attrs.x) || 0) / width,
              y: (Number(attrs.y) || 0) / height,
              width: (Number(attrs.width) || 0) / width,
              height: (Number(attrs.height) || 0) / height,
              ...(typeof attrs.role === 'string' ? { role: attrs.role } : {})
            };
          })
      };
    });
}
