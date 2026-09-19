import { relative } from 'node:path';

export function lintEntries(results, root) {
  const entries = new Map();
  for (const result of results) {
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      if (message.fatal) throw new Error(`${result.filePath}: ${message.message}`);
      const entry = {
        file: relative(root, result.filePath).replaceAll('\\', '/'),
        rule: message.ruleId,
        message: message.message,
      };
      const key = JSON.stringify(entry);
      const previous = entries.get(key);
      entries.set(key, { ...entry, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...entries.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}

export function compareLint(actual, baseline) {
  const key = ({ file, rule, message }) => JSON.stringify([file, rule, message]);
  const allowed = new Map();
  for (const entry of baseline) {
    if (typeof entry.file !== 'string' || typeof entry.message !== 'string' ||
      typeof entry.rule !== 'string' || !Number.isSafeInteger(entry.count) || entry.count < 1 ||
      allowed.has(key(entry))) throw new Error('Invalid or duplicate lint baseline entry');
    allowed.set(key(entry), entry);
  }
  const current = new Map(actual.map(entry => [key(entry), entry]));
  return {
    grew: actual.filter(entry => entry.count > (allowed.get(key(entry))?.count ?? 0)),
    shrank: baseline.filter(entry => entry.count > (current.get(key(entry))?.count ?? 0)),
  };
}
