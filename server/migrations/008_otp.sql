-- One-time e-mail codes (sign-up verification). Only a hash of the code is stored; codes last 10 minutes.
CREATE TABLE IF NOT EXISTS otp_codes (
  email      text PRIMARY KEY,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
