type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Project only the omitted defaults supplied by Loader and noteTreeOf. */
function confirmedNode(value: unknown, depth = 0): JsonObject {
  if (!object(value) || typeof value.stype !== 'string' || depth > 100) throw new Error('invalid_note_node');
  const node = { ...value };
  if (!Object.hasOwn(node, 'attributes')) node.attributes = {};
  if (!Object.hasOwn(node, 'content')) node.content = [];
  if (!Array.isArray(node.content)) throw new Error('invalid_note_content');
  node.content = node.content.map(child => confirmedNode(child, depth + 1));
  return node;
}

function equal(one: unknown, two: unknown, depth = 0): boolean {
  if (depth > 200) return false;
  if (Object.is(one, two)) return true;
  if (Array.isArray(one) || Array.isArray(two)) {
    return Array.isArray(one) && Array.isArray(two) && one.length === two.length &&
      one.every((value, index) => equal(value, two[index], depth + 1));
  }
  if (!object(one) || !object(two)) return false;
  const keys = Object.keys(one);
  return keys.length === Object.keys(two).length && keys.every(key =>
    Object.hasOwn(two, key) && equal(one[key], two[key], depth + 1));
}

/** Compare full files without rewriting confirmed bytes, drafts or fixed requests. */
export function matchesConfirmedNoteNative(nativeSnapshotText: string, confirmedSnapshotText: string): boolean {
  try {
    const native: unknown = JSON.parse(nativeSnapshotText), confirmed: unknown = JSON.parse(confirmedSnapshotText);
    if (!object(native) || !object(confirmed) || confirmed.format !== 'barocss-note' || confirmed.version !== 1 ||
      !object(confirmed.document) || confirmed.document.stype !== 'note' || !Array.isArray(confirmed.document.content)) return false;
    const projected = { ...confirmed, document: { ...confirmed.document,
      content: confirmed.document.content.map(node => confirmedNode(node)) } };
    return equal(native, projected);
  } catch { return false; }
}
