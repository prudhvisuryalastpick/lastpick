-- Partners post only in their own category (plus job openings at their shop).
-- Removed categories: trips and cabs fold into travel; clinics, medical stores, home cleaning and catering into others.
UPDATE offers SET category = 'travel' WHERE category IN ('trips', 'rental');
UPDATE offers SET category = 'other' WHERE category IN ('health', 'pharmacy', 'cleaning', 'catering');
UPDATE offer_archive SET category = 'travel' WHERE category IN ('trips', 'rental');
UPDATE offer_archive SET category = 'other' WHERE category IN ('health', 'pharmacy', 'cleaning', 'catering');
UPDATE businesses SET category = CASE WHEN category IN ('trips', 'rental') THEN 'travel' ELSE 'other' END
  WHERE category IN ('trips', 'rental', 'health', 'pharmacy', 'cleaning', 'catering');
UPDATE businesses SET categories = ARRAY(
  SELECT DISTINCT CASE WHEN c IN ('trips', 'rental') THEN 'travel' WHEN c IN ('health', 'pharmacy', 'cleaning', 'catering') THEN 'other' ELSE c END
  FROM unnest(categories) AS c);
