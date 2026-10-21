CREATE TABLE `office_store_revisions` (
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`namespace` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer NOT NULL,
	`deleted` integer NOT NULL,
	`entry_json` text NOT NULL,
	`snapshot_text` text NOT NULL,
	`saved_at` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`batch_index` integer NOT NULL,
	`batch_size` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `workspace_id`, `namespace`, `name`, `revision`),
	CONSTRAINT "office_store_revision_positive" CHECK("office_store_revisions"."revision" > 0),
	CONSTRAINT "office_store_deleted_boolean" CHECK("office_store_revisions"."deleted" IN (0, 1)),
	CONSTRAINT "office_store_batch_bounds" CHECK("office_store_revisions"."batch_index" >= 0 AND "office_store_revisions"."batch_size" > "office_store_revisions"."batch_index")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_store_request_item_unique` ON `office_store_revisions` (`owner_id`,`workspace_id`,`request_id`,`batch_index`);--> statement-breakpoint
CREATE TABLE `office_owner_workspaces` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_owner_workspaces_workspace_id_unique` ON `office_owner_workspaces` (`workspace_id`);