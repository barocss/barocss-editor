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
 * ## Why a zero is not by itself good news — 2026-09-05
 *
 * `editor-view-dom` read `0 / 0` and was green, and its forty-three test files had
 * never been compiled. `tsconfig.typecheck.json` named them in `include`, and the
 * `tsconfig.json` it extends excludes a `.test.ts` glob so that `vite build` keeps
 * tests out of `dist`. `exclude` is not merged with a child's `include` — the parent's
 * is taken whole and filters whatever `include` matched — so the inherited line
 * deleted every file the config had just asked for. Ten packages had it, and `dsl`
 * had a second spelling of the same thing: its tests live in `tests` and the pattern
 * said `test`. Seventy-seven test files named and none compiled.
 *
 * The budget could not see any of it, because a budget counts errors and an empty
 * program has none. So this now counts **files** as well as errors, and three things
 * fail beside the two it already had:
 *
 *   blind        a target whose program is missing test files that exist on disk
 *   unbudgeted   a `tsconfig.typecheck.json` with no line in the budgets file, so the
 *                run walks past it (found: `office-note`, three unchecked files)
 *   unguarded    a package or app that has tests and no typecheck config at all
 *
 * A zero over an empty program is the worst kind of budget above the truth: not slack,
 * but a number that means nothing at all.
 *
 * Usage:
 *   node scripts/typecheck-tests.mjs                 every package
 *   node scripts/typecheck-tests.mjs office-slides   one of them, with the errors
 *   node scripts/typecheck-tests.mjs --adopt         lower every budget that shrank
 */

import { runCompiler } from './checks/compiler.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetsPath = join(root, 'typecheck-budgets.json');
const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));

const argv = process.argv.slice(2);
const adopt = argv.includes('--adopt');
const only = argv.find((arg) => !arg.startsWith('-'));
const targets = Object.keys(budgets).filter(
  (where) => !only || where === only || where.endsWith(`/${only}`)
);
if (only && targets.length === 0) {
  console.error(`No such target: ${only}\n  known: ${Object.keys(budgets).join(', ')}`);
  process.exit(2);
}

/**
 * Directories that have tests and no `tsconfig.typecheck.json`, named so that a *new*
 * one is a failure rather than a silence. Delete a line when it gets a config, and the
 * check will tell you if you delete one that still has none.
 *
 * **Empty since 2026-09-06.** The three demonstration apps that were the whole list —
 * `apps/editor-react` (7 specs), `apps/editor-test` (1), `apps/note` (2) — were given
 * configs and measured: 0, 12, 0. Eleven of the twelve are `apps/editor-test`'s own
 * `src/main.ts`, which had never been compiled by anything either, so the debt the
 * list was holding open turned out to be a tenth of what a reader would have guessed
 * from "ten unguarded specs".
 *
 * The set stays, empty, because the check on it is the point: a new directory with
 * tests and no config now fails immediately, and there is no longer any line here for
 * a new one to hide behind.
 */
const KNOWN_UNGUARDED = new Set([]);

const isTest = (name) => /\.(test|spec)\.tsx?$/.test(name);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.git']);

/** Every test file under a directory, which is the number the program has to match. */
function testFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const at = join(dir, name);
    if (statSync(at).isDirectory()) testFilesUnder(at, out);
    else if (isTest(name)) out.push(at);
  }
  return out;
}

/**
 * The run's own list of targets has to be true as well: a config nothing budgets, and
 * a package with tests and no config, are both invisible to every count below.
 */
function coverageFaults() {
  const faults = [];
  for (const group of ['packages', 'apps']) {
    const parent = join(root, group);
    if (!existsSync(parent)) continue;
    for (const name of readdirSync(parent)) {
      const at = join(parent, name);
      if (!statSync(at).isDirectory() || SKIP_DIRS.has(name)) continue;
      const where = `${group}/${name}`;
      const hasConfig = existsSync(join(at, 'tsconfig.typecheck.json'));
      const tests = testFilesUnder(at).length;
      if (hasConfig && !(where in budgets)) {
        faults.push(`unbudgeted  ${where} — has a typecheck config and no line in typecheck-budgets.json (${tests} test files the run walks past)`);
      }
      if (!hasConfig && tests > 0 && !KNOWN_UNGUARDED.has(where)) {
        faults.push(`unguarded   ${where} — ${tests} test files and no tsconfig.typecheck.json`);
      }
      if (hasConfig && KNOWN_UNGUARDED.has(where)) {
        faults.push(`stale       ${where} — now has a typecheck config; delete it from KNOWN_UNGUARDED`);
      }
    }
  }
  return faults;
}

/**
 * The error lines tsc printed, and the test files it actually opened.
 *
 * `--listFiles` is what makes the second half possible, and it costs nothing: the same
 * compilation prints the program's file list beside its diagnostics, so the check can
 * ask *did you read the tests* rather than only *what did you find in them*. Without
 * it a config that names no files is indistinguishable from a config that finds no
 * errors, which is exactly how forty-three files stayed unread behind a green `0 / 0`.
 */
