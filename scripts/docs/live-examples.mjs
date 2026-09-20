import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, examples } from './catalogue.mjs';

export function liveExamples() {
  const definitions = JSON.parse(readFileSync(resolve(root, 'scripts/docs/live-examples.json'), 'utf8'));
  const ids = new Set();
  return definitions.map((item) => {
    if (!/^[a-z]+$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate example id: ${item.id}`);
    ids.add(item.id);
    if (!['dom', 'react'].includes(item.kind) || !/^[A-Za-z]+$/.test(item.export)) throw new Error(`Invalid example entry: ${item.id}`);
    const snippet = examples(readFileSync(resolve(root, item.source), 'utf8'))[item.snippet];
    if (!snippet || !snippet.code.includes(`export function ${item.export}(`)) throw new Error(`Missing runnable export for ${item.id}`);
    return { ...item, code: snippet.code, language: snippet.language };
  });
}

export function generateLiveExamples(output, definitions) {
  mkdirSync(resolve(output, 'examples'), { recursive: true });
  writeFileSync(resolve(output, 'examples.json'), `${JSON.stringify(definitions, null, 2)}\n`);
  const loaders = [];
  for (const item of definitions) {
    writeFileSync(resolve(output, `examples/${item.id}.${item.language}`), item.code);
    if (item.kind === 'dom') {
      writeFileSync(resolve(output, `examples/${item.id}-view.tsx`), `import React, { useEffect, useRef } from 'react';
import { ${item.export} } from './${item.id}';
export default function DomExample() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (host.current) return ${item.export}(host.current); }, []);
  return <div ref={host} className="sample-prose" />;
}\n`);
      loaders.push(`${JSON.stringify(item.id)}: lazy(() => import('./${item.id}-view'))`);
    } else {
      loaders.push(`${JSON.stringify(item.id)}: lazy(() => import('./${item.id}').then(module => ({ default: module.${item.export} })))`);
    }
  }
  writeFileSync(resolve(output, 'examples/registry.tsx'), `import { lazy, type ComponentType } from 'react';\nexport const samples: Record<string, ComponentType> = {\n${loaders.join(',\n')}\n};\n`);
}
