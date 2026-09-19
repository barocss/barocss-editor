import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A name this package's dependency already exports must not be declared here again.
 *
 * ## Why a check exists when the fix was structural
 *
 * Sixteen names were declared in both `@barocss/dsl` and this package. Eight had drifted:
 * `ElementAttributes` had lost `key` and its tag-typed attributes, `ElementChild` had become `any`,
 * `ExternalComponent` had lost the `type: 'external'` tag the registry sorts on, and
 * `ComponentInstance` described an object with three methods the producer never sets. The merge
 * replaced every one of them with a re-export, which cannot drift.
 *
 * So this does not guard the sixteen — nothing can un-re-export them without deleting the line.
 * It guards the **seventeenth**: the next time someone needs `ElementChild` in a file here and
 * writes `export type ElementChild = …` at the top rather than importing it, this fails and names
 * the file. That is exactly how the sixteen arrived, one at a time, each one reasonable.
 *
 * ## Why structural typing is the reason it matters
 *
 * Two declarations of one name do not collide. They pass for each other in most positions, so the
 * compiler stays silent while a value built to one shape is read through the other — and that
 * silence is only broken when the shapes differ in a field somebody happens to touch. Every one of
 * the eight had been diverged for a long time; none of them had ever produced an error.
 */

// The runner's cwd is this package's root; jsdom leaves `import.meta.url` unusable as a path.
const packageRoot = process.cwd();
const rendererSrc = join(packageRoot, 'src');
const dslSrc = join(packageRoot, '..', 'dsl', 'src');

/** Every `.ts`/`.tsx` file under a directory. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * The names a file *declares* — not the ones it passes through.
 *
 * `export type { X } from '…'` and `export { X }` are re-exports: one declaration, elsewhere. Only
 * `export type X =`, `export interface X`, `export class X` and `export enum X` make a second one.
 */
function declaredNames(file: string): Map<string, number> {
  const found = new Map<string, number>();
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(interface|type|class|enum)\s+([A-Za-z0-9_]+)/.exec(line);
      if (m) found.set(m[2], i + 1);
    });
  return found;
}

/** What `@barocss/dsl` puts in a consumer's namespace. */
function dslPublicNames(): Set<string> {
  const index = readFileSync(join(dslSrc, 'index.ts'), 'utf8');
  const names = new Set<string>();
  for (const block of index.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const raw of block[1].split(',')) {
      const one = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      // Comment lines inside the export block are not names.
      if (one && /^[A-Za-z_][A-Za-z0-9_]*$/.test(one)) names.add(one);
    }
  }
  return names;
}

describe('one name, one declaration', () => {
  it('the DSL exports a vocabulary worth colliding with', () => {
    // If this ever collapses to a handful, the check below has quietly stopped asking anything.
    expect(dslPublicNames().size).toBeGreaterThan(30);
  });

  it('no file in renderer-dom declares a name @barocss/dsl already exports', () => {
    const fromDsl = dslPublicNames();
    const collisions: string[] = [];

    for (const file of filesUnder(rendererSrc)) {
      for (const [name, line] of declaredNames(file)) {
        if (fromDsl.has(name)) {
          collisions.push(`${relative(rendererSrc, file)}:${line} declares ${name}, which @barocss/dsl exports`);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it('and the names it used to declare are still reachable from this package', () => {
    // The merge must not have narrowed the public surface: every one of the sixteen was exported
    // from here before, and something outside could be reading any of them.
    const surface = readFileSync(join(rendererSrc, 'types.ts'), 'utf8');
    const theSixteen = [
      'ClassNameType', 'ElementAttributes', 'DataValue', 'ComponentProps', 'ComponentState',
      'ExternalComponent', 'ElementTag', 'ElementTagGetter', 'AttrBinding', 'ComponentInstance',
      'SimpleComponent', 'ContextualComponent', 'ComponentContext', 'RenderTemplate',
      'ElementChild', 'TNodeType'
    ];
    const missing = theSixteen.filter((name) => !new RegExp(`\\b${name}\\b`).test(surface));
    expect(missing).toEqual([]);
  });
});