function errorsIn(where) {
  const at = join(root, where);
  if (!existsSync(join(at, 'tsconfig.typecheck.json'))) {
    return { failed: `${where} has no tsconfig.typecheck.json` };
  }
  const { out, failure } = runCompiler(at, ['--noEmit', '--listFiles', '-p', 'tsconfig.typecheck.json']);
  if (failure) return { failed: failure };
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
  const printed = out.split('\n');
  const lines = printed
    .filter((line) => / error TS\d+/.test(line))
    .filter((line) => !line.startsWith('..'));

  /** This package's own test files, as the compiler listed them. */
  const read = new Set(
    printed
      .map((line) => line.trim())
      .filter((line) => isTest(line))
      .map((line) => relative(at, line))
      .filter((line) => line && !line.startsWith('..') && !line.split(sep).some((p) => SKIP_DIRS.has(p)))
  );
  const onDisk = testFilesUnder(at).map((file) => relative(at, file));
  const unread = onDisk.filter((file) => !read.has(file));
  return { lines, read: read.size, unread };
}

let worst = 0;
const rows = [];

// Only on a full run: naming one target is a question about that target, not a claim
// about the repository, and a coverage fault elsewhere would be noise in the answer.
const faults = only ? [] : coverageFaults();
if (faults.length > 0) worst = 1;

for (const where of targets) {
  const allowed = budgets[where];
  const { lines, unread, failed } = errorsIn(where);
  if (failed) {
    rows.push({ where, allowed, found: '?', note: failed });
    worst = 2;
    continue;
  }

  const found = lines.length;
  const state =
    unread.length > 0 ? 'blind' : found === allowed ? 'ok' : found > allowed ? 'grew' : 'shrank';
  if (state !== 'ok') worst = 1;
  rows.push({ where, allowed, found, state, unread });

  // The errors themselves, when there is something to act on and one target was named
  // — or when a pile grew, which is the case somebody has to read right now.
  if (state === 'grew' || (only && found > 0)) {
    for (const line of lines.slice(0, only ? lines.length : 20)) console.log(`    ${line}`);
  }
}

const MARKS = { ok: '·', grew: '✗', shrank: '↓', blind: '?' };
const width = Math.max(...rows.map((row) => row.where.length));
console.log('');
for (const row of rows) {
  const mark = MARKS[row.state] ?? '?';
  console.log(
    `${mark} ${row.where.padEnd(width)}  ${String(row.found).padStart(4)} / ${row.allowed}` +
      (row.state === 'blind' ? `  ${row.unread.length} test files not compiled` : '') +
      (row.note ? `  ${row.note}` : '')
  );
}

const blind = rows.filter((row) => row.state === 'blind');
const grew = rows.filter((row) => row.state === 'grew');
const shrank = rows.filter((row) => row.state === 'shrank');

if (blind.length > 0) {
  console.log(
    `\n${blind.length} package(s) have test files the compiler never opened:\n` +
      blind
        .map(
          (row) =>
            `  ${row.where}: ${row.unread.length} unread` +
            `\n${row.unread.slice(0, 5).map((file) => `      ${file}`).join('\n')}` +
            (row.unread.length > 5 ? `\n      … and ${row.unread.length - 5} more` : '')
        )
        .join('\n') +
      `\nCheck the config's own \`exclude\`: it is taken whole from whatever it extends,` +
      `\nand a parent that keeps tests out of \`dist\` will take them out of here too.` +
      `\nThe number beside such a package is not a budget — it is a count of nothing.`
  );
}
if (faults.length > 0) {
  console.log(
    `\n${faults.length} target(s) the run cannot see at all:\n` +
      faults.map((fault) => `  ${fault}`).join('\n') +
      `\nA list of what is guarded is itself a claim, and this is the check on it.`
  );
}
if (grew.length > 0) {
  console.log(
    `\n${grew.length} package(s) type-check worse than they are allowed to:\n` +
      grew.map((row) => `  ${row.where}: ${row.found}, allowed ${row.allowed}`).join('\n') +
      `\nA test the compiler cannot read is a claim nothing checked.`
  );
}
if (shrank.length > 0) {
  /**
   * Lowering is mechanical — the number is whatever the run just measured — and a
   * failure that can only be cleared by hand-editing a file gets cleared by hand
   * *badly*, or gets cleared by raising the wrong line. `--adopt` writes exactly the
   * numbers this run found, and only downwards: it can close a shrink and can never
   * open room for a growth.
   */
  if (adopt) {
    for (const row of shrank) budgets[row.where] = row.found;
    writeFileSync(budgetsPath, `${JSON.stringify(budgets, null, 2)}\n`);
    console.log(
      `\n${shrank.length} budget(s) lowered in typecheck-budgets.json:\n` +
        shrank.map((row) => `  ${row.where}: ${row.allowed} → ${row.found}`).join('\n')
    );
    worst = rows.some((row) => row.note || row.state === 'grew' || row.state === 'blind') || faults.length > 0 ? 1 : 0;
  } else {
    console.log(
      `\n${shrank.length} package(s) improved and their budgets did not — this fails:\n` +
        shrank.map((row) => `  ${row.where}: ${row.allowed} → ${row.found}`).join('\n') +
        `\nA budget above the truth leaves room to break exactly that much again, quietly.` +
        `\nRun \`pnpm type-check:tests --adopt\` to write the numbers this run measured.`
    );
  }
}
if (worst === 0) console.log('\nEvery package is where it says it is.');

process.exit(worst);
