/**
 * Type-check every package and app that has a `tsconfig.json`.
 *
 * ## Why this exists
 *
 * `pnpm test` runs vitest, and **vitest does not type-check**. So a change can ship a type error and
 * every suite in the repository stays green — which is exactly what happened: a renderer was given a
 * `spellcheck` attribute the DSL's element types did not declare, 4,700 tests passed, and the error
 * sat in `office-text` for a commit until the next unrelated `tsc` run in that package found it.
 *
 * Running `tsc` per package by hand does not close it either, for the same reason a ratchet that
 * lives in one package does not: what a change touches and what a change breaks are different sets.
 *
 * Reports every failing project rather than stopping at the first, because the useful output is the
 * whole list.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const projects = ['packages', 'apps'].flatMap((where) => {
  const dir = join(root, where);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(where, name))
    .filter((one) => existsSync(join(root, one, 'tsconfig.json')));
});

/**
 * The projects that do **not** type-check today, and why.
 *
 * A claim rather than a skip, which is this repository's vocabulary for exactly this: an entry that
 * starts passing is reported as **stale** and has to be deleted, so the list can only shrink. All
 * three are demo apps that predate the three products and none of them is built or shipped; the
 * errors are stale imports and a missing dependency, not something the packages did.
 */
const KNOWN = {
  'apps/docs-site': 'a docusaurus site missing `prism-react-renderer`; not part of the suite',
  'apps/editor-decorator-test': 'imports four decorator operations `@barocss/model` no longer exports',
  'apps/editor-test': 'the original scratch app: `window.__editor` and pre-DSL element calls'
};

let failed = 0;
const stale = [];
for (const project of projects) {
  const run = spawnSync('npx', ['tsc', '--noEmit', '-p', project], { cwd: root, encoding: 'utf8' });
  /*
   * Only this project's own files. A composite build reports errors from everything it references,
   * so a package with no fault of its own would fail on a neighbour's and every project would blame
   * every other one.
   */
  const mine = (run.stdout ?? '')
    .split('\n')
    .filter((line) => line.startsWith(project + '/'));

  const known = KNOWN[project];
  if (mine.length > 0) {
    if (known) {
      console.log(`· ${project} — known: ${known}`);
      continue;
    }
    failed += 1;
    console.log(`\n✗ ${project}`);
    for (const line of mine.slice(0, 20)) console.log('   ' + line);
    if (mine.length > 20) console.log(`   … and ${mine.length - 20} more`);
  } else {
    if (known) stale.push(project);
    console.log(`✓ ${project}`);
  }
}

if (stale.length > 0) {
  console.log(`\n${stale.length} entry(ies) in KNOWN no longer excuse anything — delete them:`);
  for (const project of stale) console.log(`   · ${project}`);
}
if (failed > 0 || stale.length > 0) {
  if (failed > 0) console.log(`\n${failed} project(s) do not type-check.`);
  process.exit(1);
}
console.log(`\n${projects.length} projects checked, ${Object.keys(KNOWN).length} known-broken.`);
