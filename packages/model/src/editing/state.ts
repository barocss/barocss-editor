import type { DataStore } from '@barocss/datastore';
import type { Schema } from '@barocss/schema';

const identities = new WeakMap<object, string>();
let nextIdentity = 0;
export function identity(value: object): string {
  let id = identities.get(value);
  if (!id) { id = `editing:${++nextIdentity}`; identities.set(value, id); }
  return id;
}
/** Local change detection, not a portable hash or a security credential. */
export function signature(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) => typeof held === 'function' ? { functionIdentity: identity(held) } : held);
}
export function schemaState(schema: Schema): string {
  return signature([identity(schema), schema.topNode, [...schema.nodes], [...schema.marks]]);
}
export function documentState(store: DataStore): string {
  return signature([store.getRootNodeId(), store.getAllNodes().slice().sort((a, b) => (a.sid ?? '').localeCompare(b.sid ?? ''))]);
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
