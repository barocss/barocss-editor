// Derived Sites source root only. Keep the registered Site, its D1 binding and migrations.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildVite } from '../../note/cloud-workspace/build-vite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const oldWorkspace = join(root, 'apps/note/cloud-workspace');
const manifestPath = join(root, '.openai/hosting.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const registered = JSON.parse(readFileSync(join(oldWorkspace, '.openai/hosting.json'), 'utf8'));
if (manifest.project_id !== registered.project_id || manifest.d1 !== 'DB' || manifest.r2 !== null || manifest.static) {
  throw new Error('Preserve the registered Site and existing Worker/D1 configuration.');
}
// Vite env priority makes this explicit even if the builder carries OIDC-mode variables.
process.env.VITE_OFFICE_AUTH_MODE = 'local';
process.env.VITE_OFFICE_NATIVE2_READ_BRIDGE = '';
process.env.VITE_OFFICE_NATIVE2_MUTATION_BRIDGE = '';
buildVite(join(root, 'packages/schema'));
buildVite(join(root, 'apps/office'), ['--mode', 'sites-local']);
const client = join(root, 'apps/office/dist');
for (const path of ['index.html', 'design-system/index.html', ...['note', 'word', 'slides', 'site'].map(product => `products/${product}/index.html`)]) {
  if (!existsSync(join(client, path))) throw new Error(`Original Office entry missing: ${path}`);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const assets = {};
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else assets[`/${relative(client, path)}`] = { body: readFileSync(path).toString('base64'), type: types[extname(path)] ?? 'application/octet-stream' };
  }
}
visit(client);
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/entry.mjs'), `import { createOfficeWorker } from '../worker.ts';\nexport default createOfficeWorker(${JSON.stringify(assets)});\n`);
buildVite(join(root, 'apps/office'), ['--config', 'sites/vite.config.ts', '--mode', 'sites-local']);
mkdirSync(join(root, 'dist/server'), { recursive: true });
mkdirSync(join(root, 'dist/.openai'), { recursive: true });
copyFileSync(join(here, 'dist/server/index.js'), join(root, 'dist/server/index.js'));
copyFileSync(manifestPath, join(root, 'dist/.openai/hosting.json'));
function copyImmutable(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) copyImmutable(from, to);
    else if (existsSync(to)) {
      if (!readFileSync(from).equals(readFileSync(to))) throw new Error(`Refusing to overwrite a different migration: ${to}`);
    } else copyFileSync(from, to);
  }
}
copyImmutable(join(oldWorkspace, 'drizzle'), join(root, 'drizzle'));
const worker = readFileSync(join(root, 'dist/server/index.js'));
console.log(JSON.stringify({ application: 'original apps/office', storage: 'original browser IndexedDB',
  assets: Object.keys(assets).length, workerBytes: worker.length, workerGzipBytes: gzipSync(worker).length }));
