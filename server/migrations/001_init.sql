-- LastPick schema (PostgreSQL 16, Amazon RDS).
-- One database shared by the customer, partner and admin servers.
-- Deleting a user cascades to everything they own (account deletion, DPDP Act 2023).

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text,
  password_hash    text,
  name             text NOT NULL DEFAULT '',
  phone            text NOT NULL DEFAULT '',
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  regions          text[] NOT NULL DEFAULT '{}',
  trial_ends_at    timestamptz,
  consent          jsonb,
  partner_consent  jsonb,
  token_version    int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_phone_idx ON users (phone);
CREATE INDEX users_name_idx ON users (lower(name) text_pattern_ops);
CREATE INDEX users_created_idx ON users (created_at DESC);

-- A business belongs to exactly one owner; its id is the owner's user id.
CREATE TABLE businesses (
  id                     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name                   text NOT NULL,
  category               text NOT NULL DEFAULT 'other',
  categories             text[] NOT NULL DEFAULT '{}',
  about                  text NOT NULL DEFAULT '',
  address                text NOT NULL DEFAULT '',
  area                   text NOT NULL DEFAULT '',
  city                   text NOT NULL DEFAULT '',
  state                  text NOT NULL DEFAULT '',
  city_key               text NOT NULL DEFAULT '',
  pincode                text NOT NULL DEFAULT '',
  lat                    double precision,
  lng                    double precision,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'suspended')),
  status_note            text NOT NULL DEFAULT '',
  report_count           int NOT NULL DEFAULT 0,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  trial_ends_at          timestamptz,
  rating_avg             numeric(2,1),
  rating_count           int NOT NULL DEFAULT 0,
  categories_changed_at  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX businesses_status_idx ON businesses (status, created_at DESC);
CREATE INDEX businesses_state_idx ON businesses (state);
CREATE INDEX businesses_city_idx ON businesses (city_key);
CREATE INDEX businesses_pincode_idx ON businesses (pincode);
CREATE INDEX businesses_geo_idx ON businesses (lat, lng);

-- Kept apart from businesses: customers only get it through /reveal-contact.
CREATE TABLE business_contacts (
  business_id  uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  phone        text NOT NULL,
  whatsapp     boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_contacts_phone_idx ON business_contacts (phone);

CREATE TABLE subscriptions (
  user_id                   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan                      text NOT NULL CHECK (plan IN ('customer', 'owner')),
  status                    text NOT NULL DEFAULT 'created',
  current_period_end        timestamptz,
  provider                  text NOT NULL DEFAULT 'manual',
  provider_subscription_id  text,
  months                    int,
  granted_by                uuid,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan)
);
CREATE INDEX subscriptions_due_idx ON subscriptions (status, current_period_end);

CREATE TABLE offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  category     text NOT NULL,
  emoji        text NOT NULL DEFAULT '📦',
  photo_thumb  text,
  has_photo    boolean NOT NULL DEFAULT false,
  orig_price   numeric(12,2) NOT NULL,
  price        numeric(12,2) NOT NULL,
  quantity     text NOT NULL DEFAULT '',
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended', 'removed')),
  views        int NOT NULL DEFAULT 0,
  flags        text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_owner_idx ON offers (owner_id, created_at DESC);
CREATE INDEX offers_live_idx ON offers (ends_at) WHERE status = 'live';

-- Full-size photo, loaded only on the offer page; deleted as soon as the offer ends.
CREATE TABLE offer_photos (
  offer_id  uuid PRIMARY KEY REFERENCES offers (id) ON DELETE CASCADE,
  data      text NOT NULL
);

-- Compact history of offers that ended more than 7 days ago.
CREATE TABLE offer_archive (
  id             uuid PRIMARY KEY,
  owner_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  business_name  text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  state          text NOT NULL DEFAULT '',
  city_key       text NOT NULL DEFAULT '',
  title          text NOT NULL,
  category       text NOT NULL,
  emoji          text NOT NULL DEFAULT '📦',
  orig_price     numeric(12,2),
  price          numeric(12,2),
  views          int NOT NULL DEFAULT 0,
  leads          int NOT NULL DEFAULT 0,
  status         text NOT NULL,
  created_at     timestamptz,
  ends_at        timestamptz NOT NULL,
  archived_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_archive_owner_idx ON offer_archive (owner_id, ends_at DESC);

-- A customer shared their number with a business for one offer.
CREATE TABLE leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     uuid NOT NULL,
  owner_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Customer',
  phone        text NOT NULL,
  offer_title  text NOT NULL DEFAULT '',
  offer_emoji  text NOT NULL DEFAULT '📦',
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, customer_id)
);
CREATE INDEX leads_owner_idx ON leads (owner_id, created_at DESC);
CREATE INDEX leads_customer_idx ON leads (customer_id, owner_id);

