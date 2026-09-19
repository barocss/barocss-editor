import { it, expect } from 'vitest';
import { openNoteTree } from '../src/session';
import { validateTree } from '@barocss/schema';
it('creates, resizes, moves, reduces and flattens columns without losing text', async () => {
 const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Keep' }] }] });
 try {
 const e = session.editor, store = e.dataStore;
 const run = store.getAllNodes().find(n => n.text === 'Keep')!;
 e.setRange({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 4, endOffset: 4, collapsed: true });
 expect(await e.executeCommand('insertColumns3')).toBe(true);
 const group = store.getAllNodes().find(n => n.stype === 'proseColumns')!;
 const cols = group.content as string[];
 expect(cols).toHaveLength(3);
 expect(await e.executeCommand('moveToColumn', { nodeId: run.parentId, columnId: cols[2] })).toBe(true);
 expect(await e.executeCommand('setColumnWeight', { nodeId: cols[0], weight: 2 })).toBe(true);
 expect(await e.executeCommand('setColumnCount', { nodeId: group.sid, count: 2 })).toBe(true);
 expect(store.getNode(run.sid!)?.parentId).toBe(run.parentId);
 expect(store.getNode(run.parentId!)?.parentId).toBe(cols[1]);
 expect(validateTree(store.getActiveSchema()!, e.exportDocument())).toEqual([]);
 expect(await e.executeCommand('flattenColumns', { nodeId: group.sid })).toBe(true);
 expect(JSON.stringify(e.exportDocument())).toContain('Keep');
 expect(JSON.stringify(e.exportDocument())).not.toContain('proseColumns');
 await e.undo(); expect(JSON.stringify(e.exportDocument())).toContain('proseColumns');
 expect(await e.executeCommand('setColumnCount', { nodeId: group.sid, count: 5 })).toBe(false);
 e.setEditable(false); expect(await e.executeCommand('flattenColumns', { nodeId: group.sid })).toBe(false);
 } finally { session.close(); }
});
