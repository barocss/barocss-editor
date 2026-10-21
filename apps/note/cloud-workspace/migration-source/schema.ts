import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const documentRevisions = sqliteTable('workspace_document_revisions', {
  ownerId: text('owner_id').notNull(),
  documentId: text('document_id').notNull(),
  revision: integer('revision').notNull(),
  title: text('title').notNull(),
  pageId: text('page_id').notNull(),
  snapshotText: text('snapshot_text').notNull(),
  snapshotHash: text('snapshot_hash').notNull(),
  requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
  savedAt: text('saved_at').notNull()
}, table => [
  primaryKey({ columns: [table.ownerId, table.documentId, table.revision] }),
  uniqueIndex('workspace_document_revisions_owner_request_unique').on(table.ownerId, table.requestId),
  check('workspace_document_revisions_revision_positive', sql`${table.revision} > 0`)
]);

export const officeWorkspaces = sqliteTable('office_owner_workspaces', {
  ownerId: text('owner_id').primaryKey(),
  workspaceId: text('workspace_id').notNull().unique()
});
export const officeRevisions = sqliteTable('office_store_revisions', {
  ownerId: text('owner_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  namespace: text('namespace').notNull(),
  name: text('name').notNull(),
  revision: integer('revision').notNull(),
  deleted: integer('deleted').notNull(),
  entryJson: text('entry_json').notNull(),
  snapshotText: text('snapshot_text').notNull(),
  savedAt: integer('saved_at').notNull(),
  requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
  batchIndex: integer('batch_index').notNull(),
  batchSize: integer('batch_size').notNull()
}, table => [
  primaryKey({ columns: [table.ownerId, table.workspaceId, table.namespace, table.name, table.revision] }),
  uniqueIndex('office_store_request_item_unique').on(table.ownerId, table.workspaceId, table.requestId, table.batchIndex),
  check('office_store_revision_positive', sql`${table.revision} > 0`),
  check('office_store_deleted_boolean', sql`${table.deleted} IN (0, 1)`),
  check('office_store_batch_bounds', sql`${table.batchIndex} >= 0 AND ${table.batchSize} > ${table.batchIndex}`)
]);
