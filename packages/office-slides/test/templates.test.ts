import { describe, it, expect } from 'vitest';
import { createSchema, validateTree, describeFindings } from '@barocss/schema';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { DECK_TEMPLATES, templateSketch } from '../src/templates';
import type { INode } from '@barocss/datastore';

/**
 * The decks a reader can start from.
 *
 * A template **is a document** — the same shape as one opened from disk — so the checks it
 * needs are the ones a fixture needs: that the schema accepts it, and that the definitions a
 * deck cannot work without are in it. A fixture is the only place a product's documents come
 * from, and it is the one place nothing checks unless something like this does.
 */
const kids = (node: INode | undefined): INode[] =>
  (node?.content ?? []).filter((child): child is INode => typeof child !== 'string');

describe('the decks a reader can start from', () => {
  const schema = createSchema('slides', getSlidesSchemaDefinition());

  it('offers more than one, and every one is named and described', () => {
    expect(DECK_TEMPLATES.length).toBeGreaterThan(1);
    for (const template of DECK_TEMPLATES) {
      expect(template.name.length, template.id).toBeGreaterThan(0);
      // A tile with no line under it is a tile a reader has to press to find out about.
      expect(template.note.length, template.id).toBeGreaterThan(0);
    }
    // Ids are how a gallery's tile and a test name the same template.
    expect(new Set(DECK_TEMPLATES.map((one) => one.id)).size).toBe(DECK_TEMPLATES.length);
  });

  for (const template of DECK_TEMPLATES) {
    describe(template.name, () => {
      const deck = template.make();

      it('is a document the schema accepts', () => {
        const findings = validateTree(schema, deck as never);
        expect(findings, describeFindings(findings)).toEqual([]);
      });

      it('has the definitions a deck cannot work without', () => {
        /*
         * A theme, a master and the layouts. Without them `theme:accent1` resolves to
         * nothing, a new slide has no layout to pick, and the deck has no design to
         * inherit — which is why they come from one function rather than being restated
         * per template.
         */
        const resources = kids(deck).find((node) => node.stype === 'resources');
        const types = kids(resources).map((node) => node.stype);
        expect(types).toContain('theme');
        expect(types).toContain('slideMaster');
        expect(types.filter((one) => one === 'slideLayout').length).toBeGreaterThan(0);
      });

      it('names itself, so the file it saves is named too', () => {
        // `deckFileName` reads the title: a deck that saved itself as "제목 없는" when the
        // reader had picked 보고 would be telling the wrong truth.
        const meta = kids(deck).find((node) => node.stype === 'docMeta');
        const title = kids(meta).find((node) => node.stype === 'docTitle');
        const text = kids(title)[0];
        expect(typeof text?.text === 'string' ? text.text.length : 0).toBeGreaterThan(0);
      });

      it('gives every slide a layout to follow and a title to edit', () => {
        const slides = kids(deck).filter((node) => node.stype === 'surface');
        expect(slides.length).toBeGreaterThan(0);
        for (const slide of slides) {
          expect(typeof slide.attributes?.layoutId).toBe('string');
          const roles = kids(slide).map((box) => box.attributes?.role);
          expect(roles, slide.attributes?.name as string).toContain('title');
        }
      });

      it('writes headings and no prose', () => {
        /*
         * Structure, not somebody else's words. The titles are what a reader picked the
         * template for; a body full of invented sentences reads as another person's deck
         * and has to be emptied before it can be used.
         */
        const words = (node: INode): string[] => [
          ...(typeof node.text === 'string' && node.text.trim() ? [node.text.trim()] : []),
          ...kids(node).flatMap(words)
        ];
        for (const slide of kids(deck).filter((node) => node.stype === 'surface')) {
          for (const box of kids(slide)) {
            if (box.attributes?.role === 'title') continue;
            expect(words(box), '본문에 문장이 들어 있습니다').toEqual([]);
          }
        }
      });
    });
  }

  describe('drawn small for the gallery', () => {
    it('answers every slide as fractions of itself', () => {
      const sketch = templateSketch(DECK_TEMPLATES.find((one) => one.id === 'talk')!.make());
      expect(sketch.length).toBeGreaterThan(1);
      for (const slide of sketch) {
        for (const box of slide.boxes) {
          // Fractions, because the tile decides how big it is — a preview that knew the
          // slide's size in pixels would be a second place that knows about slides.
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(1.01);
          expect(box.y + box.height).toBeLessThanOrEqual(1.01);
        }
      }
    });

    it('says which box is the title, so a tile can draw it differently', () => {
      const sketch = templateSketch(DECK_TEMPLATES.find((one) => one.id === 'report')!.make());
      expect(sketch[0].boxes.some((box) => box.role === 'title')).toBe(true);
    });

    it('answers nothing for a deck with no slides', () => {
      expect(templateSketch({ stype: 'document', attributes: {}, content: [] })).toEqual([]);
    });
  });
});
