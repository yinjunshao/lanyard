-- Withdraw and replace (F34). Additive: one nullable column, nothing existing is changed or deleted, and old code
-- never reads it, so this is safe to apply before the new code is deployed.
--
-- When a host replaces one person's item (a leaked key), the person's give row points at the new item and this
-- holds the moment it happened, so the person can be told "Your earlier one was replaced on <date>". No value, no name.
ALTER TABLE drop_gives ADD COLUMN replaced_at INTEGER;
