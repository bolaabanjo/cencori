-- Stripe platform billing for Cencori plan subscriptions.
-- Bachs customer data remains in place for legacy subscriptions, credit top-ups,
-- and Scan purchases while plan checkout moves to Stripe.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_provider TEXT;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_billing_provider_check
  CHECK (billing_provider IS NULL OR billing_provider IN ('stripe', 'bachs', 'polar'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

UPDATE organizations
SET billing_provider = 'bachs'
WHERE billing_provider IS NULL
  AND bachs_customer_id IS NOT NULL
  AND subscription_id IS NOT NULL
  AND subscription_tier <> 'free';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (
    subscription_status IN (
      'active',
      'cancelled',
      'past_due',
      'trialing',
      'incomplete',
      'unpaid',
      'paused'
    )
  );

COMMENT ON COLUMN organizations.stripe_customer_id IS
  'Stripe Customer ID used for Cencori plan subscriptions';

COMMENT ON COLUMN organizations.billing_provider IS
  'Provider currently responsible for this organization subscription';

COMMENT ON COLUMN organizations.subscription_status IS
  'Provider-normalized subscription lifecycle status';
