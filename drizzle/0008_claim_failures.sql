CREATE TABLE `claim_failures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reason` varchar(32) NOT NULL,
	`kind` enum('check','register') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_failures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `claim_failures_created_idx` ON `claim_failures` (`created_at`);