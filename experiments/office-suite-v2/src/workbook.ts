import { CORE_LIMITS, encodeCellKey } from './contracts.ts';
import type {
  WorkbookContext, WorkbookEvent, WorkbookCommand, EventIdentity, ValidationResult,
  CellKey, CellInput, FormulaNode, CellReference, RangeReference, WorkbookProjection,
  SheetProjection, OrderedIdentity, CellRecord, CellAlternative, EventOutcome,
  RefusalCode, WorkbookDiff, Axis,
} from './contracts.ts';

// Only Core's detached, deeply frozen validation outputs acquire this provenance.
// Caller-frozen objects and reparsed event bodies must still pass full admission.
const admittedEvents = new WeakMap<WorkbookEvent, { contextBody: string; body: string }>();
const nativeProjections = new WeakSet<WorkbookProjection>();
// Frozen in core-contract.md before implementation. Exceeding these only disables
// memoization; it does not change native input admission or the complete reducer.
const CHECKPOINT_LIMITS = Object.freeze({ events: 20000, cells: 60000, revisionCodeUnits: 16777216 });
interface NativeCheckpoint {
  readonly contextBody: string;
  readonly input: readonly WorkbookEvent[];
  readonly bodies: ReadonlyMap<string, string>;
  readonly tipId: string;
  readonly cellCount: number;
  readonly projection: WorkbookProjection;
}
let recentCheckpoint: NativeCheckpoint | undefined;
let projectionDepth = 0;

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= CORE_LIMITS.idLength;
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= CORE_LIMITS.textLength;
function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function fields(v: Record<string, unknown>, names: string[]): boolean {
  const keys = Object.keys(v);
  return keys.length === names.length && names.every(name => Object.hasOwn(v, name));
}
function frozen<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const item of Object.values(v)) frozen(item);
    Object.freeze(v);
  }
  return v;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort(compare).map(key => JSON.stringify(key) + ':' + canonical(v[key])).join(',') + '}';
  return JSON.stringify(v);
}
/** Exact JSON equality for Core-owned immutable data, without serialized copies. */
function sameNativeValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameNativeValue(a[i], b[i])) return false;
    return true;
  }
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !sameNativeValue(a[key], b[key])) return false;
  return true;
}
/** Inspect descriptors before touching values: accessors cannot run during admission. */
function jsonProblem(value: unknown, ancestors = new Set<object>(), depth = 0): string | null {
  if (depth > 256) return 'JSON nesting exceeds limit';
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'string') return text(value) ? null : 'String exceeds limit';
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'Non-finite number';
  if (typeof value !== 'object') return 'Non-JSON value';
  if (ancestors.has(value)) return 'Cyclic JSON';
  const array = Array.isArray(value);
  const proto: unknown = Object.getPrototypeOf(value);
  if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return 'Non-plain object';
  if (Object.getOwnPropertySymbols(value).length) return 'Symbol property';
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (array && (value.length > CORE_LIMITS.dependencies || keys.length !== value.length + 1)) return 'Sparse or extended array';
  ancestors.add(value);
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return 'Accessor or hidden property';
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) return 'Extended array';
    const problem = jsonProblem(descriptor.value, ancestors, depth + 1);
    if (problem) return problem;
  }
  ancestors.delete(value);
  return null;
}
function contextShape(v: unknown): v is WorkbookContext {
  return object(v) && fields(v, ['documentId', 'workbookId', 'generation', 'contractVersion', 'engineVersion', 'schemaVersion', 'adapterVersion']) &&
    id(v.documentId) && id(v.workbookId) && id(v.generation) && v.contractVersion === 1 && v.engineVersion === 1 && v.schemaVersion === 1 && v.adapterVersion === 1;
}
function keyShape(v: unknown): v is CellKey {
  return object(v) && fields(v, ['sheetId', 'rowId', 'columnId']) && id(v.sheetId) && id(v.rowId) && id(v.columnId);
}
function referenceShape(v: unknown): v is CellReference {
  return object(v) && fields(v, ['sheetId', 'rowId', 'columnId', 'absRow', 'absColumn', 'sheetQualified']) &&
    id(v.sheetId) && id(v.rowId) && id(v.columnId) && typeof v.absRow === 'boolean' && typeof v.absColumn === 'boolean' && typeof v.sheetQualified === 'boolean';
}
function rangeShape(v: unknown): v is RangeReference {
  return object(v) && fields(v, ['start', 'end', 'policy']) && referenceShape(v.start) && referenceShape(v.end) &&
    v.start.sheetId === v.end.sheetId && v.policy === 'live-interval';
}
function formulaShape(v: unknown, depth = 1, count = { value: 0 }): v is FormulaNode {
  if (++count.value > CORE_LIMITS.astNodes || depth > CORE_LIMITS.astDepth || !object(v)) return false;
  const next = (node: unknown): boolean => formulaShape(node, depth + 1, count);
  switch (v.kind) {
    case 'number': return fields(v, ['kind', 'value']) && typeof v.value === 'number' && Number.isFinite(v.value);
    case 'string': return fields(v, ['kind', 'value']) && text(v.value);
    case 'boolean': return fields(v, ['kind', 'value']) && typeof v.value === 'boolean';
    case 'unary': return fields(v, ['kind', 'operator', 'operand']) && (v.operator === '+' || v.operator === '-') && next(v.operand);
    case 'binary': return fields(v, ['kind', 'operator', 'left', 'right']) && typeof v.operator === 'string' &&
      ['+', '-', '*', '/', '^', '=', '<>', '<', '<=', '>', '>='].includes(v.operator) && next(v.left) && next(v.right);
    case 'call': return fields(v, ['kind', 'name', 'arguments']) && (v.name === 'SUM' || v.name === 'IF') && Array.isArray(v.arguments) &&
      (v.name !== 'IF' || v.arguments.length === 3) && v.arguments.every(next);
    case 'reference': return fields(v, ['kind', 'reference']) && referenceShape(v.reference);
    case 'range': return fields(v, ['kind', 'reference']) && rangeShape(v.reference);
    case 'error': return fields(v, ['kind', 'code']) && typeof v.code === 'string' &&
      ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#CYCLE!', '#LIMIT!', '#UNSUPPORTED!'].includes(v.code);
    case 'unsupported': return fields(v, ['kind', 'source', 'reason']) && text(v.source) && text(v.reason);
    default: return false;
  }
}
function inputShape(v: unknown): v is CellInput {
  if (!object(v)) return false;
  switch (v.kind) {
    case 'literal': return fields(v, ['kind', 'value']) && (v.value === null || typeof v.value === 'boolean' || text(v.value) || typeof v.value === 'number' && Number.isFinite(v.value));
    case 'formula': return fields(v, ['kind', 'version', 'ast', 'context']) && v.version === 1 && keyShape(v.context) && formulaShape(v.ast);
    case 'invalid': return fields(v, ['kind', 'source', 'reason']) && text(v.source) && text(v.reason);
    default: return false;
  }
}
function commandShape(v: unknown): v is WorkbookCommand {
  if (!object(v)) return false;
  switch (v.kind) {
    case 'sheet.insert': return fields(v, ['kind', 'sheetId', 'name', 'afterSheetId']) && id(v.sheetId) && text(v.name) && (v.afterSheetId === null || id(v.afterSheetId));
    case 'axis.insert': return fields(v, ['kind', 'sheetId', 'axis', 'id', 'afterId']) && id(v.sheetId) && (v.axis === 'row' || v.axis === 'column') && id(v.id) && (v.afterId === null || id(v.afterId));
    case 'axis.delete': return fields(v, ['kind', 'sheetId', 'axis', 'id']) && id(v.sheetId) && (v.axis === 'row' || v.axis === 'column') && id(v.id);
    case 'cell.commit': return fields(v, ['kind', 'key', 'input']) && keyShape(v.key) && inputShape(v.input);
    case 'cells.commit': {
      if (!fields(v, ['kind', 'changes']) || !Array.isArray(v.changes) || !v.changes.length || v.changes.length > CORE_LIMITS.batchCells) return false;
      const keys = new Set<string>();
      for (const change of v.changes) {
        if (!object(change) || !fields(change, ['key', 'input']) || !keyShape(change.key) || !inputShape(change.input)) return false;
        const encoded = encodeCellKey(change.key);
        if (keys.has(encoded)) return false;
        keys.add(encoded);
      }
      return true;
    }
    case 'undo': return fields(v, ['kind', 'targetEventId']) && id(v.targetEventId);
    case 'unsupported': return fields(v, ['kind', 'operation']) && ['row.move', 'column.move', 'merge'].includes(String(v.operation));
    default: return false;
  }
}
function eventShape(v: unknown): v is WorkbookEvent {
  return object(v) && fields(v, ['eventId', 'actorId', 'sessionId', 'context', 'dependencies', 'command']) &&
    id(v.eventId) && id(v.actorId) && id(v.sessionId) && contextShape(v.context) && Array.isArray(v.dependencies) &&
    v.dependencies.length <= CORE_LIMITS.dependencies && v.dependencies.every(id) &&
    new Set(v.dependencies).size === v.dependencies.length && !v.dependencies.includes(v.eventId) && commandShape(v.command);
}
export function createWorkbookContext(identity: Pick<WorkbookContext, 'documentId' | 'workbookId' | 'generation'>): WorkbookContext {
  if (jsonProblem(identity) || !object(identity) || !fields(identity, ['documentId', 'workbookId', 'generation'])) throw new TypeError('Invalid workbook context');
  const context: WorkbookContext = { ...identity, contractVersion: 1, engineVersion: 1, schemaVersion: 1, adapterVersion: 1 };
  if (jsonProblem(identity) || !contextShape(context)) throw new TypeError('Invalid workbook context');
  return frozen(context);
}
export function validateEvent(value: unknown, context: WorkbookContext): ValidationResult {
  const problem = jsonProblem(value);
  if (problem) return { ok: false, code: 'INVALID_JSON', message: problem };
  const body = canonical(value);
  if (new TextEncoder().encode(body).length > CORE_LIMITS.eventBytes) return { ok: false, code: 'LIMIT', message: 'Event exceeds byte limit' };
  if (jsonProblem(context) || !contextShape(context) || !object(value) || !contextShape(value.context)) {
    return { ok: false, code: 'INVALID_CONTEXT', message: 'Context/version mismatch' };
  }
  const contextBody = canonical(context);
  if (contextBody !== canonical(value.context)) return { ok: false, code: 'INVALID_CONTEXT', message: 'Context/version mismatch' };
  if (object(value.command) && !['sheet.insert', 'axis.insert', 'axis.delete', 'cell.commit', 'cells.commit', 'undo', 'unsupported'].includes(String(value.command.kind))) {
    return { ok: false, code: 'UNKNOWN_COMMAND', message: 'Unknown command' };
  }
  if (!eventShape(value)) return { ok: false, code: 'INVALID_EVENT', message: 'Malformed event, input, dependencies or limits' };
  // Use the native JSON wire representation, including JSON's -0 -> 0 rule.
  const cloned: unknown = JSON.parse(body);
  if (!eventShape(cloned)) return { ok: false, code: 'INVALID_EVENT', message: 'Invalid canonical event' };
  const event = frozen(cloned);
  admittedEvents.set(event, { contextBody, body });
  return { ok: true, event };
}
export function createEvent(context: WorkbookContext, identity: EventIdentity, dependencies: readonly string[], command: WorkbookCommand): WorkbookEvent {
  if (jsonProblem(identity) || !object(identity) || !fields(identity, ['eventId', 'actorId', 'sessionId']) || jsonProblem(context) || jsonProblem(dependencies) || jsonProblem(command)) throw new TypeError('Invalid event constructor input');
  const result = validateEvent({ ...identity, context, dependencies, command }, context);
  if (!result.ok) throw new TypeError(result.code + ': ' + result.message);
  return result.event;
}
export function requestUndo(context: WorkbookContext, identity: EventIdentity, dependencies: readonly string[], targetEventId: string): WorkbookEvent {
  return createEvent(context, identity, dependencies, { kind: 'undo', targetEventId });
}

