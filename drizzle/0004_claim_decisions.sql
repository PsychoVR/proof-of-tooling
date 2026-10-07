CREATE TABLE `claim_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`decision` enum('approve','reject') NOT NULL,
	`previous_status` enum('active','pending','stale','withdrawn','rejected') NOT NULL,
	`actor` varchar(64) NOT NULL,
	`decided_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `claim_decisions` ADD CONSTRAINT `claim_decisions_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `claim_decisions_claim_idx` ON `claim_decisions` (`claim_id`);