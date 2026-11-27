-- Support Desk (support.lastpick.in): tickets with a number (#LP-10001), the person's area (state, city,
-- pincode) so area in-charges see only their tickets, photos on messages (R2), and how a ticket was resolved
-- (the customer said solved, the team resolved it on a call, or it closed itself 3 days after an answer).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'moderator', 'admin', 'support'));

CREATE SEQUENCE IF NOT EXISTS support_ticket_no START 10001;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS number bigint;
UPDATE support_tickets SET number = nextval('support_ticket_no') WHERE number IS NULL;
ALTER TABLE support_tickets ALTER COLUMN number SET DEFAULT nextval('support_ticket_no');
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS pincode text NOT NULL DEFAULT '';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_by text CHECK (resolved_by IN ('customer', 'call', 'staff', 'auto'));
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_note text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_reply_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_customer_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false;
UPDATE support_tickets SET last_customer_at = created_at WHERE last_customer_at IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_desk_idx ON support_tickets (status, updated_at DESC);

ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}';
