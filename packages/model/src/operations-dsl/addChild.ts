import { defineOperationDSL } from '../operations/define-operation-dsl';
import type { INode } from '@barocss/datastore';

/**
 * addChild operation (DSL + runtime)
 *
 * 목적
 * - 부모에 자식 노드를 position 위치에 추가한다. DataStore.content.addChild 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ addChild(child, position?) ]) → payload: { child, position? }
 * - addChild(parentId, child, position?) → payload: { parentId, child, position? }
 */

interface AddChildOperation {
  type: 'addChild';
  parentId: string;
  child: INode | string;
  position?: number;
}

export const addChild = defineOperationDSL(
  (...args: [INode | string, (number)?] | [string, INode | string, (number)?]) => {
    // control: (child, position?)
    if (args.length >= 1 && (typeof args[0] === 'string' || typeof args[0] === 'object') && (args.length === 1 || typeof args[1] === 'number')) {
      const [child, position] = args as [INode | string, (number)?];
      return { type: 'addChild', payload: { child, position } } as unknown as AddChildOperation;
    }
    // direct: (parentId, child, position?)
    const [parentId, child, position] = args as [string, INode | string, (number)?];
    return { type: 'addChild', payload: { parentId, child, position } } as unknown as AddChildOperation;
  },
  { atom: false, category: 'content' }
);


