-- Add Bachs customer ID to organizations (alongside existing polar_customer_id)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS bachs_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_bachs_customer_id
  ON organizations(bachs_customer_id);

-- Add Bachs customer ID to scan_subscriptions
ALTER TABLE scan_subscriptions
ADD COLUMN IF NOT EXISTS bachs_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scan_subscriptions_bachs_customer_id
  ON scan_subscriptions(bachs_customer_id);

-- Webhook event deduplication table
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  charge_id TEXT,
  checkout_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON webhook_events(event_id);

COMMENT ON COLUMN organizations.bachs_customer_id IS 'Bachs customer ID for this organization';
COMMENT ON COLUMN scan_subscriptions.bachs_customer_id IS 'Bachs customer ID for this scan subscription';
