CREATE TABLE `workspace_document_revisions` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`page_id` text NOT NULL,
	`snapshot_text` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `document_id`, `revision`),
	CONSTRAINT "workspace_document_revisions_revision_positive" CHECK("workspace_document_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_document_revisions_owner_request_unique` ON `workspace_document_revisions` (`owner_id`,`request_id`);