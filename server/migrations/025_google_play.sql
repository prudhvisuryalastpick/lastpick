-- Google Play payments (partner app): the same plans and prices, bought through Google Play's billing.
-- order_id holds our own reference (gp_…) for these; purchase_token is Google's token, each counted once.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_token text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_purchase_token_key ON payments (purchase_token) WHERE purchase_token IS NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false; -- Google test purchase (license testers): no money
