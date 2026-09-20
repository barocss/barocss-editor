import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogue, examples, groupOrder, root } from './catalogue.mjs';

const entries = catalogue();
if (process.argv.includes('--check')) {
  console.log(`Documentation coverage passed: ${entries.length} public packages and the private release marker.`);
} else {
  const output = resolve(root, 'apps/docs-site/.generated');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(resolve(output, 'packages'), { recursive: true });
  const demo = examples(readFileSync(resolve(root, 'apps/docs-site/docs/quick-start.md'), 'utf8'));
  if (demo.length !== 1) throw new Error('Quick start must contain one complete demo');
  writeFileSync(resolve(output, 'quick-start.ts'), demo[0].code);
  const summary = [...entries].sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)).map(({ directory, manifest, readme, group }) => ({
    id: directory, name: manifest.name, version: manifest.version, group,
    description: readme.split('\n\n')[1],
  }));
  writeFileSync(resolve(output, 'catalogue.json'), `${JSON.stringify(summary, null, 2)}\n`);
  let index = `---\ntitle: Package catalogue\nslug: /\nsidebar_position: 0\nmdx:\n  format: md\n---\n\n# Package catalogue\n\n${entries.length} public libraries. Choose a product kit, compose shared Office UI, or build directly on the editor foundations. Versions below come from this checkout's package manifests.\n\nPackage guides reuse the canonical English README in each package. The private product release marker is not an npm library.\n`;
  for (const [position, group] of groupOrder.entries()) {
    const folder = `${position + 1}-${group.toLowerCase().replaceAll(' ', '-')}`;
    mkdirSync(resolve(output, 'packages', folder), { recursive: true });
    writeFileSync(resolve(output, 'packages', folder, '_category_.json'), JSON.stringify({ label: group, position: position + 1 }));
    index += `\n## ${group}\n\n| Package | Version | Purpose |\n| --- | --- | --- |\n`;
    for (const entry of entries.filter((entry) => entry.group === group)) {
      const { directory, manifest, readme } = entry;
      index += `| [${manifest.name}](/packages/${directory}) | ${manifest.version} | ${readme.split('\n\n')[1]} |\n`;
      const content = readme.replace(/^# [^\n]+\n/, '').replaceAll('https://editor.barocss.com/', '/');
      writeFileSync(resolve(output, 'packages', folder, `${directory}.md`), `---\ntitle: ${JSON.stringify(manifest.name)}\nslug: /${directory}\ncustom_edit_url: https://github.com/barocss/barocss-editor/edit/main/packages/${directory}/README.md\nmdx:\n  format: md\n---\n\n> Version in this checkout: **${manifest.version}**. [npm](https://www.npmjs.com/package/${manifest.name}) · [Source](https://github.com/barocss/barocss-editor/tree/main/packages/${directory})\n${content}`);
    }
  }
  writeFileSync(resolve(output, 'packages/index.md'), index);
  console.log(`Generated ${entries.length} package guides from README files and package manifests.`);
}
