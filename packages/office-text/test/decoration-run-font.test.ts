import { describe, expect, it } from 'vitest';
import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { registerValuedMarks } from '../src/renderers/marks';

type Mark = { stype: string; range?: [number, number]; attrs?: Record<string, unknown> };
function draw(type: string, marks: Mark[], start = 0, end = 10) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerValuedMarks);
  const template = registry.getMarkRenderer(type);
  if (!template || template.type !== 'component' || !template.component) throw new Error('Missing registered mark renderer');
  const model = { stype: 'inline-text', text: 'Title text', marks };
  const props = { attributes: marks.find(mark => mark.stype === type)?.attrs, model, text: model.text.slice(start, end), run: { start, end, types: marks.map(mark => mark.stype) } };
  const drawn = template.component(props, props, { id: type, env: {}, state: {}, props, model: props, registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
  if (drawn.type !== 'element') throw new Error('Expected mark element');
  return drawn.attributes.style as Record<string, unknown>;
}

describe('decorations use the font of the marked run', () => {
  it.each([36, '24px', '18pt'])('draws underline and strike using the shrunk %s run instead of its 72px paragraph', size => {
    const marks: Mark[] = [
      { stype: 'italic', range: [0, 10] },
      { stype: 'underline', range: [0, 10] },
      { stype: 'strikethrough', range: [0, 10] },
      { stype: 'fontFamily', range: [0, 10], attrs: { family: 'Georgia' } },
      { stype: 'fontSize', range: [0, 10], attrs: { size } }
    ];
    const before = structuredClone(marks);
    const paragraph = document.createElement('p');
    paragraph.style.fontSize = '72px';
    for (const [type, line] of [['underline', 'underline'], ['strikethrough', 'line-through']]) {
      const style = draw(type, marks);
      // These are the actual styles from the registered renderer. Without a
      // run size the decorating span inherits the paragraph's large metrics.
      expect(style.fontSize).toBe(typeof size === 'number' ? '18pt' : size);
      expect(style.fontFamily).toBe('Georgia');
      expect(style.textDecorationLine).toBe(line);
      const span = document.createElement('span');
      Object.assign(span.style, style); paragraph.append(span);
      expect(span.style.fontSize).not.toBe('');
      expect(draw(type, [...marks].reverse())).toEqual(style);
    }
    expect(marks).toEqual(before);
  });

  it('keeps adjacent run sizes separate and preserves the decoration colour', () => {
    const marks: Mark[] = [
      { stype: 'underline', attrs: { color: '#ff0000' } },
      { stype: 'fontSize', range: [0, 5], attrs: { size: 36 } },
      { stype: 'fontSize', range: [5, 10], attrs: { size: 108 } }
    ];
    expect(draw('underline', marks, 0, 5)).toEqual({ textDecorationLine: 'underline', textDecorationColor: '#ff0000', fontSize: '18pt' });
    expect(draw('underline', marks, 5, 10)).toEqual({ textDecorationLine: 'underline', textDecorationColor: '#ff0000', fontSize: '54pt' });
  });

  it('does not multiply relative font sizes or add a size when the run has none', () => {
    expect(draw('underline', [{ stype: 'underline' }])).toEqual({ textDecorationLine: 'underline' });
    for (const size of ['0.5em', '50%', 'smaller']) {
      expect(draw('underline', [{ stype: 'underline' }, { stype: 'fontSize', attrs: { size } }])).toEqual({ textDecorationLine: 'underline' });
    }
  });
});
