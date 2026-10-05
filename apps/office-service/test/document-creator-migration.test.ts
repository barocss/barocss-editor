import { describe, expect, it } from 'vitest';
import { migrationPlan } from '../src/migrate.js';
import { migrations } from '../src/migrations.js';

describe('additive immutable document creator migration', () => {
  it('appends an ordered migration without changing previous migration entries', () => {
    const plan = migrationPlan(migrations);
    expect(plan.at(-1)?.id).toBe('0015_document_creator_attribution');
    expect(plan.at(-2)?.id).toBe('0014_criterion_verifications');
  });
  it('keeps legacy attribution nullable and identity deletion restricted; rejects creator replacement only', () => {
    const sql = migrations.find(entry => entry.id === '0015_document_creator_attribution')?.sql ?? '';
    expect(sql).toMatch(/ADD COLUMN creator_user_id uuid/);
    expect(sql).toMatch(/REFERENCES wonffice.identities\(id\) ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/UPDATE wonffice.documents|SET NOT NULL|DEFAULT|ON DELETE SET NULL/);
    expect(sql).toMatch(/NEW.creator_user_id IS DISTINCT FROM OLD.creator_user_id/);
    expect(sql).toMatch(/BEFORE UPDATE OF creator_user_id ON wonffice.documents/);
    expect(sql).not.toMatch(/GRANT|CREATE POLICY/);
  });
});
