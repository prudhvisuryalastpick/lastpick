-- When the person agreed to get their codes and account messages from LastPick on WhatsApp (Meta requires opt-in).
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_optin_at timestamptz;
