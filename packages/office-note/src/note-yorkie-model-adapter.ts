import type { Document } from '@yorkie-js/sdk';
import { op } from '@barocss/model';
import type { NoteSession } from './session';
import {
  decodeYorkieNote,
  editYorkieNoteText,
  seedYorkieNote,
  type SeededNoteNode,
  type YorkieNoteRoot,
} from './note-yorkie-codec';

type Identity = { actorId: string; sessionId: string };
type RemoteIdentity = Identity & { editId: string };
type TextDifference = { id: string; before: string; after: string };
const baselines = new WeakMap<NoteSession, SeededNoteNode>();

const reject = (reason: string): never => { throw new Error(`Unsupported Note collaboration change: ${reason}`); };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : reject('node is not an object');

/**
 * This slice accepts only preassigned product sids, plain text, and primitive
 * attributes. Marks and structural edits need their own CRDT mapping.
 */
export function readTextOnlyNote(session: NoteSession): SeededNoteNode {
  const read = (value: unknown, parent?: string): SeededNoteNode => {
    const node = record(value);
    const stype = node.stype;
    if (typeof node.sid !== 'string' || !node.sid) reject('every node needs a canonical sid');
    if (typeof stype !== 'string') reject('node type is missing');
    const allowed = parent === undefined ? stype === 'note'
      : parent === 'note' ? stype === 'paragraph' || stype === 'heading'
      : parent === 'paragraph' || parent === 'heading' ? stype === 'inline-text'
      : false;
    if (!allowed) reject(`structure ${parent ?? 'root'} / ${stype}`);
    if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.length > 0)) reject('rich text marks');
    for (const key of Object.keys(node)) {
      if (!['sid', 'stype', 'content', 'text', 'attributes', 'marks', 'metadata'].includes(key)) reject(`node field ${key}`);
    }
    const rawAttrs = node.attributes === undefined ? {} : record(node.attributes);
    const attributes: NonNullable<SeededNoteNode['attributes']> = {};
    for (const [key, attribute] of Object.entries(rawAttrs)) {
      if (attribute !== null && !['string', 'number', 'boolean'].includes(typeof attribute)) reject(`attribute ${key}`);
      if (typeof attribute === 'number' && !Number.isFinite(attribute)) reject(`attribute ${key}`);
      attributes[key] = attribute as string | number | boolean | null;
    }
    if (stype === 'inline-text' && typeof node.text !== 'string') reject('inline text is missing');
    if (stype !== 'inline-text' && node.text !== undefined) reject(`text on ${stype}`);
    const content = stype === 'inline-text' && node.content === undefined ? [] : node.content;
    if (!Array.isArray(content)) reject(`content on ${stype}`);
    const children = content as unknown[];
    if (stype === 'inline-text' && children.length) reject('children under inline text');
    return {
      id: node.sid as string,
      stype: stype as string,
      ...(Object.keys(attributes).length ? { attributes } : {}),
      ...(stype === 'inline-text' ? { text: node.text as string } : {}),
      content: children.map(child => read(child, stype as string)),
    };
  };
  const tree = read(session.editor.exportDocument());
  const ids = new Set<string>();
  const checkIds = (node: SeededNoteNode): void => {
    if (ids.has(node.id)) reject(`duplicate sid ${node.id}`);
    ids.add(node.id);
    node.content.forEach(checkIds);
  };
  checkIds(tree);
  return tree;
}

/** Seed once. The caller owns transport and must not send if this throws. */
export function seedYorkieFromNote(session: NoteSession, doc: Document<YorkieNoteRoot>): void {
  const note = readTextOnlyNote(session);
  doc.update(root => seedYorkieNote(root, note));
  baselines.set(session, note);
}

/** Bind a second Note session only when its model matches the seeded replica. */
export function bindYorkieNote(session: NoteSession, doc: Document<YorkieNoteRoot>): void {
  const live = readTextOnlyNote(session);
  const shared = decodeYorkieNote(doc.getRoot());
  if (oneTextDifference(live, shared)) reject('initial model and Yorkie text differ');
  baselines.set(session, live);
}

