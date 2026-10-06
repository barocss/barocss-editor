import { registrySha256 } from './registry-sha256.js';

/** Untrusted declarative registry JSON. Never installs an engine schema or executable code. */
export const REGISTRY_DIALECT = 'wonffice.note-fields.v1' as const;
export const REGISTRY_DIGEST = 'wonffice.canonical-json.sha256.v1' as const;
export const REGISTRY_LIMITS = { definitionBytes: 65536, depth: 32, fields: 128,
  dependencies: 16, closure: 32, bundleBytes: 262144 } as const;
export const NOTE_FIELD_CAPABILITIES = ['note.field.text.v1', 'note.field.number.v1',
  'note.field.boolean.v1', 'note.field.choice.v1'] as const;
export type FieldKind = 'text' | 'number' | 'boolean' | 'choice';
export interface RegistryReference { schemaId: string; version: number; digest: string }
export interface RegistryDefinition {
  dialect: typeof REGISTRY_DIALECT;
  scope: { tenantId: string; workspaceId: string };
  schemaId: string; version: number; parent: RegistryReference | null;
  dependencies: readonly RegistryReference[]; requiredCapabilities: readonly string[];
  dataset: { name: string; fields: readonly { name: string; kind: FieldKind; label?: string; options?: readonly string[] }[] };
}
export class SchemaContractError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
function fail(reason = 'invalid_definition'): never { throw new SchemaContractError(reason); }
export function isRegistryUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function unicode(text: string) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (c >= 0xdc00 && c <= 0xdfff) fail();
  }
}
/** A bounded parser detects duplicate decoded keys before JSON.parse can discard them. */
export function parseRegistryJson(text: string, byteLimit: number = REGISTRY_LIMITS.definitionBytes): unknown {
  return parseBoundedJson(text, byteLimit, false);
}

