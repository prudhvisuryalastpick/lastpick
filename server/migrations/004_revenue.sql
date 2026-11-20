-- Ways LastPick earns besides the Customer Pass and Business Pro plans:
--   boosted offers  : a partner pays to feature one offer at the top of customers' home screens for 6, 12 or 24 hours
--   sponsored banners: the LastPick team sells the home-screen banner in a city (or all of India) for some days
CREATE TABLE offer_boosts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    uuid NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hours       int NOT NULL CHECK (hours IN (6, 12, 24)),
  price       int NOT NULL,                       -- list price in rupees
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  paid_by     text,                               -- launch_free (waived during launch) | manual (UPI etc., confirmed by an admin) | gateway
  starts_at   timestamptz,
  ends_at     timestamptz,
  decided_by  uuid,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_boosts_active_idx ON offer_boosts (offer_id) WHERE status = 'active';
CREATE INDEX offer_boosts_status_idx ON offer_boosts (status, created_at DESC);
CREATE INDEX offer_boosts_owner_idx ON offer_boosts (owner_id, created_at DESC);

CREATE TABLE banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  subtitle    text NOT NULL DEFAULT '',
  advertiser  text NOT NULL,
  city_key    text,                               -- NULL = every city
  offer_id    uuid REFERENCES offers (id) ON DELETE SET NULL,
  price       int NOT NULL DEFAULT 0,             -- what the advertiser pays, in rupees
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX banners_live_idx ON banners (active, ends_at);
