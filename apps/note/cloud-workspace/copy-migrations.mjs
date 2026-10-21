import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** SQL/snapshots are immutable; only an exact-prefix append to the generated journal is allowed. */
export function copyImmutableMigrations(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) { copyImmutableMigrations(from, to); continue; }
    if (!existsSync(to) || readFileSync(from).equals(readFileSync(to))) { copyFileSync(from, to); continue; }
    if (entry.name === '_journal.json') {
      const old = JSON.parse(readFileSync(to, 'utf8')), next = JSON.parse(readFileSync(from, 'utf8'));
      if (old.version === next.version && old.dialect === next.dialect && Array.isArray(old.entries) && Array.isArray(next.entries) &&
        old.entries.length < next.entries.length && old.entries.every((value, index) => JSON.stringify(value) === JSON.stringify(next.entries[index]))) {
        copyFileSync(from, to); continue;
      }
    }
    throw new Error(`Refusing to overwrite a different migration: ${to}`);
  }
}