export const NATIVE_JSON_LIMITS = { bytes: 524288, depth: 100, nodes: 65536 } as const;
/** Native values permit finite fractions; declaration versions retain the original integer rules. */
export function parseNativeJson(text: string): unknown {
  return parseBoundedJson(text, NATIVE_JSON_LIMITS.bytes, true);
}
function parseBoundedJson(text: string, byteLimit: number, native: boolean): unknown {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1 || byteLimit > 1048576 || typeof text !== 'string' || new TextEncoder().encode(text).length > byteLimit) fail('definition_too_large');
  let at = 0, nodes = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(text[at] ?? '\0')) at++; };
  const string = (): string => {
    if (text[at] !== '"') fail(); const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '\\') { at++; continue; }
      if (c === '"') {
        let value: unknown; try { value = JSON.parse(text.slice(start, at)); } catch { return fail(); }
        if (typeof value !== 'string') return fail(); unicode(value); return value;
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > (native ? NATIVE_JSON_LIMITS.depth : REGISTRY_LIMITS.depth) || ++nodes > (native ? NATIVE_JSON_LIMITS.nodes : 8192)) fail('definition_too_complex');
    space(); const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; space(); const result: Record<string, unknown> = Object.create(null);
      if (text[at] === '}') { at++; return result; }
      while (at < text.length) {
        space(); const key = string(); if (Object.hasOwn(result, key)) fail('duplicate_definition_key');
        space(); if (text[at++] !== ':') fail(); result[key] = value(depth + 1); space();
        const end = text[at++]; if (end === '}') return result; if (end !== ',') fail();
      }
      return fail();
    }
    if (c === '[') {
      at++; space(); const result: unknown[] = [];
      if (text[at] === ']') { at++; return result; }
      while (at < text.length) {
        result.push(value(depth + 1)); space(); const end = text[at++];
        if (end === ']') return result; if (end !== ',') fail();
      }
      return fail();
    }
    for (const [word, literal] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, at)) { at += word.length; return literal; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!number) return fail(); at += number[0].length; const n = Number(number[0]);
    if ((!native && !Number.isSafeInteger(n)) || !Number.isFinite(n) || Number.isInteger(n) && !Number.isSafeInteger(n) || Object.is(n, -0)) fail('invalid_definition_number');
    return n;
  };
  const result = value(0); space(); if (at !== text.length) fail(); return result;
}
function object(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !allowed.includes(k))) fail('unsupported_definition');
  if (required.some(k => !Object.hasOwn(result, k))) fail(); return result;
}
function name(value: unknown, max = 128): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || [...value].some(c => c.charCodeAt(0) < 32)) fail();
}
function version(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2147483647) fail();
}
export function registryReference(value: unknown): RegistryReference {
  const r = object(value, ['schemaId', 'version', 'digest']);
  if (!isRegistryUuid(r.schemaId) || typeof r.digest !== 'string' || !/^[0-9a-f]{64}$/.test(r.digest)) fail();
  version(r.version); return r as unknown as RegistryReference;
}
export function canonicalRegistryJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalRegistryJson).join(',') + ']';
  if (!value || typeof value !== 'object') return fail();
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalRegistryJson((value as Record<string, unknown>)[k])).join(',') + '}';
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
export function parseRegistryDefinition(text: string): { definition: RegistryDefinition; canonicalText: string } {
  const d = object(parseRegistryJson(text), ['dialect', 'scope', 'schemaId', 'version', 'parent', 'dependencies', 'requiredCapabilities', 'dataset']);
  if (d.dialect !== REGISTRY_DIALECT) fail('unsupported_dialect');
  const scope = object(d.scope, ['tenantId', 'workspaceId']);
  if (!isRegistryUuid(scope.tenantId) || !isRegistryUuid(scope.workspaceId) || !isRegistryUuid(d.schemaId)) fail();
  version(d.version);
  if (d.parent !== null) {
    const parent = registryReference(d.parent);
    if (parent.schemaId !== d.schemaId || parent.version >= d.version) fail('invalid_schema_parent');
  } else if (d.version !== 1) fail('invalid_schema_parent');
  if (!Array.isArray(d.dependencies) || d.dependencies.length > REGISTRY_LIMITS.dependencies) fail('invalid_dependencies');
  const seen = new Set<string>();
  for (const dep of d.dependencies) {
    const ref = registryReference(dep), id = `${ref.schemaId}:${ref.version}`;
    if (seen.has(id) || ref.schemaId === d.schemaId && ref.version === d.version) fail('dependency_cycle'); seen.add(id);
  }
  if (!Array.isArray(d.requiredCapabilities) || d.requiredCapabilities.length > 4 ||
    new Set(d.requiredCapabilities).size !== d.requiredCapabilities.length ||
    d.requiredCapabilities.some(c => !(NOTE_FIELD_CAPABILITIES as readonly unknown[]).includes(c))) fail('unsupported_capability');
  const dataset = object(d.dataset, ['name', 'fields']); name(dataset.name);
  if (!Array.isArray(dataset.fields) || !dataset.fields.length || dataset.fields.length > REGISTRY_LIMITS.fields) fail('invalid_fields');
  const fieldNames = new Set<string>(), required = new Set<string>();
  for (const value of dataset.fields) {
    const field = object(value, ['name', 'kind', 'label', 'options'], ['name', 'kind']); name(field.name);
    if (fieldNames.has(field.name)) fail('duplicate_field'); fieldNames.add(field.name);
    if (!['text', 'number', 'boolean', 'choice'].includes(field.kind as string)) fail('unsupported_field_kind');
    required.add(`note.field.${field.kind}.v1`);
    if (Object.hasOwn(field, 'label')) name(field.label, 255);
    if (field.kind === 'choice') {
      if (!Array.isArray(field.options) || !field.options.length || field.options.length > 64) fail('invalid_choice');
      field.options.forEach(v => name(v, 255)); if (new Set(field.options).size !== field.options.length) fail('invalid_choice');
    } else if (Object.hasOwn(field, 'options')) fail('unsupported_definition');
  }
  if (required.size !== d.requiredCapabilities.length || d.requiredCapabilities.some(c => !required.has(c as string))) fail('unsupported_capability');
  const canonicalText = canonicalRegistryJson(d); freeze(d);
  return { definition: d as unknown as RegistryDefinition, canonicalText };
}


