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
    if (depth > REGISTRY_LIMITS.depth || ++nodes > 8192) fail('definition_too_complex');
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
    if (!Number.isSafeInteger(n) || Object.is(n, -0)) fail('invalid_definition_number');
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
