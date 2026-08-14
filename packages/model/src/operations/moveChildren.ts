import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * moveChildren operation (runtime)
 *
 * 목적
 * - 여러 자식을 한 번에 다른 부모로 이동한다. DataStore.content.moveChildren 사용.
 *
 * 입력 형태(DSL)
 * - control(fromParentId, [ moveChildren(toParentId, childIds, position?) ]) → payload: { toParentId, childIds, position? }
 * - moveChildren(fromParentId, toParentId, childIds, position?) → payload: { fromParentId, toParentId, childIds, position? }
 */

defineOperation('moveChildren', async (operation: any, context: TransactionContext) => {
  const { fromParentId, toParentId, childIds, position } = operation.payload;
  const from = context.dataStore.getNode(fromParentId);
  const to = context.dataStore.getNode(toParentId);
  if (!from) throw new Error(`Parent not found: ${fromParentId}`);
  if (!to) throw new Error(`Parent not found: ${toParentId}`);
  /**
   * Where each child actually is, before anything moves.
   *
   * The payload says which parent they are being taken from, and that was
   * believed rather than checked: naming a parent they are not in moved them
   * anyway, and the inverse — built from the name — sent them back to a parent
   * they had never been in. Undo put the document somewhere it had never been.
   *
   * A child that is not in the named parent is the caller being wrong about the
   * document, so it is refused. `moveChildren(from, to, ids)` means *these
   * children of `from`*, and there is no reading of it that covers a child of
   * something else.
   */
  const prevPositions = (childIds || []).map((id: string) => {
    const declared = (context.dataStore.getNode(id) as any)?.parentId;
    const parentId = declared ? context.dataStore.resolveAlias(declared) : declared;
    const parent = parentId ? (context.dataStore.getNode(parentId) as any) : undefined;
    const pos = Array.isArray(parent?.content) ? parent.content.indexOf(id) : undefined;
    return { childId: id, prevParentId: parentId, prevPosition: pos };
  });

  const strays = prevPositions.filter((one: any) => one.prevParentId !== context.dataStore.resolveAlias(fromParentId));
  if (strays.length > 0) {
    return {
      ok: false,
      error:
        `moveChildren: ${strays.map((one: any) => one.childId).join(', ')} ` +
        `${strays.length === 1 ? 'is' : 'are'} not in ${fromParentId}`
    };
  }
  context.dataStore.content.moveChildren(fromParentId, toParentId, childIds, position);
  return {
    ok: true,
    data: { fromParent: context.dataStore.getNode(fromParentId), toParent: context.dataStore.getNode(toParentId) },
    // Back where they came from, at the index the first of them held — which
    // is now a reading of the document rather than a repetition of the payload.
    inverse: {
      type: 'moveChildren',
      payload: {
        fromParentId: toParentId,
        toParentId: fromParentId,
        childIds,
        position: prevPositions[0]?.prevPosition
      }
    }
  };
});



