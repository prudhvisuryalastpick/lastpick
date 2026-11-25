-- Offers are a list of items (name, actual price, offer price); no description or photo needed.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]';
-- ended offers keep only a one-line record: the items as short text ("Kaju katli 400>200; Samosa 60>40")
ALTER TABLE offer_archive ADD COLUMN IF NOT EXISTS items text NOT NULL DEFAULT '';
-- Categories: travel, logistics and shops are gone (Gym, Farm fresh and Local ads added); their partners move to Other.
UPDATE businesses SET category = 'other' WHERE category IN ('travel', 'logistics', 'shops');
UPDATE businesses SET categories = (SELECT coalesce(array_agg(DISTINCT CASE WHEN x IN ('travel', 'logistics', 'shops') THEN 'other' ELSE x END), '{}') FROM unnest(categories) x)
  WHERE categories && ARRAY['travel', 'logistics', 'shops'];
UPDATE offers SET category = 'other' WHERE category IN ('travel', 'logistics', 'shops');
UPDATE offer_archive SET category = 'other' WHERE category IN ('travel', 'logistics', 'shops');
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at);
