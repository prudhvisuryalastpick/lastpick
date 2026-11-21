-- Combos are removed from LastPick: close any combo offers, drop the switch and the column.
UPDATE offers SET status = 'ended', ends_at = least(ends_at, now()) WHERE category = 'combo' AND status = 'live';
DELETE FROM app_settings WHERE key = 'combos';
ALTER TABLE offers DROP COLUMN IF EXISTS combo_items;
