import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const groups = JSON.parse(readFileSync(resolve(root, 'scripts/docs/groups.json'), 'utf8'));
export const groupOrder = ['Products', 'Shared Office UI', 'Shared Office Behavior', 'Foundations', 'Collaboration', 'Tools'];
export function packages() {
  return readdirSync(resolve(root, 'packages')).sort().map((directory) => {
    const path = resolve(root, 'packages', directory);
    const manifest = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
    const readme = readFileSync(resolve(path, 'README.md'), 'utf8');
    return { directory, path, manifest, readme, group: groups[directory] };
  });
}
export function examples(markdown) {
  return [...markdown.matchAll(/^```(tsx?|typescript)(?:[^\n]*)\n([\s\S]*?)^```\s*$/gm)]
    .map((match) => ({ language: match[1] === 'typescript' ? 'ts' : match[1], code: match[2] }));
}
export function validatePackage({ manifest, readme, group }) {
  const problems = [];
  if (!readme.startsWith(`# ${manifest.name}\n`)) problems.push('README title must match the package name');
  if (/[\uac00-\ud7af]/u.test(readme)) problems.push('The canonical package README must use English');
  if (manifest.private) return problems;
  if (!groupOrder.includes(group)) problems.push('Missing package catalogue group');
  for (const heading of ['Purpose', 'Install', 'Public entry points', 'Usage', 'Integration notes', 'Documentation', 'License']) {
    if (!readme.includes(`\n## ${heading}\n`)) problems.push(`Missing ${heading} section`);
  }
  if (!examples(readme).length) problems.push('Missing a TypeScript usage example');
  for (const subpath of Object.keys(manifest.publishConfig?.exports ?? manifest.exports ?? {})) {
    const name = manifest.name + (subpath === '.' ? '' : subpath.slice(1));
    if (!readme.includes(`| \`${name}\` |`)) problems.push(`Missing public entry: ${name}`);
  }
  return problems;
}
export function catalogue() {
  const all = packages();
  const problems = all.flatMap((entry) => validatePackage(entry).map((problem) => `${entry.manifest.name}: ${problem}`));
  for (const directory of Object.keys(groups)) {
    if (!all.some((entry) => entry.directory === directory && !entry.manifest.private)) problems.push(`Stale public package group: ${directory}`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return all.filter(({ manifest }) => !manifest.private);
}
