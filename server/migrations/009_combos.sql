-- Switches the admin can turn on and off (e.g. "combos"), and what a combo offer includes.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- combo offers bundle several services: stay (hotel room), food, pickup (pickup & drop), ironing
ALTER TABLE offers ADD COLUMN IF NOT EXISTS combo_items text[] NOT NULL DEFAULT '{}';
