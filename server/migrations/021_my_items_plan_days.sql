-- My items: a partner's own list of item names (no prices). They add and remove names, and pick from the list when posting.
CREATE TABLE IF NOT EXISTS partner_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_items_name_idx ON partner_items (owner_id, lower(name));

-- Plans: the day of payment is Day 1, and a plan runs till 11:59:59 PM (India time) on its last day.
-- period_start = when the current run began (a top-up keeps it); pack_days = the pack that run was bought with
-- (5, 15 or 30), so the other packs stay closed until it ends.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS period_start timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pack_days int;

-- the last second of an India-time day
CREATE OR REPLACE FUNCTION lp_ist_day_end(ts timestamptz) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS
$$ SELECT ((date_trunc('day', ts AT TIME ZONE 'Asia/Kolkata') + interval '1 day' - interval '1 second') AT TIME ZONE 'Asia/Kolkata') $$;
