CREATE TABLE `claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tool_id` int NOT NULL,
	`identity` varchar(64) NOT NULL,
	`cluster` enum('mainnet','testnet','alpenglow') NOT NULL,
	`message` text NOT NULL,
	`signature` varchar(128) NOT NULL,
	`signed_date` date NOT NULL,
	`status` enum('active','stale','withdrawn','rejected') NOT NULL DEFAULT 'active',
	`verified_at` timestamp NOT NULL DEFAULT (now()),
	`last_checked_at` timestamp,
	CONSTRAINT `claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `claims_tool_identity_uq` UNIQUE(`tool_id`,`identity`)
);
--> statement-breakpoint
CREATE TABLE `endorsements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tool_id` int NOT NULL,
	`identity` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`signature` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `endorsements_id` PRIMARY KEY(`id`),
	CONSTRAINT `endorsements_tool_identity_uq` UNIQUE(`tool_id`,`identity`)
);
--> statement-breakpoint
CREATE TABLE `seed_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tool_id` int NOT NULL,
	`validator_name` varchar(255) NOT NULL,
	`source_url` varchar(512) NOT NULL,
	`added_by` varchar(128) NOT NULL,
	CONSTRAINT `seed_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`url` varchar(512) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` enum('Monitoring','Explorer','Dashboard','Client','Ops script','Library','Meta') NOT NULL,
	`kind` enum('repo','web') NOT NULL,
	`is_fork` boolean NOT NULL DEFAULT false,
	`stars` int,
	`last_commit_at` timestamp,
	`health` enum('active','slow','dormant','unknown') NOT NULL DEFAULT 'unknown',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tools_id` PRIMARY KEY(`id`),
	CONSTRAINT `tools_url_uq` UNIQUE(`url`),
	CONSTRAINT `tools_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `validators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identity` varchar(64) NOT NULL,
	`cluster` enum('mainnet','testnet','alpenglow') NOT NULL,
	`vote_account` varchar(64) NOT NULL,
	`name` varchar(255),
	`website` varchar(512),
	`icon_url` varchar(512),
	`activated_stake` bigint unsigned NOT NULL DEFAULT 0,
	`version` varchar(64),
	`delinquent` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `validators_id` PRIMARY KEY(`id`),
	CONSTRAINT `validators_identity_cluster_uq` UNIQUE(`identity`,`cluster`)
);
--> statement-breakpoint
ALTER TABLE `claims` ADD CONSTRAINT `claims_tool_id_tools_id_fk` FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endorsements` ADD CONSTRAINT `endorsements_tool_id_tools_id_fk` FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seed_entries` ADD CONSTRAINT `seed_entries_tool_id_tools_id_fk` FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `claims_identity_idx` ON `claims` (`identity`);--> statement-breakpoint
CREATE INDEX `seed_entries_tool_idx` ON `seed_entries` (`tool_id`);--> statement-breakpoint
CREATE INDEX `validators_vote_account_idx` ON `validators` (`vote_account`);