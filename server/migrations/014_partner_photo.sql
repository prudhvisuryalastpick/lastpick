-- Partner KYC: a profile photo of the owner (small JPEG data URL, about 30-80 KB). Only the partner and admins see it.
CREATE TABLE IF NOT EXISTS user_photos (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
