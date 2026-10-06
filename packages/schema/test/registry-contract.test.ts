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


import { registrySha256 } from '../src/registry-sha256';
import { parseNativeJson, nativeJsonData, validateRegistryBundle } from '../src/registry-contract';
describe('browser synchronous registry integrity and bounded native JSON', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']
  ])('matches the independent SHA256 known vector for %s', (text, expected) => {
    expect(registrySha256(text)).toBe(expected);
  });
  it.each([1, 55, 56, 63, 64, 65, 127, 128, 65536])('matches Node SHA256 across padding boundary %s', size => {
    const text = 'x'.repeat(size);
    expect(registrySha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
  it.each(['검토', 'Café', 'é', '🧭'])('hashes UTF8 without Unicode normalization %s', text => {
    expect(registrySha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
  it('keeps registry integer restrictions while accepting bounded native fractions', () => {
    expect(() => parseRegistryJson('1.5')).toThrow('invalid_definition_number');
    expect(parseNativeJson('{"fraction":1.5,"zero":0,"empty":"","flag":false,"annotation":null}'))
      .toEqual({ fraction: 1.5, zero: 0, empty: '', flag: false, annotation: null });
    for (const text of ['-0', '1e400', '9007199254740992', '{"x":1,"x":2}', '"\\ud800"']) expect(() => parseNativeJson(text)).toThrow();
    expect(() => registrySha256('x'.repeat(65537))).toThrow('definition_too_large');
  });
  it('clones safe own data and rejects hooks, sparse arrays, cycles and prototypes', () => {
    const data = JSON.parse('{"__proto__":{"safe":true},"items":[null,false,0,1.5]}') as unknown;
    expect(nativeJsonData(data)).toEqual(data);
    let calls = 0;
    const accessor = { get value() { calls++; return 1; } };
    const hooked = { toJSON() { calls++; return {}; } };
    for (const value of [accessor, hooked, new Date(), Array(1)]) expect(() => nativeJsonData(value)).toThrow('non_json_native_value');
    expect(calls).toBe(0);
  });
});
describe('exact native schema bundle closure', () => {
  const native = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
  const bundle = native.schemaBundle;
  it('retains original text and authored arrays with exact selected definitions and capability union', () => {
    const before = JSON.stringify(bundle), result = validateRegistryBundle(parseNativeJson(before));
    expect(result.bundle).toEqual(bundle);
    expect(result.selectedDefinitions).toEqual([JSON.parse(bundle.definitions[0].definitionText)]);
    expect(result.requiredCapabilities).toEqual(['note.field.text.v1']);
    expect(JSON.stringify(bundle)).toBe(before);
  });
  it.each([
    ['empty selected', { ...bundle, selected: [] }, 'empty_schema_selection'],
    ['duplicate selected', { ...bundle, selected: [...bundle.selected, ...bundle.selected] }, 'conflicting_schema_selection'],
    ['missing definition', { ...bundle, definitions: [] }, 'missing_schema_definition'],
    ['duplicate definition', { ...bundle, definitions: [...bundle.definitions, ...bundle.definitions] }, 'duplicate_schema_definition'],
    ['unknown bundle key', { ...bundle, execute: 'code' }, 'unsupported_definition'],
    ['unknown entry key', { ...bundle, definitions: [{ ...bundle.definitions[0], renderer: 'code' }] }, 'unsupported_definition'],
    ['bad algorithm', { ...bundle, digestAlgorithm: 'sha1' }, 'unsupported_schema_bundle'],
    ['wrong text digest', { ...bundle, definitions: [{ ...bundle.definitions[0],
      definitionText: bundle.definitions[0].definitionText.replace('items', 'changed') }] }, 'schema_digest_mismatch'],
    ['wrong selected digest', { ...bundle, selected: [{ ...bundle.selected[0], digest: '0'.repeat(64) }] }, 'schema_reference_mismatch']
  ])('refuses %s with a valid baseline and a named result', (_label, value, reason) => {
    expect(validateRegistryBundle(bundle).bundle).toEqual(bundle);
    const before = JSON.stringify(value);
    expect(() => validateRegistryBundle(parseNativeJson(before))).toThrow(reason);
    expect(JSON.stringify(value)).toBe(before);
  });
});


describe('transitive parent/dependency closure and intrinsic scope', () => {
  // Independent test canonicalizer and Node digest; no production parser/writer builds the oracle.
  const sorted = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(sorted).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + sorted((value as Record<string, unknown>)[key])).join(',') + '}';
  };
  const entry = (definition: ReturnType<typeof specimen> | Record<string, unknown>) => ({
    reference: { schemaId: definition.schemaId as string, version: definition.version as number,
      digest: createHash('sha256').update(sorted(definition)).digest('hex') }, definitionText: JSON.stringify(definition, null, 2) + '\n'
  });
  const graph = (foreign = false) => {
    const depId = '44444444-4444-4444-8444-444444444444';
    const base = { ...specimen(), schemaId: depId, dataset: { name: 'Dependency', fields: [{ name: 'Count', kind: 'number' }] },
      requiredCapabilities: ['note.field.number.v1'], ...(foreign ? { scope: { tenantId, workspaceId: '55555555-5555-4555-8555-555555555555' } } : {}) };
    const parent = entry(base), dependency = entry({ ...base, version: 2, parent: parent.reference });
    const selected = entry({ ...specimen(), dependencies: [dependency.reference] });
    return { bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1', selected: [selected.reference],
      definitions: [dependency, selected, parent] };
  };
  it('includes parent versions and derives capabilities across the full closure without array sorting', () => {
    const bundle = graph(), before = JSON.stringify(bundle);
    const result = validateRegistryBundle(parseNativeJson(before));
    expect(result.bundle).toEqual(bundle);
    expect(new Set(result.requiredCapabilities)).toEqual(new Set(['note.field.text.v1', 'note.field.choice.v1', 'note.field.number.v1']));
    expect(JSON.stringify(bundle)).toBe(before);
  });
  it('refuses omitted transitive parents, extra unreachable declarations and mismatched exact references', () => {
    const good = graph(); expect(validateRegistryBundle(good).bundle).toEqual(good);
    expect(() => validateRegistryBundle({ ...good, definitions: good.definitions.slice(0, 2) })).toThrow('missing_schema_definition');
    const extra = entry({ ...specimen(), schemaId: '66666666-6666-4666-8666-666666666666' });
    expect(() => validateRegistryBundle({ ...good, definitions: [...good.definitions, extra] })).toThrow('unreferenced_schema_definition');
    const badRef = { ...good.selected[0], digest: '0'.repeat(64) };
    expect(() => validateRegistryBundle({ ...good, selected: [badRef] })).toThrow('schema_reference_mismatch');
  });
  it('refuses cross-workspace closure even with independently correct digests', () => {
    const foreign = graph(true);
    expect(() => validateRegistryBundle(foreign)).toThrow('schema_scope_mismatch');
  });
  it('rejects graph cycles structurally before accepting synthetic cyclic digest claims', () => {
    // These synthetically declared hashes cannot claim a cryptographically valid cyclic bundle.
    const a = { schemaId, version: 1, digest: 'a'.repeat(64) }, b = { schemaId: '44444444-4444-4444-8444-444444444444', version: 1, digest: 'b'.repeat(64) };
    const declarations = [{ reference: a, definitionText: JSON.stringify({ ...specimen(), dependencies: [b] }) },
      { reference: b, definitionText: JSON.stringify({ ...specimen(), schemaId: b.schemaId, dependencies: [a] }) }];
    expect(() => validateRegistryBundle({ bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1',
      selected: [a], definitions: declarations })).toThrow('dependency_cycle');
  });
  it('rejects unsupported capabilities, definition identity, executable members and strict reference keys', () => {
    const good = graph(), selected = good.definitions[1];
    for (const [definitionText, reason] of [
      [selected.definitionText.replace('note.field.text.v1', 'custom.capability'), 'unsupported_capability'],
      [selected.definitionText.replace('"dialect":', '"renderer":"code","dialect":'), 'unsupported_definition'],
      [selected.definitionText.replace(schemaId, '66666666-6666-4666-8666-666666666666'), 'schema_reference_mismatch'],
      [selected.definitionText.replace('"dialect":', '"dialect":"first","dialect":'), 'duplicate_definition_key']
    ]) {
      expect(() => validateRegistryBundle({ ...good, definitions: [good.definitions[0], { ...selected, definitionText }, good.definitions[2]] })).toThrow(reason);
    }
    expect(() => validateRegistryBundle({ ...good, selected: [{ ...good.selected[0], execute: true }] })).toThrow('unsupported_definition');
  });
  it('enforces definition, closure and bundle byte caps without partial success', () => {
    const good = graph();
    expect(() => validateRegistryBundle({ ...good, definitions: Array(33).fill(good.definitions[0]) })).toThrow('schema_bundle_too_large');
    expect(() => validateRegistryBundle({ ...good, definitions: [{ ...good.definitions[1], definitionText: ' '.repeat(65537) }] })).toThrow('definition_too_large');
    expect(() => validateRegistryBundle({ ...good, definitions: [{ ...good.definitions[1], definitionText: ' '.repeat(262145) }] })).toThrow('schema_bundle_too_large');
  });
});


it('retains a JSON member named toJSON while refusing an actual executable hook', () => {
  const source = { metadata: { toJSON: 'authored data', annotation: null } };
  const cloned = nativeJsonData(source);
  expect(cloned).toEqual(source);
  expect(JSON.stringify(cloned)).toBe(JSON.stringify(source));
  let calls = 0;
  expect(() => nativeJsonData({ toJSON() { calls++; return {}; } })).toThrow('non_json_native_value');
  expect(calls).toBe(0);
});
