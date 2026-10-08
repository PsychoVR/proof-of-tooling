-- identity is a case-sensitive base58 key: ascii_bin compares bytes exactly (see 0003).
CREATE TABLE `validator_icons` (
	`identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`content_type` varchar(32) NOT NULL,
	`bytes` mediumblob NOT NULL,
	`etag` varchar(64) NOT NULL,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `validator_icons_identity` PRIMARY KEY(`identity`)
);
