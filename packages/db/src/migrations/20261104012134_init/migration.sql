CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`id` text PRIMARY KEY,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`ip_address` text,
	`token` text NOT NULL UNIQUE,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY,
	`image` text,
	`name` text NOT NULL,
	`username` text,
	`display_username` text,
	`role` text DEFAULT 'member' NOT NULL,
	`team_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`phone` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "user_role_check" CHECK("role" in ('super_admin', 'team_admin', 'member')),
	CONSTRAINT "user_status_check" CHECK("status" in ('active', 'disabled')),
	CONSTRAINT "user_username_length" CHECK("username" is null or length("username") between 3 and 30)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exception_event` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`record_id` text,
	`item_id` text,
	`type` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reported_by_user_id` text NOT NULL,
	`reported_by_name` text NOT NULL,
	`resolved_by_user_id` text,
	`resolved_by_name` text,
	`resolution` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_exception_event_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_exception_event_record_id_handover_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `handover_record`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_exception_event_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL,
	CONSTRAINT "exception_event_type_check" CHECK("type" in ('missing', 'damaged', 'count_mismatch', 'other')),
	CONSTRAINT "exception_event_severity_check" CHECK("severity" in ('low', 'medium', 'high')),
	CONSTRAINT "exception_event_status_check" CHECK("status" in ('open', 'resolved')),
	CONSTRAINT "exception_event_description_length" CHECK(length(trim("description")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE `handover_record` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`sub_warehouse_id` text NOT NULL,
	`record_date` text NOT NULL,
	`status` text DEFAULT 'pending_acceptance' NOT NULL,
	`accepted_by_user_id` text,
	`accepted_by_name` text,
	`accepted_at` integer,
	`handover_by_user_id` text,
	`handover_by_name` text,
	`handover_at` integer,
	`acceptance_note` text,
	`handover_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_handover_record_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_handover_record_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE CASCADE,
	CONSTRAINT "handover_record_status_check" CHECK("status" in ('pending_acceptance', 'accepted', 'handover_submitted')),
	CONSTRAINT "handover_record_date_format" CHECK(length("record_date") = 10 and "record_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE TABLE `handover_record_item` (
	`id` text PRIMARY KEY,
	`record_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`item_spec` text,
	`unit` text NOT NULL,
	`expected_qty` integer NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`actual_qty` integer,
	`note` text,
	`accepted_at` integer,
	`handover_checked` integer DEFAULT false NOT NULL,
	`handover_actual_qty` integer,
	`handover_note` text,
	CONSTRAINT `fk_handover_record_item_record_id_handover_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `handover_record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_handover_record_item_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE CASCADE,
	CONSTRAINT "handover_record_item_expected_non_negative" CHECK("expected_qty" >= 0),
	CONSTRAINT "handover_record_item_actual_non_negative" CHECK("actual_qty" is null or "actual_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`sub_warehouse_id` text NOT NULL,
	`name` text NOT NULL,
	`spec` text,
	`unit` text NOT NULL,
	`category` text,
	`stock` integer DEFAULT 0 NOT NULL,
	`min_stock` integer DEFAULT 0 NOT NULL,
	`location` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_item_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_item_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE CASCADE,
	CONSTRAINT "item_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "item_stock_non_negative" CHECK("stock" >= 0),
	CONSTRAINT "item_min_stock_non_negative" CHECK("min_stock" >= 0),
	CONSTRAINT "item_name_length" CHECK(length(trim("name")) between 1 and 80),
	CONSTRAINT "item_unit_length" CHECK(length(trim("unit")) between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE `matter` (
	`id` text PRIMARY KEY,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`qr_token` text NOT NULL,
	`qr_version` integer DEFAULT 1 NOT NULL,
	`qr_changed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_matter_team_id_team_id_fk` FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "matter_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "matter_name_length" CHECK(length(trim("name")) between 1 and 60),
	CONSTRAINT "matter_qr_version_positive" CHECK("qr_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE `revoke_request` (
	`id` text PRIMARY KEY,
	`usage_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_by_name` text,
	`reviewed_at` integer,
	`review_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_revoke_request_usage_id_usage_record_id_fk` FOREIGN KEY (`usage_id`) REFERENCES `usage_record`(`id`) ON DELETE CASCADE,
	CONSTRAINT "revoke_request_status_check" CHECK("status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE `stock_movement` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`sub_warehouse_id` text NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`operator_user_id` text NOT NULL,
	`operator_name` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_stock_movement_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_stock_movement_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_stock_movement_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE CASCADE,
	CONSTRAINT "stock_movement_type_check" CHECK("type" in ('initial', 'inbound', 'consumption', 'revoke', 'adjustment', 'transfer_in', 'transfer_out')),
	CONSTRAINT "stock_movement_stock_after_non_negative" CHECK("stock_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE `stock_transfer` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`from_sub_warehouse_id` text NOT NULL,
	`to_sub_warehouse_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`target_item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`item_spec` text,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	`operator_user_id` text NOT NULL,
	`operator_name` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_stock_transfer_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_stock_transfer_from_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`from_sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_stock_transfer_to_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`to_sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_stock_transfer_source_item_id_item_id_fk` FOREIGN KEY (`source_item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_stock_transfer_target_item_id_item_id_fk` FOREIGN KEY (`target_item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "stock_transfer_quantity_positive" CHECK("quantity" > 0),
	CONSTRAINT "stock_transfer_warehouses_differ" CHECK("from_sub_warehouse_id" <> "to_sub_warehouse_id")
);
--> statement-breakpoint
CREATE TABLE `sub_warehouse` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`location` text,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_sub_warehouse_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT "sub_warehouse_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "sub_warehouse_name_length" CHECK(length(trim("name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "team_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "team_name_length" CHECK(length(trim("name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE `usage_item` (
	`id` text PRIMARY KEY,
	`usage_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`item_spec` text,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	CONSTRAINT `fk_usage_item_usage_id_usage_record_id_fk` FOREIGN KEY (`usage_id`) REFERENCES `usage_record`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_usage_item_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "usage_item_quantity_positive" CHECK("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `usage_record` (
	`id` text PRIMARY KEY,
	`matter_id` text NOT NULL,
	`sub_warehouse_id` text NOT NULL,
	`record_id` text,
	`used_at` text NOT NULL,
	`used_at_time` text,
	`is_backfill` integer DEFAULT false NOT NULL,
	`backfill_reason` text,
	`patient_name` text NOT NULL,
	`patient_type` text NOT NULL,
	`patient_no` text NOT NULL,
	`patient_phone` text,
	`operator_user_id` text NOT NULL,
	`operator_name` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_usage_record_matter_id_matter_id_fk` FOREIGN KEY (`matter_id`) REFERENCES `matter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_usage_record_sub_warehouse_id_sub_warehouse_id_fk` FOREIGN KEY (`sub_warehouse_id`) REFERENCES `sub_warehouse`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_usage_record_record_id_handover_record_id_fk` FOREIGN KEY (`record_id`) REFERENCES `handover_record`(`id`) ON DELETE SET NULL,
	CONSTRAINT "usage_record_status_check" CHECK("status" in ('active', 'revoke_pending', 'revoked')),
	CONSTRAINT "usage_record_patient_type_check" CHECK("patient_type" in ('outpatient', 'inpatient')),
	CONSTRAINT "usage_record_date_format" CHECK(length("used_at") = 10 and "used_at" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "usage_record_time_format" CHECK("used_at_time" is null or "used_at_time" glob '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "usage_record_backfill_reason" CHECK("is_backfill" = 0 or ("backfill_reason" is not null and length(trim("backfill_reason")) between 2 and 300))
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE INDEX `user_team_idx` ON `user` (`team_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `exception_event_matter_status_idx` ON `exception_event` (`matter_id`,`status`);--> statement-breakpoint
CREATE INDEX `exception_event_record_idx` ON `exception_event` (`record_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `handover_record_sub_warehouse_date_unique` ON `handover_record` (`sub_warehouse_id`,`record_date`);--> statement-breakpoint
CREATE INDEX `handover_record_matter_created_idx` ON `handover_record` (`matter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `handover_record_sub_warehouse_created_idx` ON `handover_record` (`sub_warehouse_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `handover_record_status_idx` ON `handover_record` (`status`);--> statement-breakpoint
CREATE INDEX `handover_record_item_record_idx` ON `handover_record_item` (`record_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `handover_record_item_record_item_unique` ON `handover_record_item` (`record_id`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_sub_warehouse_name_unique` ON `item` (`sub_warehouse_id`,`name`);--> statement-breakpoint
CREATE INDEX `item_matter_status_idx` ON `item` (`matter_id`,`status`);--> statement-breakpoint
CREATE INDEX `item_sub_warehouse_status_idx` ON `item` (`sub_warehouse_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `matter_qr_token_unique` ON `matter` (`qr_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `matter_team_name_unique` ON `matter` (`team_id`,`name`);--> statement-breakpoint
CREATE INDEX `matter_team_status_idx` ON `matter` (`team_id`,`status`);--> statement-breakpoint
CREATE INDEX `revoke_request_status_idx` ON `revoke_request` (`status`);--> statement-breakpoint
CREATE INDEX `revoke_request_usage_idx` ON `revoke_request` (`usage_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_item_created_idx` ON `stock_movement` (`item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movement_matter_created_idx` ON `stock_movement` (`matter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movement_sub_warehouse_created_idx` ON `stock_movement` (`sub_warehouse_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_transfer_matter_created_idx` ON `stock_transfer` (`matter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_transfer_from_created_idx` ON `stock_transfer` (`from_sub_warehouse_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_transfer_to_created_idx` ON `stock_transfer` (`to_sub_warehouse_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sub_warehouse_matter_name_unique` ON `sub_warehouse` (`matter_id`,`name`);--> statement-breakpoint
CREATE INDEX `sub_warehouse_matter_status_idx` ON `sub_warehouse` (`matter_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_name_unique` ON `team` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_code_unique` ON `team` (`code`);--> statement-breakpoint
CREATE INDEX `usage_item_usage_idx` ON `usage_item` (`usage_id`);--> statement-breakpoint
CREATE INDEX `usage_item_item_idx` ON `usage_item` (`item_id`);--> statement-breakpoint
CREATE INDEX `usage_record_matter_used_at_idx` ON `usage_record` (`matter_id`,`used_at`);--> statement-breakpoint
CREATE INDEX `usage_record_sub_warehouse_used_at_idx` ON `usage_record` (`sub_warehouse_id`,`used_at`);--> statement-breakpoint
CREATE INDEX `usage_record_record_idx` ON `usage_record` (`record_id`);--> statement-breakpoint
CREATE INDEX `usage_record_status_idx` ON `usage_record` (`status`);