-- LastPick is built only on offers from everyday local businesses.
-- Removed: job posts, buy-and-sell of personal items, movie tickets / events, halls & venues.
DELETE FROM offers WHERE category IN ('jobs', 'sell');
UPDATE offers SET category = 'other' WHERE category IN ('events', 'venue');
DELETE FROM offer_archive WHERE category IN ('jobs', 'sell');
UPDATE offer_archive SET category = 'other' WHERE category IN ('events', 'venue');
UPDATE businesses SET category = 'other' WHERE category IN ('events', 'venue', 'jobs', 'sell');
UPDATE businesses SET categories = ARRAY(
  SELECT DISTINCT CASE WHEN c IN ('events', 'venue', 'jobs', 'sell') THEN 'other' ELSE c END FROM unnest(categories) AS c);