interface Entity { id: string; createdBy: string; afterId: string | null; deletions: Set<string> }
interface Sheet extends Entity { name: string; rows: Map<string, Entity>; columns: Map<string, Entity> }
interface Contribution { event: WorkbookEvent; input: CellInput }
interface MutableCell { key: CellKey; contributions: Contribution[] }
function ordered<T extends Entity>(entities: Map<string, T>, events: Map<string, WorkbookEvent>): T[] {
  const children = new Map<string | null, T[]>();
  for (const entity of entities.values()) {
    const siblings = children.get(entity.afterId) ?? [];
    siblings.push(entity);
    children.set(entity.afterId, siblings);
  }
  for (const [anchor, siblings] of children) {
    if (siblings.length < 2) continue;
    const byCreator = new Map(siblings.map(entity => [entity.createdBy, entity]));
    const degrees = new Map(siblings.map(entity => [entity.createdBy, 0]));
    const predecessors = new Map<string, Set<string>>();
    for (const sibling of siblings) {
      const visited = new Set<string>();
      const pending = [...(events.get(sibling.createdBy)?.dependencies ?? [])];
      const before = new Set<string>();
      while (pending.length) {
        const next = pending.pop();
        if (!next || visited.has(next)) continue;
        visited.add(next);
        // Stop at the nearest sibling; its own edges carry older ancestry.
        if (byCreator.has(next)) before.add(next);
        else pending.push(...(events.get(next)?.dependencies ?? []));
      }
      predecessors.set(sibling.createdBy, before);
      for (const earlier of before) degrees.set(earlier, (degrees.get(earlier) ?? 0) + 1);
    }
    const ready: string[] = [];
    for (const [creator, degree] of degrees) if (degree === 0) heapPush(ready, creator);
    const sorted: T[] = [];
    while (ready.length) {
      const creator = heapPop(ready);
      if (creator === undefined) break;
      const entity = byCreator.get(creator);
      if (entity) sorted.push(entity);
      for (const earlier of predecessors.get(creator) ?? []) {
        const degree = (degrees.get(earlier) ?? 0) - 1;
        degrees.set(earlier, degree);
        if (degree === 0) heapPush(ready, earlier);
      }
    }
    children.set(anchor, sorted);
  }
  const result: T[] = [];
  const stack = [...(children.get(null) ?? [])].reverse();
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    result.push(item);
    const descendants = children.get(item.id) ?? [];
    for (let i = descendants.length - 1; i >= 0; i--) {
      const child = descendants[i];
      if (child) stack.push(child);
    }
  }
  return result;
}
/** A min heap keeps deterministic ready-event selection O(log n). */
function heapPush(heap: string[], value: string): void {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    const above = heap[parent];
    if (above === undefined || compare(above, value) <= 0) break;
    heap[index] = above;
    index = parent;
  }
  heap[index] = value;
}
function heapPop(heap: string[]): string | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length || last === undefined) return first;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && compare(heap[child + 1] ?? '', heap[child] ?? '') < 0) child++;
    const below = heap[child];
    if (below === undefined || compare(last, below) <= 0) break;
    heap[index] = below;
    index = child;
  }
  heap[index] = last;
  return first;
}

