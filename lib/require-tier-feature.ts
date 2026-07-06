import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { hasFeature, type SubscriptionTier, type TierFeatures } from '@/lib/entitlements';

const FEATURE_NAMES: Record<keyof TierFeatures, string> = {
  security: 'Security scanning',
  piiMasking: 'PII masking',
  customDataRules: 'Custom data rules',
  outputScanning: 'Output scanning',
  securityIncidents: 'Security incidents',
  auditTrails: 'Audit trails',
  failover: 'Failover',
  customProviders: 'Custom providers',
  semanticCache: 'Semantic cache',
  requestLogs: 'Request logs',
  analyticsDashboard: 'Analytics dashboard',
  costTracking: 'Cost tracking',
  geoAnalytics: 'Geo analytics',
  failoverAnalytics: 'Failover analytics',
  promptRegistry: 'Prompt registry',
  webhooks: 'Webhooks',
  sso: 'SSO',
};

export async function requireTierFeatureForProject(
  projectId: string,
  feature: keyof TierFeatures
): Promise<NextResponse | null> {
  const supabase = createAdminClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', project.organization_id)
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const tier = (org.subscription_tier || 'free') as SubscriptionTier;
  if (!hasFeature(tier, feature)) {
    return NextResponse.json(
      {
        error: `${FEATURE_NAMES[feature]} requires a paid plan`,
        code: 'FEATURE_NOT_INCLUDED',
        upgrade_url: '/billing',
      },
      { status: 403 }
    );
  }

  return null;
}

export async function requireTierFeatureForOrg(
  orgId: string,
  feature: keyof TierFeatures
): Promise<NextResponse | null> {
  const supabase = createAdminClient();

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', orgId)
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const tier = (org.subscription_tier || 'free') as SubscriptionTier;
  if (!hasFeature(tier, feature)) {
    return NextResponse.json(
      {
        error: `${FEATURE_NAMES[feature]} requires a paid plan`,
        code: 'FEATURE_NOT_INCLUDED',
        upgrade_url: '/billing',
      },
      { status: 403 }
    );
  }

  return null;
}