/** Clone only JSON data. Descriptor checks occur before value reads or JSON.stringify. */
export function nativeJsonData(input: unknown): unknown {
  const ancestors = new Set<object>();
  let nodes = 0;
  const copy = (value: unknown, depth: number): unknown => {
    if (depth > NATIVE_JSON_LIMITS.depth || ++nodes > NATIVE_JSON_LIMITS.nodes) fail('native_too_complex');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { unicode(value); return value; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0) || Number.isInteger(value) && !Number.isSafeInteger(value)) fail('invalid_native_number');
      return value;
    }
    if (typeof value !== 'object') return fail('non_json_native_value');
    if (ancestors.has(value)) fail('cyclic_native_value');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) fail('non_json_native_value');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) fail('non_json_native_value');
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('non_json_native_value');
    }
    ancestors.add(value);
    let result: unknown;
    if (array) {
      if (Object.keys(descriptors).length !== value.length + 1) fail('non_json_native_value');
      const items: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(descriptors, String(i))) fail('non_json_native_value');
        items.push(copy(descriptors[String(i)].value, depth + 1));
      }
      result = items;
    } else {
      const record: Record<string, unknown> = Object.create(null);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        unicode(key); record[key] = copy(descriptor.value, depth + 1);
      }
      result = record;
    }
    ancestors.delete(value); return result;
  };
  const result = copy(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > NATIVE_JSON_LIMITS.bytes) fail('native_too_large');
  return result;
}

export interface RegistryBundle {
  bundleVersion: 1;
  digestAlgorithm: typeof REGISTRY_DIGEST;
  selected: readonly RegistryReference[];
  definitions: readonly { reference: RegistryReference; definitionText: string }[];
}
/** Integrity and intrinsic scope only. This operation grants no remote authority. */
export function validateRegistryBundle(value: unknown): {
  bundle: RegistryBundle; selectedDefinitions: readonly RegistryDefinition[]; requiredCapabilities: readonly string[];
} {
  const b = object(value, ['bundleVersion', 'digestAlgorithm', 'selected', 'definitions']);
  if (b.bundleVersion !== 1 || b.digestAlgorithm !== REGISTRY_DIGEST) fail('unsupported_schema_bundle');
  if (!Array.isArray(b.selected) || !Array.isArray(b.definitions)) fail('invalid_schema_bundle');
  if (!b.selected.length) fail('empty_schema_selection');
  if (b.selected.length > REGISTRY_LIMITS.closure || b.definitions.length > REGISTRY_LIMITS.closure ||
    new TextEncoder().encode(JSON.stringify(b)).length > REGISTRY_LIMITS.bundleBytes) fail('schema_bundle_too_large');
  const key = (ref: RegistryReference) => `${ref.schemaId}:${ref.version}`;
  const entries = new Map<string, { reference: RegistryReference; definition: RegistryDefinition; canonicalText: string }>();
  let scope: RegistryDefinition['scope'] | undefined;
  const capabilities = new Set<string>();
  for (const item of b.definitions) {
    const entry = object(item, ['reference', 'definitionText']);
    const reference = registryReference(entry.reference);
    if (entries.has(key(reference))) fail('duplicate_schema_definition');
    if (typeof entry.definitionText !== 'string') fail('invalid_schema_bundle');
    const parsed = parseRegistryDefinition(entry.definitionText), definition = parsed.definition;
    if (definition.schemaId !== reference.schemaId || definition.version !== reference.version) fail('schema_reference_mismatch');
    if (scope && (scope.tenantId !== definition.scope.tenantId || scope.workspaceId !== definition.scope.workspaceId)) fail('schema_scope_mismatch');
    scope = definition.scope;
    definition.requiredCapabilities.forEach(c => capabilities.add(c));
    entries.set(key(reference), { reference, ...parsed });
  }
  const selected = b.selected.map(registryReference), selectedIds = new Set<string>();
  for (const ref of selected) {
    if (selectedIds.has(ref.schemaId)) fail('conflicting_schema_selection');
    selectedIds.add(ref.schemaId);
  }
  const visited = new Set<string>(), active = new Set<string>();
  const visit = (ref: RegistryReference): RegistryDefinition => {
    const id = key(ref), entry = entries.get(id);
    if (!entry) return fail('missing_schema_definition');
    if (entry.reference.digest !== ref.digest) fail('schema_reference_mismatch');
    if (active.has(id)) fail('dependency_cycle');
    if (!visited.has(id)) {
      active.add(id);
      if (entry.definition.parent) visit(entry.definition.parent);
      entry.definition.dependencies.forEach(visit);
      active.delete(id); visited.add(id);
    }
    return entry.definition;
  };
  const selectedDefinitions = selected.map(visit);
  if (visited.size !== entries.size) fail('unreferenced_schema_definition');
  for (const entry of entries.values()) {
    if (registrySha256(entry.canonicalText) !== entry.reference.digest) fail('schema_digest_mismatch');
  }
  return { bundle: b as unknown as RegistryBundle, selectedDefinitions, requiredCapabilities: [...capabilities] };
}
