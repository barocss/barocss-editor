import { it } from 'vitest';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerWordRenderers } from '../src/renderers';
it('probe', () => {
  registerWordRenderers();
  const s = createSchema('office', getOfficeSchemaDefinition());
  for (const n of ['checklist','taskItem','footnoteDef','commentThread']) {
    const def = (s as any).nodes.get(n);
    console.log(n, '| in schema:', !!def, '| group:', def?.group, '| renderer:', getGlobalRegistry().has(n));
  }
});
