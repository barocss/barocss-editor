import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Performance Smoke (medium scale)', () => {
  it('handles ~1000 nodes and 100 transactions quickly', () => {
    const schema = new Schema('perf', {
      topNode: 'doc',
      nodes: {
        doc: { name: 'doc', group: 'document', content: 'block+' },
        p: { name: 'p', group: 'block', content: 'inline*' },
        t: { name: 't', group: 'inline' }
      },
      marks: {}
    });
    const ds = new DataStore(undefined, schema);
    const doc = { sid: 'd', stype: 'doc', content: [] as string[], attributes: {} } as any;
    ds.setNode(doc, false);

    // Create ~1000 nodes: 200 paragraphs with 4 text children each
    let created = 0;
    for (let i = 0; i < 200; i++) {
      const pid = `p:${i}`;
      ds.setNode({ sid: pid, stype: 'p', content: [] as string[], parentId: 'd', attributes: {} } as any, false);
      doc.content!.push(pid);
      for (let j = 0; j < 4; j++) {
        const tid = `t:${i}:${j}`;
        ds.setNode({ sid: tid, stype: 't', text: `N${i}-${j}`, parentId: pid, attributes: {} } as any, false);
        const pNode = ds.getNode(pid) as any;
        if (pNode.content) {
          pNode.content.push(tid);
        } else {
          pNode.content = [tid];
        }
        created++;
      }
    }
    ds.updateNode('d', { content: doc.content }, false);

    const start = Date.now();
    // Run 100 transactions mixing update/move/delete operations
    for (let k = 0; k < 100; k++) {
      ds.begin();
      // Touch 10 text nodes
      for (let i = 0; i < 10; i++) {
        const tid = `t:${(k + i) % 200}:${(k + i) % 4}`;
        if (ds.getNode(tid)) {
          ds.updateNode(tid, { text: `U${k}-${i}` } as any, false);
        }
      }
      // Optional move between paragraphs
      const srcP = `p:${k % 200}`;
      const dstP = `p:${(k * 7) % 200}`;
      const src = ds.getNode(srcP);
      if (src && src.content && src.content.length > 0) {
        const movedId = src.content[0] as string;
        // If destination equals source or overlay-deleted, moveNode handles accordingly
        ds.moveNode(movedId, dstP);
      }
      // Optional delete a tail text node
      const delId = `t:${(k * 13) % 200}:${(k * 11) % 4}`;
      if (ds.getNode(delId)) ds.deleteNode(delId);
      ds.end();
      ds.commit();
    }
    const ms = Date.now() - start;
    // Soft budget: ensure smoke completes promptly on CI/dev (not a strict perf gate)
    expect(ms).toBeLessThan(1500);
    expect(created).toBeGreaterThan(0);
  });
});


