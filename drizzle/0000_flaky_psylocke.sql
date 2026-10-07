CREATE TABLE `heartbeat` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `heartbeat_id` PRIMARY KEY(`id`)
);
