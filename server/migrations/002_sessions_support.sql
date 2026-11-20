-- One active login per account, and customer/partner support conversations.

-- Each login bumps users.token_version, so the previous device's token stops working.
ALTER TABLE users ADD COLUMN last_login_at timestamptz;
ALTER TABLE users ADD COLUMN last_login_device text NOT NULL DEFAULT '';

-- Support: a customer or partner asks for help; the LastPick team replies in the same thread.
CREATE TABLE support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'partner')),
  topic       text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  state       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, updated_at DESC);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, updated_at DESC);

CREATE TABLE support_messages (
  id          bigserial PRIMARY KEY,
  ticket_id   uuid NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  from_staff  boolean NOT NULL DEFAULT false,
  author_id   uuid,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, id);
