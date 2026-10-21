import { afterEach, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDocumentSchemaPolicyFile } from '../src/document-schema-policy.js';

const roots: string[] = [];
const expectedPolicy = (value: unknown): unknown => JSON.parse(JSON.stringify(value), (_key, entry: unknown) =>
  entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? Object.assign(Object.create(null), entry) : entry);
const setting = 'CONTROLLED_NOTE_POLICY_FILE';
const policy = () => ({ tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222', readRoles: ['editor', 'viewer'],
  preserveRoles: [], adoptRoles: ['editor'], capabilities: ['note.field.text.v1'] });
function file(text: string): string {
  const root = mkdtempSync(join(tmpdir(), 'note-policy-test-')); roots.push(root);
  const path = join(root, 'private-policy.json'); writeFileSync(path, text, { mode: 0o600 }); return path;
}
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
it('leaves unspecified and explicitly empty operator policies closed', () => {
  expect(readDocumentSchemaPolicyFile(undefined, setting)).toStrictEqual([]);
  expect(readDocumentSchemaPolicyFile(file('[]'), setting)).toStrictEqual([]);
});
it('retains exact separate read, preserve and adopt role/capability scopes', () => {
  const one = policy(), two = { ...policy(), workspaceId: '33333333-3333-4333-8333-333333333333', readRoles: ['admin'], adoptRoles: [] };
  const actual = readDocumentSchemaPolicyFile(file(JSON.stringify([one, two])), setting);
  expect(actual.every(entry => Object.getPrototypeOf(entry) === null)).toBe(true);
  expect(actual).toStrictEqual(expectedPolicy([one, two]));
});
it('refuses nonprivate, missing, relative and nonregular files without echoing locations', () => {
  const path = file('[]'); chmodSync(path, 0o644);
  for (const value of [path, 'relative-private.json', path + '-missing', roots[0]])
    expect(() => readDocumentSchemaPolicyFile(value, setting)).toThrow('Invalid ' + setting);
  try { readDocumentSchemaPolicyFile(path, setting); } catch (error) { expect(String(error)).not.toContain(path); }
});
it('enforces the unchanged UTF8 file byte boundary, including an empty padded policy', () => {
  expect(readDocumentSchemaPolicyFile(file('[]'.padEnd(65536, ' ')), setting)).toStrictEqual([]);
  expect(() => readDocumentSchemaPolicyFile(file('[]'.padEnd(65537, ' ')), setting)).toThrow('Invalid ' + setting);
});
it('refuses malformed syntax, duplicate decoded keys and non-array roots', () => {
  const valid = JSON.stringify([policy()]);
  for (const text of ['[', '{}', 'null', valid.replace('"tenantId":', '"tenantId":"11111111-1111-4111-8111-111111111111","tenantId":')])
    expect(() => readDocumentSchemaPolicyFile(file(text), setting)).toThrow('Invalid ' + setting);
});
it('refuses missing/extra fields and any caller-style permission grants', () => {
  const missing: Partial<ReturnType<typeof policy>> = policy();
  delete missing.readRoles;
  for (const value of [missing, { ...policy(), approved: true }, { ...policy(), capabilities: 'all' }, { ...policy(), tenantId: 'foreign-claim' }])
    expect(() => readDocumentSchemaPolicyFile(file(JSON.stringify([value])), setting)).toThrow('Invalid ' + setting);
});
it('refuses duplicate scopes, roles, capabilities and unsupported role/capability values', () => {
  const p = policy();
  for (const value of [[p, p], [{ ...p, readRoles: ['editor', 'editor'] }], [{ ...p, adoptRoles: ['superuser'] }],
    [{ ...p, capabilities: ['note.field.text.v1', 'note.field.text.v1'] }], [{ ...p, capabilities: ['execute.anything'] }]])
    expect(() => readDocumentSchemaPolicyFile(file(JSON.stringify(value)), setting)).toThrow('Invalid ' + setting);
});
it('accepts at most one hundred distinct scopes', () => {
  const values = Array.from({ length: 100 }, (_, index) => ({ ...policy(), workspaceId: '00000000-0000-4000-8000-' + String(index).padStart(12, '0') }));
  const actual = readDocumentSchemaPolicyFile(file(JSON.stringify(values)), setting);
  expect(actual.every(entry => Object.getPrototypeOf(entry) === null)).toBe(true);
  expect(actual).toStrictEqual(expectedPolicy(values));
  values.push({ ...policy(), workspaceId: '00000000-0000-4000-8000-000000000100' });
  expect(() => readDocumentSchemaPolicyFile(file(JSON.stringify(values)), setting)).toThrow('Invalid ' + setting);
});
