import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { compilerResult, runCompiler } from './compiler.mjs';
import { lintEntries, compareLint } from './lint-baseline.mjs';

test('compiler distinguishes process failure from budgeted file diagnostics', () => {
  const diagnostic = 'src/example.ts(1,1): error TS2322: Type mismatch';
  for (const run of [
    { error: new Error('spawn ENOENT') },
    { status: null, signal: 'SIGTERM', stdout: diagnostic },
    { status: 1, stderr: 'dependency missing' },
    { status: 137, stdout: diagnostic },
    { status: 1, stdout: "error TS5058: The specified path does not exist" },
    { status: 2, stdout: `${diagnostic}\nerror TS18003: No inputs were found` },
  ]) assert.ok(compilerResult(run).failure);
  assert.equal(compilerResult({ status: 0, stdout: '' }).failure, null);
  assert.equal(compilerResult({ status: 2, stdout: diagnostic }).failure, null);
});

test('installed compiler accepts valid code, reports errors and rejects missing projects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wonffice-compiler-'));
  try {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { noEmit: true, types: [] }, files: ['sample.ts'],
    }));
    writeFileSync(join(dir, 'sample.ts'), 'const count: number = 1;');
    const valid = runCompiler(dir, ['-p', 'tsconfig.json']);
    assert.equal(valid.failure, null);
    assert.equal(valid.out, '');
    writeFileSync(join(dir, 'sample.ts'), 'const count: number = "wrong";');
    const invalid = runCompiler(dir, ['-p', 'tsconfig.json']);
    assert.equal(invalid.failure, null);
    assert.match(invalid.out, /error TS2322/);
    assert.ok(runCompiler(dir, ['-p', 'missing.json']).failure);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lint reports new errors even when another existing error was fixed', async () => {
  const eslint = new ESLint();
  const root = process.cwd();
  const filePath = join(root, 'scripts/checks/example.ts');
  const first = lintEntries(await eslint.lintText('const oldUnused = 1;', { filePath }), root);
  const second = lintEntries(await eslint.lintText('const newUnused = 1;', { filePath }), root);
  assert.equal(first.length, 1);
  assert.equal(compareLint(first, first).grew.length, 0);
  assert.equal(compareLint(second, first).grew.length, 1);
  assert.equal(compareLint(second, first).shrank.length, 1);
  assert.equal(compareLint([], first).shrank.length, 1);
  assert.equal(compareLint([{ ...first[0], count: 2 }], first).grew.length, 1);
});

test('lint baseline is location-independent and parser errors cannot be excused', async () => {
  const eslint = new ESLint();
  const root = process.cwd();
  const filePath = join(root, 'scripts/checks/example.ts');
  const lint = async code => lintEntries(await eslint.lintText(code, { filePath }), root);
  assert.deepEqual(await lint('const unused = 1;'), await lint('\n\nconst unused = 1;'));
  await assert.rejects(lint('const = ;'));
  const entry = (await lint('const unused = 1;'))[0];
  assert.throws(() => compareLint([], [entry, entry]));
  assert.throws(() => compareLint([], [{ ...entry, count: -1 }]));
});