function checkpointAppend(context: WorkbookContext, contextBody: string, input: readonly WorkbookEvent[], checkpoint: NativeCheckpoint): NativeCheckpoint | null {
  if (contextBody !== checkpoint.contextBody || input.length !== checkpoint.input.length + 1 || input.length > CHECKPOINT_LIMITS.events) return null;
  for (let i = 0; i < checkpoint.input.length; i++) if (input[i] !== checkpoint.input[i]) return null;
  const event = input[input.length - 1];
  if (!event) return null;
  const admitted = admittedEvents.get(event);
  if (admitted?.contextBody !== contextBody || checkpoint.bodies.has(event.eventId) ||
      !event.dependencies.includes(checkpoint.tipId) || event.dependencies.some(dep => !checkpoint.bodies.has(dep))) return null;
  const command = event.command;
  if (command.kind !== 'cell.commit' && command.kind !== 'cells.commit') return null;
  if (checkpoint.projection.revision.length + admitted.body.length + 1 > CHECKPOINT_LIMITS.revisionCodeUnits) return null;
  const changes = command.kind === 'cell.commit' ? [{ key: command.key, input: command.input }] : command.changes;
  const updates: { encoded: string; prior: CellRecord; input: CellInput }[] = [];
  for (const change of changes) {
    const encoded = encodeCellKey(change.key);
    const prior = checkpoint.projection.cells[encoded];
    // Check every target before deriving any part of this atomic batch.
    if (!prior || prior.deleted) return null;
    updates.push({ encoded, prior, input: change.input });
  }
  const cells: Record<string, CellRecord> = Object.assign(Object.create(null), checkpoint.projection.cells);
  for (const update of updates) {
    const alternatives = update.prior.alternatives.map<CellAlternative>(item => ({ ...item, state: item.state === 'undone' ? 'undone' : 'superseded' }));
    const winner: CellAlternative = { eventId: event.eventId, actorId: event.actorId, sessionId: event.sessionId, input: update.input, state: 'winner' };
    alternatives.push(winner);
    cells[update.encoded] = { key: update.prior.key, deleted: false, winner, alternatives };
  }
  const outcomes: Record<string, EventOutcome> = Object.assign(Object.create(null), checkpoint.projection.outcomes);
  outcomes[event.eventId] = { status: 'applied' };
  const bodies = new Map(checkpoint.bodies);
  bodies.set(event.eventId, admitted.body);
  const eventIds = [...checkpoint.projection.eventIds];
  let low = 0;
  let high = eventIds.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(eventIds[middle] ?? '', event.eventId) < 0) low = middle + 1;
    else high = middle;
  }
  eventIds.splice(low, 0, event.eventId);
  const projection = frozen({ context: structuredClone(context), revision: contextBody + '[' + eventIds.map(eventId => bodies.get(eventId)).join(',') + ']',
    sheets: checkpoint.projection.sheets, cells, outcomes, eventIds });
  nativeProjections.add(projection);
  return { contextBody, input: Object.freeze([...input]), bodies, tipId: event.eventId, cellCount: checkpoint.cellCount, projection };
}

