import { describe, it, expect } from 'vitest';
import { Schema } from '../src/schema';
import { fitContent } from '../src/content-fitting';
import { getStandardSchemaDefinition } from '../src/standard-schema';

const schema = new Schema('standard', getStandardSchemaDefinition() as any);
const ctx = {
  groupOf: (t: string) => schema.getNodeType(t)?.group,
  hasNodeType: (t: string) => schema.hasNodeType(t),
  contentModelOf: (t: string) => schema.getNodeType(t)?.content
};

const n = (stype: string, content?: any[]) => ({ stype, ...(content ? { content } : {}) });

describe('fitContent', () => {
  it('keeps content the parent already accepts', () => {
    const r = fitContent('document', [n('paragraph'), n('heading')], ctx);
    expect(r.nodes.map((x) => x.stype)).toEqual(['paragraph', 'heading']);
    expect(r.dropped).toEqual([]);
  });

  it('unwraps a foreign wrapper and keeps its children', () => {
    // A blockQuote is a block, so it is accepted at document level; but inside a
    // list it is not — its children are what survive.
    const r = fitContent('list', [n('blockQuote', [n('listItem')])], ctx);
    expect(r.nodes.map((x) => x.stype)).toEqual(['listItem']);
    expect(r.unwrapped.map((x) => x.stype)).toEqual(['blockQuote']);
  });

  it('drops a node that fits nowhere and has nothing to unwrap', () => {
    const r = fitContent('list', [n('paragraph')], ctx);
    expect(r.nodes).toEqual([]);
    expect(r.dropped.map((x) => x.stype)).toEqual(['paragraph']);
  });

  it('reports losses instead of swallowing them', () => {
    const r = fitContent('list', [n('listItem'), n('paragraph')], ctx);
    expect(r.nodes.map((x) => x.stype)).toEqual(['listItem']);
    expect(r.dropped).toHaveLength(1);
  });

  it('respects order in a sequence model', () => {
    // bTable is '(bTableHeader)? bTableBody+ (bTableFooter)?'
    const r = fitContent('bTable', [n('bTableFooter'), n('bTableBody')], ctx);
    // The footer cannot come first, so it is dropped; the body is kept.
    expect(r.nodes.map((x) => x.stype)).toEqual(['bTableBody']);
  });

  it('leaves content untouched when the parent has no content model', () => {
    const r = fitContent('inline-text', [n('paragraph')], ctx);
    expect(r.nodes.map((x) => x.stype)).toEqual(['paragraph']);
    expect(r.dropped).toEqual([]);
  });

  it('produces content that validates against the parent', () => {
    const r = fitContent('list', [n('blockQuote', [n('listItem')]), n('paragraph')], ctx);
    expect(schema.validateContent('list', r.nodes as any).valid).toBe(true);
  });
});
