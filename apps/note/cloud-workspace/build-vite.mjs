import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Use the target package's installed Vite and the current Node, without a PATH shim. */
export function buildVite(cwd, args = []) {
  const require = createRequire(join(cwd, 'package.json'));
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  execFileSync(process.execPath, [vite, 'build', ...args], { cwd, stdio: 'inherit' });
}
