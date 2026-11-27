-- Rentals: homes and workspaces posted by owners for 15 or 30 days (paid per listing), with up to 5 photos and
-- one video (in Cloudflare R2). "Rented out" / "Leased out" or the end date hides a listing at once; its photos
-- and video are deleted 7 days later (it can be reopened until then). A small record stays for history.
CREATE TABLE IF NOT EXISTS rental_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('home', 'work')),
  type          text NOT NULL,
  furnishing    text,                                  -- homes: furnished | semi | unfurnished
  tenant        text,                                  -- homes: family | bachelors | anyone
  rent          int NOT NULL CHECK (rent > 0),         -- rupees a month (per seat for desks and study halls; per day for event halls)
  deposit       int,
  size          int,                                   -- sq ft, or seats
  day_pass      int,                                   -- coworking / study hall: rupees a day
  min_lease     text,                                  -- e.g. "11 months"
  available_from text,
  hours         text,                                  -- opening hours (workspaces)
  about         text NOT NULL DEFAULT '',
  amenities     text[] NOT NULL DEFAULT '{}',
  area          text, city text, state text, pincode text, lat double precision, lng double precision,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'closed', 'expired', 'removed')),
  closed_reason text,                                  -- rented | leased | removed
  days          int,                                   -- 15 or 30 (the last pack bought)
  starts_at     timestamptz,
  ends_at       timestamptz,
  closed_at     timestamptz,
  media_deleted_at timestamptz,
  views         int NOT NULL DEFAULT 0,
  calls         int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_owner_idx ON rental_listings (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_live_idx ON rental_listings (status, lat, lng) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS rental_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES rental_listings (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('photo', 'video')),
  key         text NOT NULL,                           -- R2 key
  position    int NOT NULL DEFAULT 0,
  bytes       int,
  ready       boolean NOT NULL DEFAULT false,          -- true once the upload to R2 is confirmed
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_media_idx ON rental_media (listing_id, kind, position);

-- payments and sales can be for a rental listing too
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_plan_check;
ALTER TABLE payments ADD CONSTRAINT payments_plan_check CHECK (plan IN ('customer', 'owner', 'rental'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES rental_listings (id) ON DELETE SET NULL;
ALTER TABLE plan_sales DROP CONSTRAINT IF EXISTS plan_sales_plan_check;
ALTER TABLE plan_sales ADD CONSTRAINT plan_sales_plan_check CHECK (plan IN ('customer', 'owner', 'rental'));
