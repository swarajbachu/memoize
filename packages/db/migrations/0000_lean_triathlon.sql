CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`sentiment_score` integer,
	`emotions` text,
	`word_count` integer,
	`analyzed` integer DEFAULT false,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`clerk_user_id`) ON UPDATE no action ON DELETE no action
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
