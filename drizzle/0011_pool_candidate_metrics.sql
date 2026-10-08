-- Stake pool candidates are now measured (validators, active stake, mint name) before they are listed.
-- No new key column, so nothing needs ascii_bin here (see 0010 for the keys).
ALTER TABLE `pool_candidates` ADD `validators_count` int;--> statement-breakpoint
ALTER TABLE `pool_candidates` ADD `total_stake_lamports` bigint unsigned;--> statement-breakpoint
ALTER TABLE `pool_candidates` ADD `mint_name` varchar(80);--> statement-breakpoint
-- Every pending row so far was listed without measuring (about 1,800 pools, mostly one-validator tokens). Pools an admin
-- already decided on (approved or rejected) are kept untouched.
DELETE FROM `pool_candidates` WHERE `status` = 'pending';--> statement-breakpoint
-- Make the next pools run repeat discovery now, so qualifying pools come back measured instead of in a week.
DELETE FROM `job_runs` WHERE `name` = 'pool-discovery';
