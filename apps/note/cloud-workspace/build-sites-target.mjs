// Run only inside the separately opened Sites source checkout. This preserves its .git history.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVite } from './build-vite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = join(root, '.openai/hosting.json');
if (!existsSync(manifestPath)) throw new Error('Publisher must copy the registered app hosting manifest to the Sites source root first.');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const registered = JSON.parse(readFileSync(join(here, '.openai/hosting.json'), 'utf8'));
if (manifest.project_id !== registered.project_id || manifest.d1 !== 'DB' || manifest.r2 !== null || manifest.static) {
  throw new Error('The Sites source manifest must retain the registered private Site ID and Worker/D1 configuration.');
}
// @barocss/schema's build script is `vite build`; resolve its own installed CLI.
buildVite(join(root, 'packages/schema'));
execFileSync(process.execPath, [join(here, 'build-worker.mjs')], { cwd: root, stdio: 'inherit' });
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
copyImmutable(join(here, 'drizzle'), join(root, 'drizzle'));
console.log('Sites application output staged at dist/server/index.js; official packaging owns the archive and migration inclusion.');
