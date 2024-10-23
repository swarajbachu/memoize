CREATE TABLE `entry_persons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`person` text NOT NULL,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `person_to_entry` (
	`person_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`person_id`, `entry_id`),
	FOREIGN KEY (`person_id`) REFERENCES `entry_persons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_to_entry` (
	`topic_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`topic_id`, `entry_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `entry_topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entry_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`emoji` text NOT NULL,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
/*
 SQLite does not support "Dropping foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `entries` ADD `title` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `journal_id` text;--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `entries` DROP COLUMN `emotions`;