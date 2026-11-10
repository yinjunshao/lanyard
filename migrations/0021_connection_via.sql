-- Connection provenance (F13). Additive: old code ignores the column.
-- via is how the first scan happened: 'qr' | 'code' | 'link'. Rows made before
-- this migration stay NULL, which reads as "unknown"; nothing is guessed for them.
ALTER TABLE connections ADD COLUMN via TEXT;
