import { describe, it, expect } from 'vitest';
import { createSchema, validateTree, describeFindings } from '@barocss/schema';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import { createStarterDeck } from '../src/starter-deck';
import type { INode } from '@barocss/datastore';

/**
 * The children of a node in a *literal* tree.
 *
 * `INode.content` is `(INode | string)[]` because both are real: a loaded document
 * holds child **sids**, and a fixture like this one holds the children themselves.
 * Narrowed once here rather than asserted at every call — which is what the tests did
 * before anything type-checked them, by reaching for `.stype` on the union.
 */
const kids = (node: INode | undefined): INode[] =>
  (node?.content ?? []).filter((child): child is INode => typeof child !== 'string');

/**
 * The deck this product ships is a document its own schema accepts.
 *
 * It was not. The sample table's rows sat directly under `bTable`, where the
 * schema says `(bTableHeader)? bTableBody+ (bTableFooter)?`, and its cells held
 * paragraphs where `bTableCell` is `inline*`. It drew perfectly for as long as it
 * existed — the renderers walk whatever they are given — and every table
 * operation refused it, four levels away from the fault, with a message about a
 * grid builder.
 *
 * A fixture is the only place a product's documents come from, and it was the
 * one place nothing checked. This is that check, and it costs milliseconds.
 */
describe('the deck a reader starts from', () => {
  /**
   * The same check for the same reason — a fixture is the only place a product's
   * documents come from — and one it can fail differently: every placeholder here
   * holds an *empty* paragraph, and a `textFrame` is `block+`, so "no paragraph at
   * all" is the mistake this catches.
   */
  it('is a document the schema accepts', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const findings = validateTree(schema, createStarterDeck());
    expect(findings, `\n${describeFindings(findings)}\n`).toEqual([]);
  });

  /** One slide, and the definitions a first edit needs. */
  it('holds one slide, a theme, a master and the layouts', () => {
    const deck = createStarterDeck();
    const kinds = kids(deck).map((node) => node.stype);
    expect(kinds.filter((kind) => kind === 'surface')).toHaveLength(1);

    const resources = kids(deck).find((node) => node.stype === 'resources');
    const inside = kids(resources).map((node) => node.stype);
    expect(inside).toEqual(['theme', 'slideMaster', 'slideLayout', 'slideLayout']);

    // The slide points at a layout that is actually in here: a `layoutId` naming
    // nothing is a slide with no design and nothing to say so.
    const slide = kids(deck).find((node) => node.stype === 'surface');
    const layouts = kids(resources)
      .filter((node) => node.stype === 'slideLayout')
      .map((node) => node.attributes?.id);
    expect(layouts).toContain(slide?.attributes?.layoutId);
  });

  /** Nothing this product wrote is in the words a reader saves. */
  it('puts no text of its own in the placeholders', () => {
    const text = JSON.stringify(createStarterDeck());
    const slide = kids(createStarterDeck()).find((node) => node.stype === 'surface');
    const words = JSON.stringify(slide).match(/"text":"([^"]+)"/g) ?? [];
    expect(words).toEqual([]);
    // The document's *title* is the one exception, and it is the file's name.
    expect(text).toContain('제목 없는 프레젠테이션');
  });
});

describe('the sample deck', () => {
  it('is a document the schema accepts', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const findings = validateTree(schema, createSampleDeck());
    expect(findings, `\n${describeFindings(findings)}\n`).toEqual([]);
  });
});
