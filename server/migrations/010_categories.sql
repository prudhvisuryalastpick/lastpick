-- Categories cut down to: food, stay (hotels), travel, beauty (salon), makeup, fashion, appliances (home appliances),
-- shops, other (+ jobs = hiring, combo). Old categories are moved to the nearest new one.
UPDATE businesses SET category = CASE
  WHEN category IN ('retail', 'tailor') THEN 'fashion'
  WHEN category = 'electronics' THEN 'appliances'
  WHEN category = 'grocery' THEN 'shops'
  WHEN category IN ('food', 'stay', 'travel', 'beauty', 'makeup', 'other') THEN category
  ELSE 'other' END;
UPDATE businesses SET categories = ARRAY[category];
UPDATE offers SET category = CASE
  WHEN category IN ('retail', 'tailor') THEN 'fashion'
  WHEN category = 'electronics' THEN 'appliances'
  WHEN category = 'grocery' THEN 'shops'
  WHEN category IN ('food', 'stay', 'travel', 'beauty', 'makeup', 'other', 'jobs', 'combo') THEN category
  ELSE 'other' END;
