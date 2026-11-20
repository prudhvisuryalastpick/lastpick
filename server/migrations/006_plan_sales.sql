-- Every Customer Pass / Business Pro sale (today: activated by an admin after a payment outside the app;
-- later: the payment gateway). The Revenue page adds these up instead of estimating.
CREATE TABLE plan_sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  plan        text NOT NULL CHECK (plan IN ('customer', 'owner')),
  months      int NOT NULL,
  amount      int NOT NULL,                 -- rupees
  source      text NOT NULL DEFAULT 'manual', -- manual (admin) | gateway
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_sales_created_idx ON plan_sales (created_at DESC);
