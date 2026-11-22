-- When the mobile number was confirmed with a WhatsApp (or SMS) code at sign-up. Empty = saved but not checked.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
