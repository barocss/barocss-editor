import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('Transaction guard behaviors', () => {
  it('allows end()/commit()/rollback() calls without begin() safely (no throw)', () => {
    const schema = new Schema('test', { topNode: 'document', nodes: { document: { name: 'document', group: 'document', content: 'block+' } }, marks: {} });
    const ds = new DataStore(undefined, schema);
    // Should not throw
    const ops = ds.end();
    expect(Array.isArray(ops)).toBe(true);
    // commit/rollback no-throw
    ds.commit();
    ds.rollback();
  });
});


