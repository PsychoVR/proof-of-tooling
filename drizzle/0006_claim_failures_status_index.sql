ALTER TABLE `claims` ADD `failures` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `claims_status_id_idx` ON `claims` (`status`,`id`);