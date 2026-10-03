import { readWordFile, wordFileText } from './word-file';

export const BUSINESS_PAIR_KEY = 'wonfficeBusinessPair';
export interface BusinessItemVersion { version: number; snapshotText: string }
export interface BusinessItem {
  id: string;
  kind: 'requirement' | 'decision';
  currentVersion: number;
  locator: { kind: 'point-bookmark'; bookmarkId: string };
  versions: BusinessItemVersion[];
  derivedFrom?: { itemId: string; version: number };
}
export interface BusinessPairPayload {
  schemaVersion: 1;
  items: BusinessItem[];
  relations: { kind: 'supported_by'; source: { itemId: string; version: number }; target: { itemId: string; version: number } }[];
}
export type BusinessPairRead = { status: 'absent' } | { status: 'unsupported'; reason: string } | { status: 'invalid'; reason: string }
  | { status: 'valid'; payload: BusinessPairPayload; items: { item: BusinessItem; state: 'current' | 'stale' | 'unavailable' }[]; review: 'current' | 'needed' };
export class BusinessPairError extends Error {}
type Native = Record<string, unknown>;
const object = (value: unknown): value is Native => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function fail(reason: string): never { throw new BusinessPairError(reason); }
function visit(document: unknown, fn: (node: Native, paragraph?: Native) => void, paragraph?: Native): void {
  if (!object(document)) return;
  const owner = document.stype === 'paragraph' ? document : paragraph;
  fn(document, owner);
  if (Array.isArray(document.content)) document.content.forEach(child => visit(child, fn, owner));
}
function located(document: unknown, bookmarkId: string): Native | undefined {
  const found: (Native | undefined)[] = [];
  visit(document, (node, paragraph) => {
    if (node.stype === 'bookmarkAnchor' && object(node.attributes) && node.attributes.id === bookmarkId) found.push(paragraph);
  });
  return found.length === 1 ? found[0] : undefined;
}
function cleanDocument(document: unknown): Native {
  const parsed = readWordFile(wordFileText(document, ''));
  if ('error' in parsed || !object(parsed.document) || parsed.document.stype !== 'document') fail('A full native Word document is required');
  const result = parsed.document;
  if (object(result.metadata)) delete result.metadata[BUSINESS_PAIR_KEY];
  return result;
}
/** Object property order does not define content; every authored key/value is retained. */
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
}
function basis(document: unknown, bookmarkId: string): string | undefined {
  const paragraph = located(document, bookmarkId);
  if (!paragraph) return;
  const resources: Native[] = [];
  visit(document, node => { if (node.stype === 'resources') resources.push(node); });
  return JSON.stringify({ paragraph: comparable(paragraph), resources: resources.map(resource => comparable(resource)) });
}
function pinned(version: BusinessItemVersion, bookmarkId: string): Native {
  const parsed = readWordFile(version.snapshotText);
  if ('error' in parsed || !object(parsed.document) || parsed.document.stype !== 'document') fail('Invalid pinned native Word file');
  if (object(parsed.document.metadata) && BUSINESS_PAIR_KEY in parsed.document.metadata) fail('Recursive business pin');
  let runtime = false;
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(inspect); return; }
    if (!object(value)) return;
    if ('sid' in value || 'parentId' in value) runtime = true;
    Object.values(value).forEach(inspect);
  };
  inspect(parsed.document);
  if (runtime || !located(parsed.document, bookmarkId)) fail('Pinned locator is missing, ambiguous or contains runtime identifiers');
  return parsed.document;
}
function validate(raw: Native): BusinessPairPayload {
  if (!Array.isArray(raw.items) || raw.items.length !== 2 || !Array.isArray(raw.relations) || raw.relations.length !== 1) fail('Exactly one requirement, decision and relation are required');
  const items = raw.items;
  for (const item of items) {
    if (!object(item) || !id(item.id) || !['requirement', 'decision'].includes(String(item.kind)) || !positive(item.currentVersion)
      || !object(item.locator) || item.locator.kind !== 'point-bookmark' || typeof item.locator.bookmarkId !== 'string' || !item.locator.bookmarkId.trim()
      || !Array.isArray(item.versions) || item.versions.length !== item.currentVersion) fail('Invalid business item');
    if (item.derivedFrom !== undefined && (!object(item.derivedFrom) || !id(item.derivedFrom.itemId) || !positive(item.derivedFrom.version) || item.derivedFrom.itemId === item.id)) fail('Invalid derivation');
    const bookmarkId = item.locator.bookmarkId;
    item.versions.forEach((version: unknown, index: number) => {
      if (!object(version) || version.version !== index + 1 || typeof version.snapshotText !== 'string') fail('Invalid item version');
      pinned(version as unknown as BusinessItemVersion, bookmarkId);
    });
  }
  if (items[0].id === items[1].id || items[0].kind === items[1].kind || items[0].locator.bookmarkId === items[1].locator.bookmarkId) fail('Duplicate business identity, kind or locator');
  const relation = raw.relations[0];
  if (!object(relation) || relation.kind !== 'supported_by' || !object(relation.source) || !object(relation.target)) fail('Unknown relationship');
  for (const [endpoint, kind] of [[relation.source, 'requirement'], [relation.target, 'decision']] as const) {
    const item = items.find(one => one.id === endpoint.itemId);
    if (!item || item.kind !== kind || !positive(endpoint.version) || !item.versions.some((version: BusinessItemVersion) => version.version === endpoint.version)) fail('Invalid relationship direction or unavailable version');
  }
  return raw as unknown as BusinessPairPayload;
}
/** Authored fields, including approved/actor/time, never provide authority or confirmation. */
export function readBusinessPair(document: unknown): BusinessPairRead {
  if (!object(document) || !object(document.metadata) || !(BUSINESS_PAIR_KEY in document.metadata)) return { status: 'absent' };
  const raw = document.metadata[BUSINESS_PAIR_KEY];
  if (!object(raw)) return { status: 'invalid', reason: 'Invalid business payload' };
  if (raw.schemaVersion !== 1) return positive(raw.schemaVersion) ? { status: 'unsupported', reason: 'Unsupported business schema version' } : { status: 'invalid', reason: 'Invalid business schema version' };
  try {
    const payload = validate(raw);
    const clean = cleanDocument(document);
    const items = payload.items.map(item => {
      const current = basis(clean, item.locator.bookmarkId);
      const previous = basis(pinned(item.versions[item.currentVersion - 1], item.locator.bookmarkId), item.locator.bookmarkId);
      return { item, state: !current ? 'unavailable' as const : current === previous ? 'current' as const : 'stale' as const };
    });
    const relation = payload.relations[0];
    const oldReference = payload.items.some(item => item.currentVersion !== (item.kind === 'requirement' ? relation.source.version : relation.target.version));
    return { status: 'valid', payload, items, review: oldReference || items.some(item => item.state !== 'current') ? 'needed' : 'current' };
  } catch (error) { return { status: 'invalid', reason: error instanceof Error ? error.message : 'Invalid business payload' }; }
}
export function createBusinessPair(document: unknown, requirementPointBookmarkId: string, decisionPointBookmarkId: string): BusinessPairPayload {
  if (readBusinessPair(document).status !== 'absent') fail('An existing payload must not be replaced');
  const clean = cleanDocument(document);
  const snapshotText = wordFileText(clean, '');
  const items: BusinessItem[] = ([['requirement', requirementPointBookmarkId], ['decision', decisionPointBookmarkId]] as const).map(([kind, bookmarkId]) => ({
    id: crypto.randomUUID(), kind, currentVersion: 1, locator: { kind: 'point-bookmark', bookmarkId }, versions: [{ version: 1, snapshotText }]
  }));
  return validate({ schemaVersion: 1, items, relations: [{ kind: 'supported_by', source: { itemId: items[0].id, version: 1 }, target: { itemId: items[1].id, version: 1 } }] });
}
export function appendDecisionVersion(document: unknown): BusinessPairPayload {
  const read = readBusinessPair(document);
  if (read.status !== 'valid') fail('A valid existing pair is required');
  const decision = read.items.find(one => one.item.kind === 'decision')!;
  if (decision.state !== 'stale' || read.items.some(one => one.state === 'unavailable')) fail('A changed, uniquely located decision is required');
  const payload = structuredClone(read.payload);
  const item = payload.items.find(one => one.kind === 'decision')!;
  item.currentVersion++;
  item.versions.push({ version: item.currentVersion, snapshotText: wordFileText(cleanDocument(document), '') });
  return payload;
}
/** Independent copy/restore allocates business identity; ordinary move/view never calls this. */
export function deriveBusinessPair(document: unknown): unknown {
  const read = readBusinessPair(document);
  if (read.status === 'invalid' || read.status === 'unsupported') fail(read.reason);
  const result = structuredClone(document);
  if (read.status === 'absent') return result;
  const payload = structuredClone(read.payload);
  const remap = new Map<string, string>();
  payload.items.forEach(item => { const previous = item.id; item.id = crypto.randomUUID(); remap.set(previous, item.id); item.derivedFrom = { itemId: previous, version: item.currentVersion }; });
  payload.relations.forEach(relation => { relation.source.itemId = remap.get(relation.source.itemId)!; relation.target.itemId = remap.get(relation.target.itemId)!; });
  (result as Native).metadata = { ...((result as Native).metadata as Native), [BUSINESS_PAIR_KEY]: payload };
  return result;
}
