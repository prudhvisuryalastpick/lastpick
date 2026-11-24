-- "Request a call back" from Contact LastPick: the team sees it in Admin → Support → Call backs and calls the person.
CREATE TABLE callbacks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('customer', 'partner')),
  topic       text NOT NULL,
  best_time   text NOT NULL,
  note        text NOT NULL DEFAULT '',
  state       text NOT NULL DEFAULT '',          -- the business's state, so moderators see their own area
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz,
  done_by     uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX callbacks_status_idx ON callbacks (status, created_at DESC);
CREATE INDEX callbacks_user_idx ON callbacks (user_id, created_at DESC);
