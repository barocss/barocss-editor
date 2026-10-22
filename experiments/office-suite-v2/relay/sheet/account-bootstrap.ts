import { randomUUID } from 'node:crypto';
import { SheetReplica } from '../../src/collaboration.ts';
import type { WorkbookCommand, WorkbookContext, WorkbookEvent } from '../../src/contracts.ts';
import { createWorkbookContext } from '../../src/workbook.ts';
import { createPreviewReplica } from '../../preview/sheet/fixture.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const contextFields = ['adapterVersion', 'contractVersion', 'documentId', 'engineVersion', 'generation', 'schemaVersion', 'workbookId'];
const MAX_SEED_EVENTS = 256;

function accountContext(value: WorkbookContext, actorId: string): WorkbookContext {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length ||
      Object.getOwnPropertyNames(value).sort().join(',') !== contextFields.join(',') ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(field => !Object.hasOwn(field, 'value') || !field.enumerable) ||
      typeof actorId !== 'string' || !uuid.test(actorId) ||
      typeof value.documentId !== 'string' || !uuid.test(value.documentId) ||
      typeof value.workbookId !== 'string' || !uuid.test(value.workbookId) ||
      typeof value.generation !== 'string' || !uuid.test(value.generation) ||
      value.contractVersion !== 1 || value.engineVersion !== 1 || value.schemaVersion !== 1 || value.adapterVersion !== 1) {
    throw new TypeError('invalid-account-bootstrap-context');
  }
  return createWorkbookContext({ documentId: value.documentId, workbookId: value.workbookId, generation: value.generation });
}

/** Accept only the existing fixture's single compact-frontier causal chain.
 * Source event IDs/context/identity/bytes are never installed in the target.
 */
function seedCommands(source: SheetReplica): readonly WorkbookCommand[] {
  const events = source.events;
  if (events.length === 0 || events.length > MAX_SEED_EVENTS) throw new Error('unsupported-account-bootstrap-seed');
  const byId = new Map(events.map(event => [event.eventId, event]));
  const successors = new Map<string, WorkbookEvent>();
  let first: WorkbookEvent | undefined;
  for (const event of events) {
    if (event.actorId !== source.identity.actorId || event.sessionId !== source.identity.sessionId ||
        !['sheet.insert', 'axis.insert', 'cells.commit'].includes(event.command.kind)) throw new Error('unsupported-account-bootstrap-seed');
    if (event.dependencies.length === 0) {
      if (first) throw new Error('unsupported-account-bootstrap-seed');
      first = event;
    } else {
      const parent = event.dependencies[0];
      if (event.dependencies.length !== 1 || parent === undefined || !byId.has(parent) || successors.has(parent)) {
        throw new Error('unsupported-account-bootstrap-seed');
      }
      successors.set(parent, event);
    }
  }
  const commands: WorkbookCommand[] = [], visited = new Set<string>();
  for (let event = first; event !== undefined; event = successors.get(event.eventId)) {
    if (visited.has(event.eventId)) throw new Error('unsupported-account-bootstrap-seed');
    visited.add(event.eventId); commands.push(event.command);
  }
  if (visited.size !== events.length || Object.values(source.projection.outcomes).some(outcome => outcome.status !== 'applied')) {
    throw new Error('unsupported-account-bootstrap-seed');
  }
  return commands;
}

/** Fresh account store bootstrap only. Resume must retain the original native bytes. */
export function createAccountBootstrap(context: WorkbookContext, bootstrapActorId: string): SheetReplica {
  const bound = accountContext(context, bootstrapActorId);
  const source = createPreviewReplica();
  let target: SheetReplica | undefined;
  try {
    const commands = seedCommands(source);
    target = new SheetReplica(bound, { actorId: bootstrapActorId, sessionId: randomUUID() });
    for (const command of commands) target.commit(command);
    return target;
  } catch (error) {
    target?.destroy();
    throw error;
  } finally { source.destroy(); }
}
