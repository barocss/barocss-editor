import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function compilerResult(run) {
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  let failure = null;
  if (run.error) failure = run.error.message;
  else if (run.signal) failure = `TypeScript terminated by ${run.signal}`;
  else if (/^error TS\d+:/m.test(out)) failure = 'TypeScript configuration or command error';
  else if (run.status !== 0 &&
    (![1, 2].includes(run.status) || !/\(\d+,\d+\): error TS\d+:/m.test(out))) {
    failure = `TypeScript failed without file diagnostics (exit ${run.status})`;
  }
  return { out, failure: failure && `${failure}\n${out.trim().slice(0, 2000)}` };
}

export function runCompiler(cwd, args) {
  // Use the installed compiler and the current Node runtime. Never download via npx.
  return compilerResult(spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'),
    '--pretty', 'false', ...args], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }));
}
