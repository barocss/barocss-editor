import { describe, it, expect } from 'vitest';
import { Schema } from '../src/schema';
import { getContentMatch, ContentMatch, ContentExpressionError } from '../src/content-match';
import { getStandardSchemaDefinition } from '../src/standard-schema';

const schema = new Schema('standard', getStandardSchemaDefinition() as any);
const ctx = {
  groupOf: (t: string) => schema.getNodeType(t)?.group,
  hasNodeType: (t: string) => schema.hasNodeType(t)
};

const ok = (expr: string, types: string[]) =>
  getContentMatch(expr).match(types, ctx).valid;

describe('content expression parsing', () => {
  it('rejects malformed expressions instead of silently accepting them', () => {
    expect(() => ContentMatch.parse('(block')).toThrow(ContentExpressionError);
    expect(() => ContentMatch.parse('block |')).toThrow(ContentExpressionError);
    expect(() => ContentMatch.parse('block{2,1}')).toThrow(ContentExpressionError);
    expect(() => ContentMatch.parse('block $')).toThrow(ContentExpressionError);
  });
});

describe('quantifiers', () => {
  it('+ requires at least one', () => {
    expect(ok('block+', [])).toBe(false);
    expect(ok('block+', ['paragraph'])).toBe(true);
    expect(ok('block+', ['paragraph', 'heading'])).toBe(true);
  });

  it('* allows zero or more', () => {
    expect(ok('inline*', [])).toBe(true);
    expect(ok('inline*', ['inline-text', 'inline-text'])).toBe(true);
  });

  it('? allows zero or one', () => {
    expect(ok('bFigcaption?', [])).toBe(true);
    expect(ok('bFigcaption?', ['bFigcaption'])).toBe(true);
    expect(ok('bFigcaption?', ['bFigcaption', 'bFigcaption'])).toBe(false);
  });

  it('{n,m} bounds repetition', () => {
    expect(ok('paragraph{2,3}', ['paragraph'])).toBe(false);
    expect(ok('paragraph{2,3}', ['paragraph', 'paragraph'])).toBe(true);
    expect(ok('paragraph{2,3}', ['paragraph', 'paragraph', 'paragraph'])).toBe(true);
    expect(ok('paragraph{2,3}', Array(4).fill('paragraph'))).toBe(false);
  });
});

describe('groups match by node group as well as by name', () => {
  it('accepts any member of a group', () => {
    expect(ok('block+', ['heading', 'paragraph', 'blockQuote'])).toBe(true);
  });

  it('rejects a node from the wrong group', () => {
    expect(ok('block+', ['inline-text'])).toBe(false);
    expect(ok('inline*', ['paragraph'])).toBe(false);
  });

  it('accepts an exact node name even when a group also exists', () => {
    expect(ok('listItem+', ['listItem'])).toBe(true);
    expect(ok('listItem+', ['paragraph'])).toBe(false);
  });
});

describe('sequences, choices and groups — the forms the old parser could not read', () => {
  it('bTable: (bTableHeader)? bTableBody+ (bTableFooter)?', () => {
    const expr = schema.getNodeType('bTable')!.content!;
    expect(ok(expr, ['bTableHeader', 'bTableBody', 'bTableFooter'])).toBe(true);
    expect(ok(expr, ['bTableBody'])).toBe(true);
    expect(ok(expr, ['bTableHeader', 'bTableBody'])).toBe(true);
    expect(ok(expr, ['bTableBody', 'bTableBody', 'bTableFooter'])).toBe(true);
    // order matters
    expect(ok(expr, ['bTableBody', 'bTableHeader'])).toBe(false);
    // body is required
    expect(ok(expr, ['bTableHeader'])).toBe(false);
    expect(ok(expr, [])).toBe(false);
  });

  it('bDetails: bSummary block+', () => {
    const expr = schema.getNodeType('bDetails')!.content!;
    expect(ok(expr, ['bSummary', 'paragraph'])).toBe(true);
    expect(ok(expr, ['bSummary', 'paragraph', 'heading'])).toBe(true);
    expect(ok(expr, ['bSummary'])).toBe(false);
    expect(ok(expr, ['paragraph', 'bSummary'])).toBe(false);
  });

  it('descList: (descTerm descDef)+', () => {
    const expr = schema.getNodeType('descList')!.content!;
    expect(ok(expr, ['descTerm', 'descDef'])).toBe(true);
    expect(ok(expr, ['descTerm', 'descDef', 'descTerm', 'descDef'])).toBe(true);
    expect(ok(expr, ['descTerm'])).toBe(false);
    expect(ok(expr, ['descTerm', 'descDef', 'descTerm'])).toBe(false);
    expect(ok(expr, ['descDef', 'descTerm'])).toBe(false);
  });

  it('bFigure: (inline-image|bTable|codeBlock|...)+ bFigcaption?', () => {
    const expr = schema.getNodeType('bFigure')!.content!;
    expect(ok(expr, ['inline-image'])).toBe(true);
    expect(ok(expr, ['inline-image', 'bFigcaption'])).toBe(true);
    expect(ok(expr, ['codeBlock', 'mediaVideo', 'bFigcaption'])).toBe(true);
    expect(ok(expr, ['bFigcaption'])).toBe(false);
    expect(ok(expr, ['bFigcaption', 'inline-image'])).toBe(false);
    expect(ok(expr, ['paragraph'])).toBe(false);
  });
});

describe('Schema.validateContent uses the parser', () => {
  const node = (stype: string) => ({ stype });

  it('accepts the standard schema’s own compound structures', () => {
    expect(
      schema.validateContent('bTable', [node('bTableHeader'), node('bTableBody'), node('bTableFooter')]).valid
    ).toBe(true);
    expect(schema.validateContent('bDetails', [node('bSummary'), node('paragraph')]).valid).toBe(true);
    expect(schema.validateContent('descList', [node('descTerm'), node('descDef')]).valid).toBe(true);
    expect(schema.validateContent('bFigure', [node('inline-image'), node('bFigcaption')]).valid).toBe(true);
  });

  it('still rejects genuinely wrong content, with a useful message', () => {
    const r = schema.validateContent('list', [node('paragraph')]);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('paragraph');
    expect(r.errors[0]).toContain('listItem');
  });

  it('reports an unknown child type', () => {
    const r = schema.validateContent('document', [node('nope')]);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("unknown type 'nope'");
  });

  it('reports content that ends before the model is satisfied', () => {
    const r = schema.validateContent('bDetails', [node('bSummary')]);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('ended early');
  });

  it('treats a node without a content model as always valid', () => {
    expect(schema.validateContent('inline-text', []).valid).toBe(true);
  });
});

describe('helpers used by content fitting', () => {
  it('matchesEmpty reflects whether no children is legal', () => {
    expect(getContentMatch('inline*').matchesEmpty()).toBe(true);
    expect(getContentMatch('block+').matchesEmpty()).toBe(false);
    expect(getContentMatch('bSummary block+').matchesEmpty()).toBe(false);
  });

  it('firstTypes expands groups to concrete node types', () => {
    const all = Array.from(schema.nodes.keys());
    expect(getContentMatch('listItem+').firstTypes(ctx, all)).toEqual(['listItem']);
    const blockFirst = getContentMatch('block+').firstTypes(ctx, all);
    expect(blockFirst).toContain('paragraph');
    expect(blockFirst).not.toContain('inline-text');
  });
});
