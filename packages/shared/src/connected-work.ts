/** Project coordination metadata. Native product documents remain the originals. */
export interface ProjectDocument { product: 'note' | 'word' | 'slides' | 'site'; id: string; }
/** Immutable evidence: the exact stored source, not a promise that it is still current. */
export interface Pin { id: string; document: ProjectDocument; revision: number; text: string; title: string; }
export interface ProjectResult { id: string; name: string; document: ProjectDocument; inputs: Pin[]; request?: string; }
export interface ProjectComment {
  id: string; resultId: string; target: { kind: 'document' | 'word-comment'; id: string; quote: string };
  pin: Pin; actor: { kind: 'local' | 'human'; id: string; label: string }; body: string;
  createdAt: string; workId?: string; status: 'open' | 'resolved';
}
export interface ProjectWork {
  id: string; commentId: string; request: string; state: 'unconnected' | 'paused'; inputs: Pin[];
  outputs: string[]; reason: string; createdAt: string;
}
export interface ProjectRecord {
  id: string; title: string; goal: string; archived: boolean; results: ProjectResult[];
  comments: ProjectComment[]; works: ProjectWork[]; activities: { id: string; at: string; label: string }[];
  drafts: Record<string, string>;
}
export interface ProjectSnapshot { record: ProjectRecord; revision: number; }
export type ProjectCommentInput = Pick<ProjectComment, 'resultId' | 'target' | 'pin' | 'actor' | 'body'>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string';
const identity = (v: unknown): v is string => string(v) && !!v.trim();
const date = (v: unknown): v is string => string(v) && Number.isFinite(Date.parse(v));
const product = (v: unknown) => ['note', 'word', 'slides', 'site'].includes(String(v));
function validDocument(v: unknown): v is ProjectDocument { return object(v) && keys(v, 'product id') && product(v.product) && identity(v.id); }
function validPin(v: unknown): v is Pin {
  return object(v) && keys(v, 'id document revision text title') && identity(v.id) && validDocument(v.document) && Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && string(v.text) && string(v.title);
}
function pins(v: unknown): v is Pin[] { return Array.isArray(v) && v.every(validPin) && unique(v.map(p => p.id)); }
function keys(v: Record<string, unknown>, allowed: string) { return Object.keys(v).every(k => allowed.split(' ').includes(k)); }
function unique(v: unknown[]) { return new Set(v).size === v.length; }
function invalid(): never { throw new Error('Invalid project data.'); }
/** Reject corrupt links and unsupported execution claims before any storage write. */
export function readProjectRecord(value: unknown): ProjectRecord {
  if (!object(value) || !keys(value, 'id title goal archived results comments works activities drafts') || !identity(value.id) || !identity(value.title) || !string(value.goal) || typeof value.archived !== 'boolean' ||
    !Array.isArray(value.results) || !Array.isArray(value.comments) || !Array.isArray(value.works) || !Array.isArray(value.activities) ||
    !object(value.drafts) || !Object.values(value.drafts).every(string)) invalid();
  const resultIds = new Set<string>(), documents = new Set<string>();
  for (const r of value.results) {
    if (!object(r) || !keys(r, 'id name document inputs request') || !identity(r.id) || !identity(r.name) || !validDocument(r.document) || !pins(r.inputs) || (r.request !== undefined && !string(r.request))) invalid();
    const key = `${r.document.product}:${r.document.id}`;
    if (resultIds.has(r.id) || documents.has(key)) invalid();
    resultIds.add(r.id); documents.add(key);
  }
  const commentIds = new Set<string>();
  for (const c of value.comments) {
    if (!object(c) || !keys(c, 'id resultId target pin actor body createdAt workId status') || !identity(c.id) || !identity(c.resultId) || !resultIds.has(c.resultId) || !object(c.target) || !keys(c.target, 'kind id quote') ||
      !['document', 'word-comment'].includes(String(c.target.kind)) || !identity(c.target.id) || !string(c.target.quote) ||
      !validPin(c.pin) || !object(c.actor) || !keys(c.actor, 'kind id label') || !['local', 'human'].includes(String(c.actor.kind)) || !identity(c.actor.id) || !identity(c.actor.label) ||
      !identity(c.body) || !date(c.createdAt) || !['open', 'resolved'].includes(String(c.status)) || (c.workId !== undefined && !identity(c.workId)) || commentIds.has(c.id)) invalid();
    if (c.target.kind === 'document' && c.target.id !== c.pin.document.id) invalid();
    if (c.target.kind === 'word-comment' && c.pin.document.product !== 'word') invalid();
    commentIds.add(c.id);
  }
  const workIds = new Set<string>(), workComments = new Set<string>();
  for (const w of value.works) {
    if (!object(w) || !keys(w, 'id commentId request state inputs outputs reason createdAt') || !identity(w.id) || !identity(w.commentId) || !commentIds.has(w.commentId) || !identity(w.request) ||
      !['unconnected', 'paused'].includes(String(w.state)) || !pins(w.inputs) || !Array.isArray(w.outputs) ||
      !w.outputs.every(id => identity(id) && resultIds.has(id)) || !unique(w.outputs) || !string(w.reason) || !date(w.createdAt) ||
      workIds.has(w.id) || workComments.has(w.commentId)) invalid();
    const comment = value.comments.find(c => c.id === w.commentId);
    if (comment?.workId !== w.id) invalid();
    workIds.add(w.id); workComments.add(w.commentId);
  }
  if (value.comments.some(c => c.workId !== undefined && !workIds.has(c.workId))) invalid();
  const captured = new Map<string, Pin>();
  const record = value as unknown as ProjectRecord;
  for (const pin of [...record.results.flatMap(r => r.inputs), ...record.comments.map(c => c.pin), ...record.works.flatMap(w => w.inputs)]) {
    const previous = captured.get(pin.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(pin)) invalid();
    captured.set(pin.id, pin);
  }
  for (const a of value.activities) if (!object(a) || !keys(a, 'id at label') || !identity(a.id) || !date(a.at) || !identity(a.label)) invalid();
  if (!unique(value.activities.map(a => a.id))) invalid();
  return structuredClone(value) as unknown as ProjectRecord;
}
const now = () => new Date().toISOString();
export function createProjectRecord(title: string, goal: string): ProjectRecord {
  return readProjectRecord({ id: crypto.randomUUID(), title: title.trim(), goal, archived: false,
    results: [], comments: [], works: [], activities: [], drafts: {} });
}
function activity(record: ProjectRecord, at: string, label: string) { record.activities.push({ id: crypto.randomUUID(), at, label }); }
export function createProjectComment(record: ProjectRecord, input: ProjectCommentInput, at = now()): ProjectRecord {
  const next = readProjectRecord(record);
  if (next.archived) throw new Error('Archived projects cannot accept comments.');
  next.comments.push({ ...structuredClone(input), id: crypto.randomUUID(), body: input.body.trim(), createdAt: at, status: 'open' });
  activity(next, at, 'Comment added');
  return readProjectRecord(next);
}
const unconnectedReason = 'No product Agent is connected. The request has not been applied.';
export function requestProjectWork(record: ProjectRecord, commentId: string, request: string, at = now()): ProjectRecord {
  const next = readProjectRecord(record), comment = next.comments.find(c => c.id === commentId);
  if (next.archived || !comment || !request.trim()) throw new Error('A current comment and explicit request are required.');
  const existing = next.works.find(w => w.commentId === commentId);
  if (existing) {
    if (existing.request === request.trim() && existing.state === 'unconnected') return next;
    existing.request = request.trim(); existing.state = 'unconnected'; existing.reason = unconnectedReason;
  } else {
    const id = crypto.randomUUID(); comment.workId = id;
    next.works.push({ id, commentId, request: request.trim(), state: 'unconnected', inputs: [structuredClone(comment.pin)], outputs: [], reason: unconnectedReason, createdAt: at });
  }
  activity(next, at, 'Revision requested');
  return readProjectRecord(next);
}
export function setProjectWorkPaused(record: ProjectRecord, workId: string, paused: boolean, at = now()): ProjectRecord {
  const next = readProjectRecord(record), work = next.works.find(w => w.id === workId);
  if (next.archived || !work) throw new Error('The work is unavailable.');
  const state = paused ? 'paused' : 'unconnected';
  if (work.state === state) return next;
  work.state = state; work.reason = paused ? 'The request is paused. No document change was applied.' : unconnectedReason;
  activity(next, at, paused ? 'Request paused' : 'Request resumed');
  return readProjectRecord(next);
}
