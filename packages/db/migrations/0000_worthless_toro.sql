CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`sentiment_score` integer,
	`title` text,
	`word_count` integer,
	`journal_id` text,
	`analyzed` integer DEFAULT false NOT NULL,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entry_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`analysis` text NOT NULL,
	`feelings` text,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE TABLE `user` (
	`clerk_user_id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`image` text(255),
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
