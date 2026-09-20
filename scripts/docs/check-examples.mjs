import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogue, examples, root } from './catalogue.mjs';
import { digest, run } from '../npm/packages.mjs';

// Use the same built public artifacts as the npm consumer check, never source aliases.
const batch = JSON.parse(readFileSync(resolve(root, 'output/npm/latest.json'), 'utf8')).directory;
const report = JSON.parse(readFileSync(resolve(batch, 'manifest.json'), 'utf8'));
mkdirSync(resolve(root, 'output/docs'), { recursive: true });
const directory = mkdtempSync(resolve(root, 'output/docs/examples-'));
const dependencies = { react: '18.3.1', 'react-dom': '18.3.1' };
for (const entry of report.packages) {
  const file = resolve(batch, entry.file);
  if (digest(file) !== entry.sha256) throw new Error(`Changed package archive: ${entry.name}`);
  dependencies[entry.name] = `file:${file}`;
}
let count = 0;
for (const { directory: name, manifest, readme } of catalogue()) {
  if (!report.packages.some((entry) => entry.name === manifest.name && entry.version === manifest.version)) throw new Error(`Rebuild package artifacts for ${manifest.name}`);
  for (const [index, snippet] of examples(readme).entries()) {
    writeFileSync(resolve(directory, `${name}-${index}.${snippet.language}`), `${snippet.code}\nexport {};\n`);
    count++;
  }
}
for (const name of ['quick-start', 'guides/react-editor', 'guides/schema-editing']) {
  const page = readFileSync(resolve(root, `apps/docs-site/docs/${name}.md`), 'utf8');
  for (const [index, snippet] of examples(page).entries()) {
    writeFileSync(resolve(directory, `${name.replaceAll('/', '-')}-${index}.${snippet.language}`), `${snippet.code}\nexport {};\n`);
    count++;
  }
}
writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies, devDependencies: { typescript: '5.9.3', '@types/react': '18.3.31', '@types/react-dom': '18.3.7', vite: '5.4.21', '@vitejs/plugin-react': '4.3.4', tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' } }, null, 2));
writeFileSync(resolve(directory, 'assets.d.ts'), "declare module '*.css';\n");
writeFileSync(resolve(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, noEmit: true, jsx: 'react-jsx', lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['*.ts', '*.tsx'] }));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `--cache=${resolve(root, 'output/docs/npm-cache')}`, '--registry=https://registry.npmjs.org'], directory, { stdio: 'inherit' });
run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], directory, { stdio: 'inherit' });
console.log(`Documentation examples passed: ${count} complete TypeScript/TSX examples against ${report.packages.length} packaged libraries.`);

// Build the documented Office CSS recipe with the extracted React examples.
const styling = readFileSync(resolve(root, 'apps/docs-site/docs/guides/office-styling.md'), 'utf8');
const css = styling.match(/^```css\n([\s\S]*?)^```/m)?.[1];
const vite = styling.match(/^```js\n([\s\S]*?)^```/m)?.[1];
if (!css || !vite) throw new Error('Office styling guide must contain the complete CSS and Vite configuration');
mkdirSync(resolve(directory, 'src'));
writeFileSync(resolve(directory, 'src/styles.css'), css);
writeFileSync(resolve(directory, 'vite.config.mjs'), vite);
writeFileSync(resolve(directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Documentation consumer check</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
writeFileSync(resolve(directory, 'src/main.tsx'), `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Note } from '../office-note-0';
import { RenameDocument } from '../office-ui-0';
import { DocumentEditor } from '../guides-react-editor-0';
import './styles.css';
createRoot(document.getElementById('root')!).render(<main><h1>Documentation consumer check</h1><RenameDocument /><h2>Note</h2><Note /><h2>React editor</h2><DocumentEditor /></main>);
`);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], directory, { stdio: 'inherit' });
console.log(`Office styling recipe built with packaged libraries. Browser fixture: ${directory}`);
