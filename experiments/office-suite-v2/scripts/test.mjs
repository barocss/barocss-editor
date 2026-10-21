import { spawnSync } from 'node:child_process';
import { inputs, requireRuntime, root } from './paths.mjs';

requireRuntime();
const files = inputs(process.argv.slice(2), file => /\.(?:test|spec)\.ts$/.test(file));
console.log(`Native Node TypeScript tests: ${files.length} files.`);
const child = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', '--test-concurrency=1', '--test-reporter=tap', ...files,
], { cwd: root, stdio: 'inherit' });
if (child.error) throw child.error;
if (child.signal) console.error(`Test runner terminated by ${child.signal}.`);
process.exitCode = child.status ?? 1;
