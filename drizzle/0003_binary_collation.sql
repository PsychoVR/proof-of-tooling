-- Public keys and signatures are case-sensitive base58. The default collation (utf8mb4_uca1400_ai_ci)
-- is case- and accent-insensitive, which would make two different keys compare equal. ascii_bin
-- compares bytes exactly. Unique indexes are rebuilt automatically.
ALTER TABLE `validators` MODIFY COLUMN `identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `validators` MODIFY COLUMN `vote_account` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `claims` MODIFY COLUMN `identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `claims` MODIFY COLUMN `signature` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `endorsements` MODIFY COLUMN `identity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `endorsements` MODIFY COLUMN `signature` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
