import { defineOperationDSL } from '../operations/define-operation-dsl';

type InsertTextOperation = { type: 'insertText'; nodeId?: string; pos: number; text: string };

export const insertText = defineOperationDSL(
  (...args: [number, string] | [string, number, string]) => {
    if (args.length === 2) {
      const [pos, text] = args as [number, string];
      return { type: 'insertText', payload: { pos, text } } as unknown as InsertTextOperation;
    }
    const [nodeId, pos, text] = args as [string, number, string];
    return { type: 'insertText', payload: { nodeId, pos, text } } as unknown as InsertTextOperation;
  },
  { atom: true, category: 'text' }
);


