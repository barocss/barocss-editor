import { describe, expect, it } from 'vitest';
import { migrationPlan } from '../src/migrate.js';
import { assertUuid } from '../src/tenant-store.js';

describe('migration input contract', () => {
  it('rejects duplicate, reordered, and malformed migration identities', () => {
    for (const ids of [['0001_a', '0001_a'], ['0002_b', '0001_a'], ['user supplied']]) {
      expect(() => migrationPlan(ids.map(id => ({ id, sql: 'SELECT 1' })))).toThrow('invalid_migration_plan');
    }
    expect(() => migrationPlan([{ id: '0001_a', sql: ' ' }])).toThrow('invalid_migration_plan');
  });
  it('binds a migration identity to its exact SQL bytes', () => {
    const a = migrationPlan([{ id: '0001_a', sql: 'SELECT 1' }])[0];
    const b = migrationPlan([{ id: '0001_a', sql: 'SELECT 2' }])[0];
    expect(a.checksum).not.toBe(b.checksum);
    expect(a.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

it('rejects malformed tenant identifiers before opening a connection', () => {
  for (const value of ['', "'; SET ROLE wonffice_owner", 'tenant-a', ' aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']) {
    expect(() => assertUuid(value)).toThrow('invalid_id');
  }
  expect(() => assertUuid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).not.toThrow();
});