function checkpointFromReplay(contextBody: string, input: readonly WorkbookEvent[], events: Map<string, WorkbookEvent>, bodies: Map<string, string>, sorted: readonly WorkbookEvent[], prefix: Map<string, number>, projection: WorkbookProjection): NativeCheckpoint | undefined {
  if (input.length > CHECKPOINT_LIMITS.events || input.length !== events.size || sorted.length !== events.size || projection.revision.length > CHECKPOINT_LIMITS.revisionCodeUnits) return undefined;
  const tip = sorted.at(-1);
  if (!tip) return undefined;
  for (const event of input) if (events.get(event.eventId) !== event || admittedEvents.get(event)?.contextBody !== contextBody) return undefined;
  const cellCount = Object.keys(projection.cells).length;
  if (cellCount > CHECKPOINT_LIMITS.cells) return undefined;
  if (prefix.get(tip.eventId) !== sorted.length - 2) {
    // The prefix shortcut is sufficient but deliberately incomplete at DAG joins.
    // Prove the covering tip directly before memoizing a joined history.
    const covered = new Set([tip.eventId]);
    const pending = [tip];
    while (pending.length) {
      const event = pending.pop();
      if (!event) break;
      for (const dependency of event.dependencies) {
        if (covered.has(dependency)) continue;
        const predecessor = events.get(dependency);
        if (!predecessor) return undefined;
        covered.add(dependency);
        pending.push(predecessor);
      }
    }
    if (covered.size !== events.size) return undefined;
  }
  return { contextBody, input: Object.freeze([...input]), bodies, tipId: tip.eventId, cellCount, projection };
}