function oneTextDifference(before: SeededNoteNode, after: SeededNoteNode): TextDifference | undefined {
  const differences: TextDifference[] = [];
  const walk = (a: SeededNoteNode, b: SeededNoteNode): void => {
    if (a.id !== b.id || a.stype !== b.stype || a.content.length !== b.content.length) reject('node structure changed');
    if (JSON.stringify(a.attributes ?? {}) !== JSON.stringify(b.attributes ?? {})) reject(`attributes changed at ${a.id}`);
    if (a.text !== b.text) {
      if (a.stype !== 'inline-text' || b.stype !== 'inline-text') reject(`non-leaf text at ${a.id}`);
      differences.push({ id: a.id, before: a.text ?? '', after: b.text ?? '' });
    }
    a.content.forEach((child, index) => walk(child, b.content[index]));
  };
  walk(before, after);
  if (differences.length > 1) reject('more than one text leaf changed');
  return differences[0];
}

function minimalEdit(before: string, after: string): { from: number; to: number; value: string } {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { from, to: oldEnd, value: after.slice(from, newEnd) };
}

/** Inspect the live model before creating any Yorkie operation for provider send. */
export function stageLocalNoteText(session: NoteSession, doc: Document<YorkieNoteRoot>): boolean {
  const baseline = baselines.get(session);
  if (!baseline) throw new Error('Unsupported Note collaboration change: session is not bound to Yorkie');
  const live = readTextOnlyNote(session);
  const shared = decodeYorkieNote(doc.getRoot());
  const remoteDifference = oneTextDifference(baseline, shared);
  const difference = oneTextDifference(baseline, live);
  if (remoteDifference) {
    // A pure insertion on each side can be placed into the current Yorkie Text
    // without discarding either value. All other overlap stays explicit.
    if (!difference) throw new Error('Unsupported Note collaboration change: remote text arrived before local staging');
    if (remoteDifference.id !== difference.id) reject('remote text arrived before local staging');
    const remoteEdit = minimalEdit(remoteDifference.before, remoteDifference.after);
    const localEdit = minimalEdit(difference.before, difference.after);
    if (remoteEdit.from !== remoteEdit.to || localEdit.from !== localEdit.to ||
      !remoteEdit.value || !localEdit.value) reject('remote text arrived before local staging');
    const position = localEdit.from + (remoteEdit.from < localEdit.from ? remoteEdit.value.length : 0);
    doc.update(root => editYorkieNoteText(root, difference.id, position, position, localEdit.value));
    baselines.set(session, live);
    return true;
  }
  if (!difference) return false;
  const edit = minimalEdit(difference.before, difference.after);
  doc.update(root => editYorkieNoteText(root, difference.id, edit.from, edit.to, edit.value));
  baselines.set(session, live);
  return true;
}

/** Apply one changed leaf as a remote editor transaction, preserving local history and selection. */
export async function applyRemoteNoteText(
  session: NoteSession,
  doc: Document<YorkieNoteRoot>,
  remote: RemoteIdentity,
  self: Identity,
): Promise<boolean> {
  if (!remote.editId || !remote.actorId || !remote.sessionId) reject('remote identity is incomplete');
  if (remote.actorId === self.actorId && remote.sessionId === self.sessionId) return false;
  const baseline = baselines.get(session);
  if (!baseline) throw new Error('Unsupported Note collaboration change: session is not bound to Yorkie');
  let noChange = false;
  let appliedTree: SeededNoteNode | undefined;
  const result = await session.editor.executeTransaction({
    operations: [op((context) => {
      // This function runs after TransactionManager acquires the same DataStore
      // lock as local editor transactions. A queued local edit is visible here.
      const live = readTextOnlyNote(session);
      if (oneTextDifference(baseline, live)) reject('local text is not staged');
      const shared = decodeYorkieNote(doc.getRoot());
      const difference = oneTextDifference(live, shared);
      if (!difference) {
        noChange = true;
        return { success: false, error: 'No remote text change' };
      }
      const updated = context.dataStore.updateNode(difference.id, { text: difference.after });
      if (!updated?.valid) return { success: false, error: updated?.errors[0] ?? 'Remote text update failed' };
      appliedTree = shared;
      return { success: true };
    })],
    options: {
      provenance: { origin: 'remote', ...remote },
      recordInHistory: false,
      applySelectionToView: false,
    },
  });
  if (noChange) return false;
  if (!result.success || !result.committed) throw new Error(result.errors.join('; ') || 'Remote text transaction failed');
  if (!appliedTree) throw new Error('Remote text transaction had no decoded Note');
  baselines.set(session, appliedTree);
  return true;
}
