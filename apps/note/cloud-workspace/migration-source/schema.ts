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