export function projectWorkbook(context: WorkbookContext, input: readonly WorkbookEvent[]): WorkbookProjection {
  const outermost = projectionDepth === 0;
  const checkpoint = outermost ? recentCheckpoint : undefined;
  if (outermost) recentCheckpoint = undefined;
  projectionDepth++;
  try {
    return projectWorkbookInternal(context, input, checkpoint, outermost);
  } catch (error) {
    if (outermost) recentCheckpoint = undefined;
    throw error;
  } finally {
    projectionDepth--;
  }
}

function projectWorkbookInternal(context: WorkbookContext, input: readonly WorkbookEvent[], checkpoint: NativeCheckpoint | undefined, mayRemember: boolean): WorkbookProjection {
  if (jsonProblem(context) || !contextShape(context)) throw new TypeError('Invalid projection context');
  const contextBody = canonical(context);
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > CORE_LIMITS.events ||
      Reflect.ownKeys(input).length !== input.length + 1 || Array.from({ length: input.length }, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, i);
        return !descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable;
      }).includes(true)) throw new TypeError('Invalid event collection');
  if (checkpoint) {
    const appended = checkpointAppend(context, contextBody, input, checkpoint);
    if (appended) {
      recentCheckpoint = appended;
      return appended.projection;
    }
  }
  const events = new Map<string, WorkbookEvent>();
  const bodies = new Map<string, string>();
  for (const raw of input) {
    const admitted = admittedEvents.get(raw);
    let event: WorkbookEvent;
    let body: string;
    if (admitted?.contextBody === contextBody) {
      event = raw;
      body = admitted.body;
    } else {
      const checked = validateEvent(raw, context);
      if (!checked.ok) throw new TypeError(checked.code + ': ' + checked.message);
      event = checked.event;
      body = admittedEvents.get(event)?.body ?? canonical(event);
    }
    if (bodies.has(event.eventId) && bodies.get(event.eventId) !== body) throw new TypeError('Event ID body collision: ' + event.eventId);
    events.set(event.eventId, event);
    bodies.set(event.eventId, body);
  }
  const degrees = new Map<string, number>();
  const children = new Map<string, string[]>();
  const ready: string[] = [];
  for (const event of events.values()) {
    degrees.set(event.eventId, event.dependencies.length);
    if (!event.dependencies.length) heapPush(ready, event.eventId);
    for (const dependency of event.dependencies) {
      const list = children.get(dependency) ?? [];
      list.push(event.eventId);
      children.set(dependency, list);
    }
  }
  const sorted: WorkbookEvent[] = [];
  const rank = new Map<string, number>();
  const prefix = new Map<string, number>();
  while (ready.length) {
    const next = heapPop(ready);
    if (next === undefined) break;
    const event = events.get(next);
    if (!event) throw new TypeError('Missing ready event');
    rank.set(next, sorted.length);
    let covered = -1;
    for (const dep of event.dependencies) {
      const depRank = rank.get(dep) ?? -1;
      const depPrefix = prefix.get(dep) ?? -1;
      covered = Math.max(covered, depPrefix, depRank === depPrefix + 1 ? depRank : -1);
    }
    prefix.set(next, covered);
    sorted.push(event);
    for (const child of children.get(next) ?? []) {
      const degree = (degrees.get(child) ?? 0) - 1;
      degrees.set(child, degree);
      if (degree === 0) heapPush(ready, child);
    }
  }
  const reach = new Map<string, Map<string, boolean>>();
  function observes(eventId: string, targetId: string): boolean {
    if (eventId === targetId) return false;
    const targetRank = rank.get(targetId);
    const sourceRank = rank.get(eventId);
    if (targetRank === undefined || sourceRank === undefined || targetRank >= sourceRank) return false;
    if (targetRank <= (prefix.get(eventId) ?? -1)) return true;
    let cache = reach.get(targetId);
    if (!cache) { cache = new Map(); reach.set(targetId, cache); }
    const known = cache.get(eventId);
    if (known !== undefined) return known;
    const stack = [...(events.get(eventId)?.dependencies ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const item = stack.pop();
      if (!item || seen.has(item)) continue;
      if (item === targetId || cache.get(item) === true || targetRank <= (prefix.get(item) ?? -1)) { cache.set(eventId, true); return true; }
      if (cache.get(item) === false || (rank.get(item) ?? -1) < targetRank) continue;
      seen.add(item);
      stack.push(...(events.get(item)?.dependencies ?? []));
    }
    cache.set(eventId, false);
    return false;
  }
  const outcomes: Record<string, EventOutcome> = Object.create(null);
  const sheets = new Map<string, Sheet>();
  const cells = new Map<string, MutableCell>();
  const undone = new Set<string>();
  const refuse = (event: WorkbookEvent, code: RefusalCode): void => { outcomes[event.eventId] = { status: 'refused', code, recoverable: code === 'UNDO_CONFLICT' || code === 'DELETED_TARGET' }; };
  function entityCheck(event: WorkbookEvent, entity: Entity | undefined): RefusalCode | null {
    if (!entity) return 'MISSING_TARGET';
    if (!observes(event.eventId, entity.createdBy)) return 'CAUSAL_TARGET';
    if ([...entity.deletions].some(deletion => observes(event.eventId, deletion))) return 'DELETED_TARGET';
    return null;
  }
  const axisMap = (sheet: Sheet, axis: Axis): Map<string, Entity> => axis === 'row' ? sheet.rows : sheet.columns;
  function checkCell(event: WorkbookEvent, key: CellKey): RefusalCode | null {
    const sheet = sheets.get(key.sheetId);
    const sheetError = entityCheck(event, sheet);
    if (sheetError || !sheet) return sheetError ?? 'MISSING_TARGET';
    return entityCheck(event, sheet.rows.get(key.rowId)) ?? entityCheck(event, sheet.columns.get(key.columnId));
  }
  function addCell(event: WorkbookEvent, key: CellKey, value: CellInput): void {
    const encoded = encodeCellKey(key);
    const cell = cells.get(encoded) ?? { key, contributions: [] };
    cell.contributions.push({ event, input: value });
    cells.set(encoded, cell);
  }
  function inputUses(value: CellInput, sheetId: string, axis: Axis | null, targetId: string): boolean {
    if (value.kind !== 'formula') return false;
    const matches = (key: CellKey): boolean => key.sheetId === sheetId && (axis === null || (axis === 'row' ? key.rowId : key.columnId) === targetId);
    const stack: FormulaNode[] = [value.ast];
    while (stack.length) {
      const node = stack.pop();
      if (!node) break;
      if (node.kind === 'reference' && matches(node.reference)) return true;
      if (node.kind === 'range' && (matches(node.reference.start) || matches(node.reference.end))) return true;
      if (node.kind === 'unary') stack.push(node.operand);
      if (node.kind === 'binary') stack.push(node.left, node.right);
      if (node.kind === 'call') stack.push(...node.arguments);
    }
    return false;
  }
  const eligibleCache = new Map<string, boolean>();
  function eligibleConcurrent(other: WorkbookEvent): boolean {
    const known = eligibleCache.get(other.eventId);
    if (known !== undefined) return known;
    // A concurrent event cannot observe this undo. Admit it against its own
    // complete causal closure, not against a raw payload or arrival order.
    const closure = new Set<string>();
    const pending = [other.eventId];
    while (pending.length) {
      const next = pending.pop();
      if (!next || closure.has(next)) continue;
      const event = events.get(next);
      if (!event || !rank.has(next)) { eligibleCache.set(other.eventId, false); return false; }
      closure.add(next);
      pending.push(...event.dependencies);
    }
    const subset: WorkbookEvent[] = [];
    for (const eventId of closure) {
      const event = events.get(eventId);
      if (event) subset.push(event);
    }
    const applied = projectWorkbook(context, subset).outcomes[other.eventId]?.status === 'applied';
    eligibleCache.set(other.eventId, applied);
    return applied;
  }
  function foreignUse(undo: WorkbookEvent, target: WorkbookEvent, sheetId: string, axis: Axis | null, targetId: string): boolean {
    const matches = (key: CellKey): boolean => key.sheetId === sheetId && (axis === null || (axis === 'row' ? key.rowId : key.columnId) === targetId);
    for (const other of events.values()) {
      if ((other.sessionId === target.sessionId && other.actorId === target.actorId) || undone.has(other.eventId)) continue;
      if (observes(other.eventId, undo.eventId)) continue;
      const c = other.command;
      const uses = c.kind === 'cell.commit' && (matches(c.key) || inputUses(c.input, sheetId, axis, targetId)) ||
        c.kind === 'cells.commit' && c.changes.some(change => matches(change.key) || inputUses(change.input, sheetId, axis, targetId)) ||
        (c.kind === 'axis.insert' || c.kind === 'axis.delete') && c.sheetId === sheetId &&
        (axis === null || c.axis === axis && (c.kind === 'axis.insert' ? c.afterId === targetId : c.id === targetId));
      if (!uses) continue;
      const outcome = outcomes[other.eventId];
      if (outcome ? outcome.status === 'applied' : eligibleConcurrent(other)) return true;
    }
    return false;
  }
  for (const event of sorted) {
    const c = event.command;
    let error: RefusalCode | null = null;
    switch (c.kind) {
      case 'sheet.insert': {
        if (sheets.has(c.sheetId)) { error = 'DUPLICATE_ID'; break; }
        if (c.afterSheetId !== null) error = entityCheck(event, sheets.get(c.afterSheetId));
        if (!error) sheets.set(c.sheetId, { id: c.sheetId, name: c.name, createdBy: event.eventId, afterId: c.afterSheetId, deletions: new Set(), rows: new Map(), columns: new Map() });
        break;
      }
      case 'axis.insert': {
        const sheet = sheets.get(c.sheetId);
        error = entityCheck(event, sheet);
        if (error || !sheet) break;
        const entities = axisMap(sheet, c.axis);
        if (entities.has(c.id)) { error = 'DUPLICATE_ID'; break; }
        if (c.afterId !== null) error = entityCheck(event, entities.get(c.afterId));
        if (!error) entities.set(c.id, { id: c.id, createdBy: event.eventId, afterId: c.afterId, deletions: new Set() });
        break;
      }
      case 'axis.delete': {
        const sheet = sheets.get(c.sheetId);
        error = entityCheck(event, sheet);
        if (error || !sheet) break;
        const entity = axisMap(sheet, c.axis).get(c.id);
        // Concurrent deletions contribute independent markers; a known deletion refuses.
        error = entityCheck(event, entity);
        if (!error && entity) entity.deletions.add(event.eventId);
        break;
      }
      case 'cell.commit':
        error = checkCell(event, c.key);
        if (!error) addCell(event, c.key, c.input);
        break;
      case 'cells.commit':
        for (const change of c.changes) { error = checkCell(event, change.key); if (error) break; }
        if (!error) for (const change of c.changes) addCell(event, change.key, change.input);
        break;
      case 'unsupported': error = 'UNSUPPORTED'; break;
      case 'undo': {
        const target = events.get(c.targetEventId);
        if (!target || !observes(event.eventId, c.targetEventId) || outcomes[c.targetEventId]?.status !== 'applied' || target.command.kind === 'undo' || target.command.kind === 'unsupported') { error = 'UNDO_TARGET'; break; }
        if (target.actorId !== event.actorId || target.sessionId !== event.sessionId) { error = 'UNDO_SESSION'; break; }
        if (undone.has(target.eventId)) { error = 'ALREADY_UNDONE'; break; }
        const command = target.command;
        if (command.kind === 'sheet.insert') {
          if (foreignUse(event, target, command.sheetId, null, command.sheetId)) { error = 'UNDO_CONFLICT'; break; }
          sheets.get(command.sheetId)?.deletions.add(event.eventId);
        }
        if (command.kind === 'axis.insert') {
          if (foreignUse(event, target, command.sheetId, command.axis, command.id)) { error = 'UNDO_CONFLICT'; break; }
          const sheet = sheets.get(command.sheetId);
          if (sheet) axisMap(sheet, command.axis).get(command.id)?.deletions.add(event.eventId);
        }
        if (command.kind === 'axis.delete') {
          const sheet = sheets.get(command.sheetId);
          if (sheet) axisMap(sheet, command.axis).get(command.id)?.deletions.delete(target.eventId);
        }
        undone.add(target.eventId);
        break;
      }
    }
    if (error) refuse(event, error);
    else outcomes[event.eventId] = { status: 'applied' };
  }
  for (const event of [...events.values()].sort((a, b) => compare(a.eventId, b.eventId))) if (!rank.has(event.eventId)) {
    outcomes[event.eventId] = { status: 'pending', missing: event.dependencies.filter(dep => !rank.has(dep)).sort(compare) };
  }
  const identity = (entity: Entity): OrderedIdentity => ({ id: entity.id, createdBy: entity.createdBy, afterId: entity.afterId, deleted: entity.deletions.size > 0, deletedBy: [...entity.deletions].sort(compare) });
  const sheetResult: SheetProjection[] = ordered(sheets, events).map(sheet => ({ ...identity(sheet), name: sheet.name, rows: ordered(sheet.rows, events).map(identity), columns: ordered(sheet.columns, events).map(identity) }));
  const cellResult: Record<string, CellRecord> = Object.create(null);
  for (const [encoded, cell] of [...cells].sort(([a], [b]) => compare(a, b))) {
    const active = cell.contributions.filter(item => !undone.has(item.event.eventId));
    const maximal = active.filter(item => !active.some(other => observes(other.event.eventId, item.event.eventId)));
    const winning = maximal.at(-1)?.event.eventId;
    const alternatives: CellAlternative[] = cell.contributions.map(item => ({ eventId: item.event.eventId, actorId: item.event.actorId, sessionId: item.event.sessionId, input: item.input,
      state: undone.has(item.event.eventId) ? 'undone' : item.event.eventId === winning ? 'winner' : maximal.includes(item) ? 'alternative' : 'superseded' }));
    const sheet = sheets.get(cell.key.sheetId);
    const deleted = !sheet || sheet.deletions.size > 0 || !sheet.rows.has(cell.key.rowId) || !sheet.columns.has(cell.key.columnId) ||
      (sheet.rows.get(cell.key.rowId)?.deletions.size ?? 0) > 0 || (sheet.columns.get(cell.key.columnId)?.deletions.size ?? 0) > 0;
    cellResult[encoded] = { key: cell.key, deleted, winner: alternatives.find(item => item.state === 'winner') ?? null, alternatives };
  }
  const eventIds = [...events.keys()].sort(compare);
  const projection = frozen({ context: structuredClone(context), revision: contextBody + '[' + eventIds.map(eventId => bodies.get(eventId)).join(',') + ']', sheets: sheetResult, cells: cellResult, outcomes, eventIds });
  nativeProjections.add(projection);
  if (mayRemember) recentCheckpoint = checkpointFromReplay(contextBody, input, events, bodies, sorted, prefix, projection);
  return projection;
}

export function diffWorkbook(before: WorkbookProjection, after: WorkbookProjection): WorkbookDiff {
  if (canonical(before.context) !== canonical(after.context)) throw new TypeError('Cannot diff different workbook contexts');
  const native = nativeProjections.has(before) && nativeProjections.has(after);
  const same = native ? sameNativeValue : (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
  const changedCellKeys: CellKey[] = [];
  for (const key of [...new Set([...Object.keys(before.cells), ...Object.keys(after.cells)])].sort(compare)) {
    if (!same(before.cells[key] ?? null, after.cells[key] ?? null)) {
      const cell = after.cells[key] ?? before.cells[key];
      if (cell) changedCellKeys.push(cell.key);
    }
  }
  const prior = new Map(before.sheets.map(sheet => [sheet.id, sheet]));
  const later = new Map(after.sheets.map(sheet => [sheet.id, sheet]));
  const changedStructureSheetIds = [...new Set([...prior.keys(), ...later.keys()])].sort(compare)
    .filter(sheetId => !same(prior.get(sheetId) ?? null, later.get(sheetId) ?? null));
  return frozen({ changedCellKeys, changedStructureSheetIds, revision: after.revision });
}
