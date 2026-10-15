CREATE TABLE `top_snapshots` (
	`month` varchar(7) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`validators` int NOT NULL,
	`entries` text NOT NULL,
	CONSTRAINT `top_snapshots_month` PRIMARY KEY(`month`)
);
