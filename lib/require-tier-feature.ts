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
  auditLogs: 'Organization audit log',
  auditLogIdentityEvents: 'Identity audit events',
  auditLogExtendedHistory: 'Extended audit-log history',
  auditLogAllTimeHistory: 'All-time audit-log history',
  auditLogExports: 'Audit-log exports',
  auditLogApiAccess: 'Audit API access',
  auditLogSiemStreaming: 'SIEM streaming',
  auditLogComplianceArchives: 'Compliance-grade audit archives',
  governanceControls: 'Governance control access',
  governanceCustomFrameworks: 'Custom governance frameworks',
  governanceAdvancedEvidence: 'Advanced governance evidence',
  governanceBespokeControls: 'Bespoke governance controls',
  failover: 'Failover',
  customProviders: 'Custom providers',
  semanticCache: 'Semantic cache',
  requestLogs: 'Request logs',
  analyticsDashboard: 'Analytics dashboard',
  advancedAnalytics: 'Advanced analytics',
  costTracking: 'Cost tracking',
  geoAnalytics: 'Geo analytics',
  failoverAnalytics: 'Failover analytics',
  promptRegistry: 'Prompt registry',
  webhooks: 'Webhooks',
  sso: 'SSO',
  teams: 'Team collaboration',
};

/** The standard 403 body returned when a plan doesn't include a feature. */
export function featureGateResponse(
  feature: keyof TierFeatures,
  requiredTier: 'paid' | 'team' | 'enterprise' = 'paid',
): NextResponse {
  const requirement = requiredTier === 'enterprise'
    ? 'the Enterprise plan'
    : requiredTier === 'team'
      ? 'the Team or Enterprise plan'
      : 'a paid plan';

  return NextResponse.json(
    {
      error: `${FEATURE_NAMES[feature]} requires ${requirement}`,
      code: 'FEATURE_NOT_INCLUDED',
      required_tier: requiredTier === 'enterprise'
        ? 'enterprise'
        : requiredTier === 'team'
          ? 'team'
          : 'pro',
      upgrade_url: '/billing',
    },
    { status: 403 }
  );
}

/**
 * Look up the subscription tier for a project's organization.
 * Returns null when the project or organization doesn't exist.
 */
export async function getProjectTier(projectId: string): Promise<SubscriptionTier | null> {
  const supabase = createAdminClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return null;
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('subscription_tier')
    .eq('id', project.organization_id)
    .single();

  if (orgError || !org) {
    return null;
  }

  return (org.subscription_tier || 'free') as SubscriptionTier;
}

export async function requireTierFeatureForProject(
  projectId: string,
  feature: keyof TierFeatures
): Promise<NextResponse | null> {
  const tier = await getProjectTier(projectId);

  if (!tier) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!hasFeature(tier, feature)) {
    return featureGateResponse(feature);
  }

  return null;
}

export async function requireTierFeatureForOrg(
  orgId: string,
  feature: keyof TierFeatures,
  requiredTier: 'paid' | 'team' | 'enterprise' = 'paid',
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
    return featureGateResponse(feature, requiredTier);
  }

  return null;
}
