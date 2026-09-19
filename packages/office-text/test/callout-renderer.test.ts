import { describe, expect, it } from 'vitest';
import { RendererRegistry, intoRegistry, type ElementTemplate, type ElementChild } from '@barocss/dsl';
import { registerProseRenderers } from '../src/prose-renderers';
import { normalizeProseTree } from '../src/normalize-prose-tree';
const elements = (children: ElementChild[]) => children.filter((child): child is ElementTemplate => !!child && typeof child === 'object' && !Array.isArray(child) && child.type === 'element');
function draw(stype: string, model: Record<string, unknown>) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerProseRenderers);
  const template = registry.get(stype)?.template;
  if (!template || typeof template !== 'object' || !('type' in template) || template.type !== 'component' || !template.component) throw new Error('Expected component');
  const drawn = template.component({}, model, { id: stype, env: {}, state: {}, props: {}, model, registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
  if (drawn.type !== 'element') throw new Error('Expected element');
  return drawn;
}
describe('canonical callout titles', () => {
  it('renders a normal editable slot, including an empty title hook', () => {
    const title = draw('calloutTitle', { content: [{ stype: 'inline-text', text: '\uFEFF' }] });
    expect(title.attributes['data-empty']).toBe('true');
    expect(title.attributes.contenteditable).toBeUndefined();
    expect(title.attributes['data-bc-chrome']).toBeUndefined();
    expect(title.children).toContainEqual(expect.objectContaining({ type: 'slot' }));
    expect(draw('calloutTitle', { content: [{ stype: 'inline-text', text: '회의' }] }).attributes['data-empty']).toBeUndefined();
  });
  it('does not duplicate legacy attributes in static render or emit dead title buttons', () => {
    const drawn = draw('callout', { attributes: { title: 'legacy', type: 'note' }, content: [{ stype: 'calloutTitle', content: [] }] });
    expect(elements(drawn.children).some(node => node.tag === 'button' || node.attributes.className === 'w-callout-title')).toBe(false);
    const svg = elements(elements(drawn.children)[0].children)[0];
    expect(svg.tag).toBe('svg');
    expect(svg.attributes).toMatchObject({ width: '16', height: '16', 'stroke-width': '1.5' });
  });
  it('keeps an unopened historical Site title visible as readonly static content', () => {
    const legacy = draw('callout', { attributes: { title: '기존 제목' }, content: [] });
    const title = elements(legacy.children).find(node => node.attributes.className === 'w-callout-title')!;
    expect(title.tag).toBe('div');
    expect(title.children).toEqual(['기존 제목']);
    expect(title.attributes.contenteditable).toBe('false');
    expect(title.attributes['data-callout-title-edit']).toBeUndefined();
  });
  it('migrates nested legacy titles without mutation and is idempotent', () => {
    const body = { stype: 'paragraph', content: [{ stype: 'inline-text', text: '본문', marks: [{ type: 'bold' }] }] };
    const old = { stype: 'note', content: [{ stype: 'callout', attributes: { type: 'tip', title: '안내' }, content: [body] }] };
    const snapshot = JSON.stringify(old);
    const next = normalizeProseTree(old);
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(next.content[0].attributes).toEqual({ type: 'tip' });
    expect(next.content[0].content).toEqual([{ stype: 'calloutTitle', content: [{ stype: 'inline-text', text: '안내' }] }, body]);
    expect(normalizeProseTree(next)).toEqual(next);
  });
  it('preserves canonical title marks and links when legacy attributes coexist', () => {
    const title = { stype: 'calloutTitle', content: [{ stype: 'link', attributes: { href: 'https://example.com' }, content: [{ stype: 'inline-text', text: '새 제목', marks: [{ type: 'bold' }] }] }] };
    const next = normalizeProseTree({ stype: 'callout', attributes: { title: 'old' }, content: [title, { stype: 'paragraph', content: [] }] });
    expect(next.content[0]).toEqual(title);
    expect(next.attributes).toEqual({});
    expect(next.content).toHaveLength(2);
  });
});
