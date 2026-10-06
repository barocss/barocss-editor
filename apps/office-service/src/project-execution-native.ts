import { isDeepStrictEqual } from 'node:util';
import { readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from '@barocss/office-note-file';
import { ProjectError, type ProjectTarget } from './project-store.js';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export interface ExecutionTarget { nodeId: string; text: string; from: number; to: number }
interface CapturedTarget extends ExecutionTarget { path: number[] }

function nativeEnvelope(snapshotText: string) {
  let value: unknown;
  try { value = JSON.parse(snapshotText); } catch { throw new ProjectError(422, 'unsupported_target'); }
  if (Buffer.byteLength(snapshotText) > 524288 || !object(value) || value.format !== 'barocss-word' || value.version !== 1
    || Object.keys(value).some(key => !['format', 'version', 'savedAt', 'document'].includes(key))
    || (value.savedAt !== undefined && typeof value.savedAt !== 'string') || !object(value.document)
    || value.document.stype !== 'document' || !Array.isArray(value.document.content)) throw new ProjectError(422, 'unsupported_target');
  let count = 0;
  const inspect = (node: unknown, depth: number) => {
    if (++count > 10000 || depth > 100) throw new ProjectError(422, 'unsupported_target');
    if (Array.isArray(node)) { node.forEach(child => inspect(child, depth + 1)); return; }
    if (!object(node)) return;
    if (typeof node.stype === 'string' && (Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId')))
      throw new ProjectError(422, 'unsupported_target');
    Object.values(node).forEach(child => inspect(child, depth + 1));
  };
  inspect(value.document, 0);
  return value as Record<string, unknown> & { document: Record<string, unknown> };
}

function noteOriginal(snapshotText: string): NoteDocument {
  let value: unknown;
  try { value = JSON.parse(snapshotText); } catch { throw new ProjectError(422, 'unsupported_target'); }
  if (Buffer.byteLength(snapshotText) > 524288 || !object(value) || value.format !== 'barocss-note' || value.version !== 1 ||
    Object.keys(value).some(key => !['format', 'version', 'savedAt', 'document'].includes(key)) ||
    (value.savedAt !== undefined && typeof value.savedAt !== 'string')) throw new ProjectError(422, 'unsupported_target');
  const decoded = readNoteSnapshotFile(snapshotText);
  // The codec may read normalized legacy input. This edit cannot silently rewrite it.
  if ('error' in decoded || !isDeepStrictEqual(value.document, decoded.document)) throw new ProjectError(422, 'unsupported_target');
  let count = 0;
  const inspect = (node: unknown, depth: number) => {
    if (++count > 10000 || depth > 100) throw new ProjectError(422, 'unsupported_target');
    if (Array.isArray(node)) { node.forEach(child => inspect(child, depth + 1)); return; }
    if (!object(node)) return;
    if (typeof node.stype === 'string' && (Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId')))
      throw new ProjectError(422, 'unsupported_target');
    Object.values(node).forEach(child => inspect(child, depth + 1));
  };
  inspect(decoded.document, 0);
  return decoded.document;
}
function captureNoteTarget(snapshotText: string, target: Extract<ProjectTarget, { kind: 'note-paragraph' }>): CapturedTarget {
  const doc = noteOriginal(snapshotText), selector = target.selector;
  if (!selector || selector.version !== 1 || !Number.isSafeInteger(selector.paragraphIndex) || selector.paragraphIndex < 0 ||
    doc.attributes.pageId !== selector.pageId) throw new ProjectError(409, 'target_conflict');
  const paragraph = doc.content[selector.paragraphIndex];
  if (!object(paragraph) || paragraph.stype !== 'paragraph' || !Array.isArray(paragraph.content) || paragraph.content.length !== 1)
    throw new ProjectError(422, 'unsupported_target');
  const run = paragraph.content[0];
  const protectedNode = (node: unknown) => object(node) && object(node.attributes) &&
    (node.attributes.locked === true || node.attributes.protected === true);
  if (!object(run) || run.stype !== 'inline-text' || typeof run.text !== 'string' || !run.text.trim() || run.text.length > 8000 ||
    /[\r\n]/.test(run.text) || (run.marks !== undefined && (!Array.isArray(run.marks) || run.marks.length !== 0)) ||
    [doc, paragraph, run].some(protectedNode)) throw new ProjectError(422, 'unsupported_target');
  if (run.text !== target.quote) throw new ProjectError(409, 'target_conflict');
  return { nodeId: target.id, text: run.text, from: 0, to: run.text.length, path: [selector.paragraphIndex, 0] };
}
/** Match native Note export member order without dropping any authored field or value. */
function noteWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(noteWire);
  if (!object(value)) return value;
  if (typeof value.stype !== 'string') return value;
  const ordered = ['stype', 'text', 'attributes', 'marks', 'metadata', 'content'];
  return Object.fromEntries([...ordered.filter(key => Object.hasOwn(value, key)), ...Object.keys(value).filter(key => !ordered.includes(key))]
    .map(key => [key, key === 'content' ? noteWire(value[key]) : value[key]]));
}

/** One actual native full-run comment anchor; never reattach by matching quote text. */
export function captureExecutionTarget(snapshotText: string, target: ProjectTarget): CapturedTarget {
  if (target.kind === 'note-paragraph') return captureNoteTarget(snapshotText, target);
  if (target.kind !== 'word-comment') throw new ProjectError(422, 'unsupported_target');
  const envelope = nativeEnvelope(snapshotText), doc = envelope.document;
  const resources = (doc.content as unknown[]).filter(node => object(node) && node.stype === 'resources');
  if (resources.length !== 1 || !object(resources[0]) || !Array.isArray(resources[0].content))
    throw new ProjectError(409, 'target_conflict');
  const threads = resources[0].content.filter(node => object(node) && node.stype === 'commentThread'
    && object(node.attributes) && node.attributes.id === target.id);
  const found: CapturedTarget[] = [];
  const visit = (node: unknown, path: number[], parent?: Record<string, unknown>, protectedPath = false) => {
    if (!object(node) || node.stype === 'resources') return;
    const protectedNode = protectedPath || (object(node.attributes) && node.attributes.locked === true)
      || ['commentThread', 'contentControl'].includes(String(node.stype));
    const marks = Array.isArray(node.marks) ? node.marks : [];
    for (const mark of marks) {
      if (!object(mark) || mark.stype !== 'commentRef' || !object(mark.attrs) || mark.attrs.id !== target.id) continue;
      if (protectedNode || node.stype !== 'inline-text' || typeof node.text !== 'string' || !node.text.length || node.text.length > 8000
        || parent?.stype !== 'paragraph' || !Array.isArray(parent.content) || parent.content.length !== 1
        || marks.length !== 1 || !Array.isArray(mark.range) || mark.range.length !== 2
        || mark.range[0] !== 0 || mark.range[1] !== node.text.length) throw new ProjectError(422, 'unsupported_target');
      found.push({ nodeId: target.id, text: node.text, from: 0, to: node.text.length, path });
    }
    if (Array.isArray(node.content)) node.content.forEach((child, index) => visit(child, [...path, index], node, protectedNode));
  };
  visit(doc, []);
  if (threads.length !== 1 || found.length !== 1 || found[0].text !== target.quote) throw new ProjectError(409, 'target_conflict');
  return found[0];
}

/** Same Word file envelope as wordFileText(document, ''), based only on captured bytes. */
export function expectedExecutionSnapshot(snapshotText: string, target: ProjectTarget, replacement: string): string {
  if (typeof replacement !== 'string' || !replacement.trim() || replacement.length > 8000
    || [...replacement].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char))) throw new ProjectError(422, 'invalid_proposal');
  const captured = captureExecutionTarget(snapshotText, target);
  if (target.kind === 'note-paragraph') {
    if (/[\r\n]/.test(replacement) || replacement === captured.text) throw new ProjectError(422, 'invalid_proposal');
    const document = noteOriginal(snapshotText);
    const paragraph = document.content[captured.path[0]] as { content: Array<{ text: string }> };
    paragraph.content[0].text = replacement;
    const wire = noteWire(document) as NoteDocument;
    if (!isDeepStrictEqual(wire, document)) throw new ProjectError(422, 'invalid_proposal');
    const result = serializeNoteFile(wire);
    if (Buffer.byteLength(result) > 524288) throw new ProjectError(422, 'invalid_proposal');
    return result;
  }
  const envelope = nativeEnvelope(snapshotText);
  let node = envelope.document;
  for (const index of captured.path) node = (node.content as Record<string, unknown>[])[index];
  node.text = replacement;
  const mark = (node.marks as Array<{ range: number[] }>)[0];
  mark.range[1] = replacement.length;
  const result = `${JSON.stringify({ format: 'barocss-word', version: 1, document: envelope.document }, null, 2)}\n`;
  if (Buffer.byteLength(result) > 524288) throw new ProjectError(422, 'invalid_proposal');
  return result;
}
