// Application build only. Publication still uses the official Sites build/source/package helpers.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const app = dirname(here);
const run = mode => execFileSync('pnpm', ['exec', 'vite', 'build', '--config', 'cloud-workspace/vite.config.ts', ...(mode ? ['--mode', mode] : [])], { cwd: app, stdio: 'inherit' });
run(); run('api');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const assets = {};
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else assets[`/${relative(join(here, 'dist/client'), path)}`] = {
      body: readFileSync(path).toString('base64'), type: types[extname(path)] ?? 'application/octet-stream'
    };
  }
}
visit(join(here, 'dist/client'));
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/entry.mjs'), `import { createWorker } from '../worker.ts';\nexport default createWorker(${JSON.stringify(assets)});\n`);
run('worker');
console.log('Application Worker: apps/note/cloud-workspace/dist/server/index.js');
console.log('Sites identity manifest and official generated D1 migrations must be added by the publisher.');
