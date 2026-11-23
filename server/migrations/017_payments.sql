-- Online payments (Razorpay). One row per checkout: created when the order is made, "paid" once Razorpay's
-- signature (or its order status) confirms the payment. Paying extends the plan by 30 days, once per order.
CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  plan        text NOT NULL CHECK (plan IN ('customer', 'owner')),
  months      int NOT NULL DEFAULT 1,
  amount      int NOT NULL,                       -- rupees
  currency    text NOT NULL DEFAULT 'INR',
  provider    text NOT NULL DEFAULT 'razorpay',
  order_id    text NOT NULL UNIQUE,               -- Razorpay order id (order_…)
  payment_id  text,                               -- Razorpay payment id (pay_…), once paid
  status      text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);
