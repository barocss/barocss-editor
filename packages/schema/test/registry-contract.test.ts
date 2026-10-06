import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseRegistryDefinition, parseRegistryJson, REGISTRY_LIMITS } from '../src/registry-contract';
const tenantId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const schemaId = '33333333-3333-4333-8333-333333333333';
interface CandidateField { name: string; kind: string; label?: string; options?: string[] }
const specimen = () => {
  const fields: CandidateField[] = [{ name: 'Title', kind: 'text', label: '제목' }, { name: 'State', kind: 'choice', options: ['계획', '완료'] }];
  return ({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId }, schemaId, version: 1,
  parent: null, dependencies: [], requiredCapabilities: ['note.field.text.v1', 'note.field.choice.v1'],
  dataset: { name: '목록', fields } });
};
const digest = (text: string) => createHash('sha256').update(parseRegistryDefinition(text).canonicalText).digest('hex');
describe('bounded declarative Note registry contract', () => {
  it('preserves complete declarations, array order, code points and original text while fixing only digest key order', () => {
    const input = specimen(), text = JSON.stringify(input, null, 2), parsed = parseRegistryDefinition(text);
    expect(parsed.definition).toEqual(input); expect(Object.isFrozen(parsed.definition.dataset.fields)).toBe(true);
    const reversed = Object.fromEntries(Object.entries(input).reverse()); expect(digest(JSON.stringify(reversed))).toBe(digest(text));
    const reordered = specimen(); reordered.dataset.fields[1].options!.reverse(); expect(digest(JSON.stringify(reordered))).not.toBe(digest(text));
    const decomposed = specimen(); decomposed.dataset.name = 'e\u0301'; const composed = specimen(); composed.dataset.name = 'é';
    expect(digest(JSON.stringify(decomposed))).not.toBe(digest(JSON.stringify(composed))); expect(text).toBe(JSON.stringify(input, null, 2));
  });
  it.each(['{"key":1,"key":2}', '{"name":1,"n\\u0061me":2}'])('refuses duplicate decoded JSON keys %s', text => {
    expect(() => parseRegistryJson(text)).toThrow('duplicate_definition_key');
  });
  it.each(['-0', '9007199254740992', '1e400', '1.5', '"\\ud800"', '{"x":1,}', 'null trailing'])('refuses invalid/unsafe JSON %s', text => {
    expect(() => parseRegistryJson(text)).toThrow();
  });
  it('distinguishes explicit null, omitted and unsupported defaults without materializing values', () => {
    const value = specimen(); expect(parseRegistryDefinition(JSON.stringify(value)).definition.parent).toBeNull();
    const absent = { ...value } as Record<string, unknown>; delete absent.parent;
    expect(() => parseRegistryDefinition(JSON.stringify(absent))).toThrow('invalid_definition');
    expect(() => parseRegistryDefinition(JSON.stringify({ ...value, dataset: { ...value.dataset, fields: [{ name: 'x', kind: 'text', default: null }] } }))).toThrow('unsupported_definition');
  });
  it.each(['validator', 'transform', 'renderer', 'approved', 'actor'])('rejects untrusted execution/approval member %s', key => {
    expect(() => parseRegistryDefinition(JSON.stringify({ ...specimen(), [key]: 'function(){run()}' }))).toThrow('unsupported_definition');
  });
  it('rejects unsupported fields instead of a text fallback, duplicates, missing capability and invalid parent', () => {
    const unknown = specimen(); unknown.dataset.fields[0].kind = 'unsupported';
    expect(() => parseRegistryDefinition(JSON.stringify(unknown))).toThrow('unsupported_field_kind');
    const duplicate = specimen(); duplicate.dataset.fields.push(duplicate.dataset.fields[0]);
    expect(() => parseRegistryDefinition(JSON.stringify(duplicate))).toThrow('duplicate_field');
    expect(() => parseRegistryDefinition(JSON.stringify({ ...specimen(), requiredCapabilities: [] }))).toThrow('unsupported_capability');
    expect(() => parseRegistryDefinition(JSON.stringify({ ...specimen(), version: 2 }))).toThrow('invalid_schema_parent');
  });
  it('enforces bytes, depth, fields, direct dependencies and self-cycle bounds before registration', () => {
    expect(() => parseRegistryJson(' '.repeat(REGISTRY_LIMITS.definitionBytes + 1))).toThrow('definition_too_large');
    expect(() => parseRegistryJson('['.repeat(34) + '0' + ']'.repeat(34))).toThrow('definition_too_complex');
    const wide = specimen(); wide.dataset.fields = Array.from({ length: 129 }, (_, i) => ({ name: `f${i}`, kind: 'text' }));
    expect(() => parseRegistryDefinition(JSON.stringify(wide))).toThrow('invalid_fields');
    const ref = { schemaId, version: 1, digest: 'a'.repeat(64) };
    expect(() => parseRegistryDefinition(JSON.stringify({ ...specimen(), dependencies: [ref] }))).toThrow('dependency_cycle');
    expect(() => parseRegistryDefinition(JSON.stringify({ ...specimen(), dependencies: Array(17).fill(ref) }))).toThrow('invalid_dependencies');
  });
});
