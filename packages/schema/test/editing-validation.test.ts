import { describe, expect, it } from 'vitest';
import { Schema, validateEditingContent, validateEditingFragment } from '../src';

const schema = new Schema('ordered', { nodes: {
  section: { name: 'section', content: 'caption body+' },
  caption: { name: 'caption', content: 'inline*' },
  body: { name: 'body', content: 'inline*', marks: ['strong'] },
  glyph: { name: 'glyph', group: 'inline' }
}, marks: { strong: { name: 'strong' }, link: { name: 'link', attrs: { href: { type: 'string', required: true } } } } });
const body = { stype: 'body', content: [{ stype: 'glyph', text: 'part' }] };

describe('editing fragment validation', () => {
  it('allows omitted required ancestors only on an explicitly open edge', () => {
    const nodes = [{ stype: 'section', content: [body] }];
    expect(validateEditingFragment(schema, nodes).valid).toBe(false);
    expect(validateEditingFragment(schema, nodes, 2, 2)).toEqual({ valid: true, errors: [] });
    expect(validateEditingContent(schema, 'section', [body]).valid).toBe(false);
    expect(validateEditingContent(schema, 'section', [{ stype: 'caption' }, body]).valid).toBe(true);
  });
  it('does not accept an impossible sequence even when both edges are open', () => {
    expect(validateEditingFragment(schema, [{ stype: 'section', content: [body, { stype: 'caption' }] }], 1, 1).valid).toBe(false);
  });
  it.each([-1, 0.5, 3])('rejects invalid open depth %s', depth => {
    expect(validateEditingFragment(schema, [body], depth, depth).valid).toBe(false);
  });
  it('rejects unknown types, undeclared children and malformed content declarations', () => {
    expect(validateEditingFragment(schema, [{ stype: 'unknown' }]).valid).toBe(false);
    expect(validateEditingFragment(schema, [{ stype: 'glyph', content: [body] }]).valid).toBe(false);
    const bad = new Schema('bad', { nodes: { bad: { name: 'bad', content: '(' } } });
    expect(validateEditingFragment(bad, [{ stype: 'bad' }]).valid).toBe(false);
  });
  it('validates required mark attributes, parent mark restrictions and clipped ranges', () => {
    expect(validateEditingFragment(schema, [{ stype: 'glyph', text: 'a', marks: [{ stype: 'link' }] }]).valid).toBe(false);
    expect(validateEditingFragment(schema, [{ stype: 'body', content: [{ stype: 'glyph', text: 'a', marks: [{ stype: 'link', attrs: { href: '/a' } }] }] }]).valid).toBe(false);
    expect(validateEditingFragment(schema, [{ stype: 'glyph', text: 'a', marks: [{ stype: 'strong', range: [0, 2] }] }]).valid).toBe(false);
    expect(validateEditingFragment(schema, [{ stype: 'glyph', text: 'a', marks: [{ stype: 'strong', range: [0, 1] }] }]).valid).toBe(true);
  });
});
