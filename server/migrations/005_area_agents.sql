-- Area agents: a moderator looks after businesses, reports and complaints in their states,
-- optionally narrowed to some cities and/or pincodes.
ALTER TABLE users ADD COLUMN area_cities   text[] NOT NULL DEFAULT '{}';  -- city keys, e.g. 'bengaluru'
ALTER TABLE users ADD COLUMN area_pincodes text[] NOT NULL DEFAULT '{}';
