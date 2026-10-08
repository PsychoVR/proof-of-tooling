-- Keys and addresses are case-sensitive base58 (or ascii ids): ascii_bin compares bytes exactly (see 0003 and 0009).
CREATE TABLE `job_runs` (
	`name` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`last_run_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_runs_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `pool_candidates` (
	`pool` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`pool_mint` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`validator_list` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`withdraw_authority` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`program` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`first_seen` timestamp NOT NULL DEFAULT (now()),
	`last_seen` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`name` varchar(80),
	`logo_id` varchar(40),
	`decided_at` timestamp,
	`decided_by` varchar(64),
	CONSTRAINT `pool_candidates_pool` PRIMARY KEY(`pool`)
);
--> statement-breakpoint
CREATE TABLE `validator_pool_scan` (
	`identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`scanned_at` timestamp NOT NULL DEFAULT (now()),
	`epoch` int NOT NULL,
	CONSTRAINT `validator_pool_scan_identity` PRIMARY KEY(`identity`)
);
--> statement-breakpoint
CREATE TABLE `validator_pool_stake` (
	`identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`pool_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`lamports` bigint unsigned NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `validator_pool_stake_identity_pool_id_pk` PRIMARY KEY(`identity`,`pool_id`)
);
--> statement-breakpoint
CREATE TABLE `validator_sfdp` (
	`identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`participant` boolean NOT NULL,
	`checked_at` timestamp NOT NULL DEFAULT (now()),
	`last_ok_at` timestamp,
	CONSTRAINT `validator_sfdp_identity` PRIMARY KEY(`identity`)
);
--> statement-breakpoint
CREATE INDEX `pool_candidates_status_idx` ON `pool_candidates` (`status`,`first_seen`);