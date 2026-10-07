import { expect, it } from 'vitest';
import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { registerNoteStandalone } from '../../office-note/src/renderers';
import { registerWordRenderers } from '../../office-word/src/renderers/word';
import { registerSlidesRenderers } from '../../office-slides/src/renderers';
import { registerSiteRenderers } from '../../office-site/src/renderers';
import { getNoteSchemaDefinition } from '../../office-note/src/note-schema';
import { getWordSchemaDefinition } from '../../office-word/src/word-schema';
import { getSlidesSchemaDefinition } from '../../office-slides/src/slides-schema';
import { getSiteSchemaDefinition } from '../../office-site/src/site-schema';

for (const [name, register, schema] of [
  ['Note', registerNoteStandalone, getNoteSchemaDefinition], ['Word', registerWordRenderers, getWordSchemaDefinition],
  ['Slides', registerSlidesRenderers, getSlidesSchemaDefinition], ['Site', registerSiteRenderers, getSiteSchemaDefinition]
] as const) it(`${name} uses its actual isolated registration for canonical and literal strike`, () => {
  const registry = new RendererRegistry({ global: false }); intoRegistry(registry, register);
  expect(schema().marks).toHaveProperty('strikethrough'); expect(schema().marks).not.toHaveProperty('strike');
  for (const strike of ['strikethrough', 'strike']) {
    const marks = [{ stype: strike, range: [0, 2] }, { stype: 'underline', range: [1, 4] }, { stype: 'fontSize', attrs: { size: 36 } }];
    const original = structuredClone(marks);
    for (const [type, line] of [[strike, 'line-through'], ['underline', 'underline']]) {
      const template = registry.getMarkRenderer(type);
      if (!template || template.type !== 'component' || !template.component) throw new Error('Actual product mark registration must exist');
      const model = { stype: 'inline-text', text: '검토 B', marks };
      const props = { model, text: '토', run: { start: 1, end: 2, types: [strike, 'underline', 'fontSize'] } };
      const result = template.component(props, props, { id: type, env: {}, state: {}, props, model: props, registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
      if (result.type !== 'element') throw new Error('Known renderer must produce an element');
      expect(result.attributes.className).toBe(`mark-${type}`);
      expect(result.attributes.style).toMatchObject({ textDecorationLine: line, fontSize: '18pt' });
    }
    expect(marks).toStrictEqual(original);
  }
  expect(registry.getMarkRenderer('unknown-native-strike')).toBeUndefined();
});
