#!/usr/bin/env node
/**
 * Type-check every package's tests, and hold the pile to a number.
 *
 * ## The hole this closes
 *
 * `tsconfig.json` is the build's — `vite build` reads it — so every package's
 * `include` was `src/**` only, and the tests of twenty-two packages were never read
 * by the compiler. An app had no `type-check` script at all, so neither its source
 * nor its Playwright specs were either.
 *
 * That is not a tidiness question. A test is the thing that says the code is right, and a
 * test the compiler never reads is a claim nothing checked. Measured: a field written
 * on an object with no such field (`hit.needs` on an `AuditHit`) passed twenty-five
 * green tests, and one of Word's spec files has nineteen more of exactly that.
 *
 * ## Why a budget and not "fix it all"
 *
 * There are 1,359 of them. Written reasons would be 1,359 notes, and a note rots —
 * the same argument the conformance harness is built on, so the same instrument: a
 * count that may not grow, and that **must be lowered when it shrinks**. A number
 * left above the truth leaves room to break exactly that many things again, quietly.
 *
 * Most packages are at 0, and for those this is an ordinary guard.
 *
 * Usage:
 *   node scripts/typecheck-tests.mjs                 every package
 *   node scripts/typecheck-tests.mjs office-slides   one of them, with the errors
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgets = JSON.parse(readFileSync(join(root, 'typecheck-budgets.json'), 'utf8'));

const only = process.argv[2];
const targets = Object.keys(budgets).filter(
  (where) => !only || where === only || where.endsWith(`/${only}`)
);
if (only && targets.length === 0) {
  console.error(`No such target: ${only}\n  known: ${Object.keys(budgets).join(', ')}`);
  process.exit(2);
}

/** The error lines tsc printed, which is the only output this reads. */
function errorsIn(where) {
  const at = join(root, where);
  if (!existsSync(join(at, 'tsconfig.typecheck.json'))) {
    return { failed: `${where} has no tsconfig.typecheck.json` };
  }
  let out = '';
  try {
    out = execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.typecheck.json'], {
      cwd: at,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    // tsc exits non-zero when it finds anything, which is the normal case here.
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  /**
   * This package's own files, and nothing above it.
   *
   * A package imports its siblings through `paths`, so tsc compiles their **source**
   * too — and several packages switch the unused-symbol checks off in their own
   * config. Left in, ninety-five of `office-slides`'s hundred and seventy-four errors
   * were other packages' unused locals: a guard reporting somebody else's decision,
   * which is noise a reader learns to scroll past.
   *
   * tsc prints a path relative to the project, so a sibling's file starts with `..`.
   */
  const lines = out
    .split('\n')
    .filter((line) => / error TS\d+/.test(line))
    .filter((line) => !line.startsWith('..'));
  return { lines };
}

let worst = 0;
const rows = [];

for (const where of targets) {
  const allowed = budgets[where];
  const { lines, failed } = errorsIn(where);
  if (failed) {
    rows.push({ where, allowed, found: '?', note: failed });
    worst = 2;
    continue;
  }

  const found = lines.length;
  const state = found === allowed ? 'ok' : found > allowed ? 'grew' : 'shrank';
  if (state !== 'ok') worst = 1;
  rows.push({ where, allowed, found, state });

  // The errors themselves, when there is something to act on and one target was named
  // — or when a pile grew, which is the case somebody has to read right now.
  if (state === 'grew' || (only && found > 0)) {
    for (const line of lines.slice(0, only ? lines.length : 20)) console.log(`    ${line}`);
  }
}

const width = Math.max(...rows.map((row) => row.where.length));
console.log('');
for (const row of rows) {
  const mark = row.state === 'ok' ? '·' : row.state === 'grew' ? '✗' : '↓';
  console.log(
    `${mark} ${row.where.padEnd(width)}  ${String(row.found).padStart(4)} / ${row.allowed}` +
      (row.note ? `  ${row.note}` : '')
  );
}

const grew = rows.filter((row) => row.state === 'grew');
const shrank = rows.filter((row) => row.state === 'shrank');

if (grew.length > 0) {
  console.log(
    `\n${grew.length} package(s) type-check worse than they are allowed to:\n` +
      grew.map((row) => `  ${row.where}: ${row.found}, allowed ${row.allowed}`).join('\n') +
      `\nA test the compiler cannot read is a claim nothing checked.`
  );
}
if (shrank.length > 0) {
  console.log(
    `\n${shrank.length} package(s) improved — lower the number in typecheck-budgets.json:\n` +
      shrank.map((row) => `  ${row.where}: ${row.allowed} → ${row.found}`).join('\n') +
      `\nA budget above the truth leaves room to break exactly that much again, quietly.`
  );
}
if (worst === 0) console.log('\nEvery package is where it says it is.');

process.exit(worst);
