import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { getGlobalRegistry } from '@barocss/dsl';
import { attributeReadFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { registerSiteRenderers } from '../src/renderers';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { SITE_ENV_KEY, createSiteEnv } from '../src/breakpoints';

const APP = '/Users/user/github/barocss/barocss-editor/apps/site/src';

it('gap', () => {
  registerSiteRenderers();
  const registry = getGlobalRegistry();
  const schema: any = createSchema('site', getSiteSchemaDefinition());
  const read = attributeReadFrom(
    registry as never,
    (t: string) => (schema.nodes.get(t) as any)?.attrs,
    { [SITE_ENV_KEY]: createSiteEnv('mobile') },
    (_t: string, a: string) => (a === 'overrides' ? [{ mobile: { sizing: 'hug' } }] : a === 'varBinds' ? [[{ attr: 'fill', var: 'x' }]] : undefined)
  );
  const ui = readdirSync(APP).filter((f) => f.endsWith('.tsx'))
    .map((f) => readFileSync(`${APP}/${f}`, 'utf8')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const gaps: string[] = [];
  let drawnRead = 0;
  for (const [type, node] of schema.nodes as Map<string, any>) {
    if (!registry.has(type)) continue;
    for (const attr of Object.keys(node?.attrs ?? {})) {
      if (read(type, attr) !== true) continue;
      drawnRead += 1;
      if (!new RegExp(`['"\`]${attr}['"\`]`).test(ui)) gaps.push(`${type}.${attr}`);
    }
  }
  const names = [...new Set(gaps.map((g) => g.split('.')[1]))];
  console.log(`SITE: ${drawnRead} attributes the product reads; ${gaps.length} of them no UI offers`);
  console.log('  ' + names.sort().join(' '));
});
