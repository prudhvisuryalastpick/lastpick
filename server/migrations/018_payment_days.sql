-- Plans are sold as packs of days (partners: 5 days ₹99, 15 days ₹199, 30 days ₹499; customers: 30 days ₹99).
ALTER TABLE payments ADD COLUMN days int NOT NULL DEFAULT 30;
