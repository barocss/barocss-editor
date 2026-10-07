import { describe, expect, it } from 'vitest';
import { migrationPlan } from '../src/migrate.js';
import { migrations } from '../src/migrations.js';

describe('additive immutable document creator migration', () => {
  it('appends an ordered migration without changing previous migration entries', () => {
    const plan = migrationPlan(migrations);
    expect(plan.map(entry => entry.id)).toEqual([
      '0001_tenant_workspaces', '0002_oidc_memberships', '0003_member_tenant_names',
      '0004_document_snapshots', '0005_platform_operators', '0006_company_member_admin',
      '0007_document_collaboration_seed', '0008_document_capabilities', '0009_full_note_collaboration_seed',
      '0010_member_directory', '0011_connected_projects', '0012_project_execution_attempts',
      '0013_criterion_confirmations', '0014_criterion_verifications', '0015_document_creator_attribution',
      '0016_schema_registry',
    ]);
    expect(plan.at(-1)?.id).toBe('0016_schema_registry');
    expect(plan.at(-2)?.id).toBe('0015_document_creator_attribution');
    expect(plan.at(-3)?.id).toBe('0014_criterion_verifications');
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
