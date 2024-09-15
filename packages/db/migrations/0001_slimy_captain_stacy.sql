CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`content` text NOT NULL,
	`sentiment_score` integer,
	`word_count` integer,
	`analyzed` integer DEFAULT false,
	`created` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
