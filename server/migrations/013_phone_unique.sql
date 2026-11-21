-- Login is by mobile number (WhatsApp code), so a mobile number belongs to exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone) WHERE phone <> '';
