CREATE TABLE `item_image` (
	`item_id` text PRIMARY KEY,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_item_image_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE CASCADE,
	CONSTRAINT "item_image_width_positive" CHECK("width" > 0),
	CONSTRAINT "item_image_height_positive" CHECK("height" > 0),
	CONSTRAINT "item_image_data_length" CHECK(length("data") <= 2000000)
);
--> statement-breakpoint
ALTER TABLE `item` ADD `image_updated_at` integer;