-- Businesses a customer viewed the number of, called, messaged or shared their number with.
CREATE TABLE customer_contacts (
  customer_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  offer_id     uuid NOT NULL,
  business_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  how          text NOT NULL,
  offer        jsonb NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, offer_id)
);
CREATE INDEX customer_contacts_at_idx ON customer_contacts (customer_id, at DESC);
CREATE INDEX customer_contacts_biz_idx ON customer_contacts (customer_id, business_id);

CREATE TABLE reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          text NOT NULL,
  rating        int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text          text NOT NULL DEFAULT '',
  offer_title   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  report_count  int NOT NULL DEFAULT 0,
  reply_text    text,
  reply_at      timestamptz,
  state         text NOT NULL DEFAULT '',
  edited        boolean NOT NULL DEFAULT false,
  hidden_by     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id)
);
CREATE INDEX reviews_business_idx ON reviews (business_id, status, created_at DESC);
CREATE INDEX reviews_customer_idx ON reviews (customer_id);

CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL DEFAULT 'offer' CHECK (type IN ('offer', 'review')),
  offer_id     uuid,
  review_id    uuid,
  business_id  uuid,
  state        text NOT NULL DEFAULT '',
  city         text NOT NULL DEFAULT '',
  reporter_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  reason       text NOT NULL,
  details      text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_open_idx ON reports (status, created_at DESC);
CREATE UNIQUE INDEX reports_one_per_review ON reports (review_id, reporter_id) WHERE review_id IS NOT NULL;

CREATE TABLE grievances (
  ticket       text PRIMARY KEY,
  user_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  email        text NOT NULL DEFAULT '',
  type         text NOT NULL,
  subject      text NOT NULL,
  details      text NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'rejected')),
  reply        text NOT NULL DEFAULT '',
  handled_by   uuid,
  ack_due      timestamptz NOT NULL,
  resolve_due  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grievances_status_idx ON grievances (status, created_at DESC);
CREATE INDEX grievances_user_idx ON grievances (user_id, created_at DESC);

-- Kept after account deletion (no FK), for 1 year: DPDP Rules 2025 rule 8(3).
CREATE TABLE consent_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL,
  kind        text NOT NULL,
  version     text NOT NULL,
  items       text[] NOT NULL DEFAULT '{}',
  user_agent  text NOT NULL DEFAULT '',
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_log_user_idx ON consent_log (user_id);

CREATE TABLE audit_log (
  id     bigserial PRIMARY KEY,
  type   text NOT NULL,
  actor  uuid,
  data   jsonb NOT NULL DEFAULT '{}',
  at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_at_idx ON audit_log (at);

CREATE TABLE deleted_accounts (
  user_id       uuid PRIMARY KEY,
  email_hash    text NOT NULL,
  had_business  boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz NOT NULL DEFAULT now()
);

-- Per-user / per-IP fixed-window counters (scraping and spam protection, shared by all servers).
CREATE TABLE rate_limits (
  key           text NOT NULL,
  action        text NOT NULL,
  window_start  timestamptz NOT NULL,
  n             int NOT NULL,
  PRIMARY KEY (key, action)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

CREATE TABLE config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Background job queue (retries with backoff). Workers claim jobs with FOR UPDATE SKIP LOCKED.
CREATE TABLE jobs (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  run_at        timestamptz NOT NULL DEFAULT now(),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 5,
  last_error    text,
  locked_at     timestamptz,
  locked_by     text,
  done_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due_idx ON jobs (run_at) WHERE done_at IS NULL;

-- Which scheduled tasks ran when (so a task runs once even with several servers).
CREATE TABLE schedule_runs (
  name     text PRIMARY KEY,
  last_at  timestamptz NOT NULL
);
