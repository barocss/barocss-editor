import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, readProjectNoteSchemaPolicy } from '../src/config.js';
const roots: string[] = [];
const expectedPolicy = (value: unknown): unknown => JSON.parse(JSON.stringify(value), (_key, entry: unknown) =>
  entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? Object.assign(Object.create(null), entry) : entry);
afterEach(() => roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
it('keeps the existing server configuration shape and default closed policy', () => {
  expect(readConfig({})).toStrictEqual({ host: '127.0.0.1', port: 4100, shutdownTimeoutMs: 10000 });
  expect(readProjectNoteSchemaPolicy({})).toStrictEqual([]);
  expect(readProjectNoteSchemaPolicy({ VITE_OFFICE_NATIVE2_MUTATION_BRIDGE: 'enabled', SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE: '/unrelated/private-policy.json' })).toStrictEqual([]);
});
it('loads only the explicit private API operator file with the existing scope semantics', () => {
  const root = mkdtempSync(join(tmpdir(), 'api-note-policy-test-')); roots.push(root);
  const path = join(root, 'operator.json');
  const value = [{ tenantId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222',
    readRoles: ['editor'], preserveRoles: [], adoptRoles: [], capabilities: ['note.field.text.v1'] }];
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  const actual = readProjectNoteSchemaPolicy({ OFFICE_API_NOTE_DOCUMENT_POLICY_FILE: path });
  expect(Object.getPrototypeOf(actual[0])).toBe(null);
  expect(actual).toStrictEqual(expectedPolicy(value));
});
it('names the invalid setting without exposing a supplied path or environment values', () => {
  expect(() => readProjectNoteSchemaPolicy({ OFFICE_API_NOTE_DOCUMENT_POLICY_FILE: 'private/operator.json' }))
    .toThrow('Invalid OFFICE_API_NOTE_DOCUMENT_POLICY_FILE');
});
