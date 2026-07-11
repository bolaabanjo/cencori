export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface TierFeatures {
  security: boolean;
  piiMasking: boolean;
  customDataRules: boolean;
  outputScanning: boolean;
  securityIncidents: boolean;
  auditTrails: boolean;
  failover: boolean;
  customProviders: boolean;
  semanticCache: boolean;
  requestLogs: boolean;
  analyticsDashboard: boolean;
  advancedAnalytics: boolean;
  costTracking: boolean;
  geoAnalytics: boolean;
  failoverAnalytics: boolean;
  promptRegistry: boolean;
  webhooks: boolean;
  sso: boolean;
}

export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  free: {
    security: false,
    piiMasking: false,
    customDataRules: false,
    outputScanning: false,
    securityIncidents: false,
    auditTrails: false,
    failover: false,
    customProviders: false,
    semanticCache: false,
    // Logs, basic analytics, and cost visibility are free: they're how a
    // free user sees the product working (and how they debug). Monetization
    // comes from retention (see LOG_RETENTION_RANGE) and advanced analytics.
    requestLogs: true,
    analyticsDashboard: true,
    advancedAnalytics: false,
    costTracking: true,
    geoAnalytics: false,
    failoverAnalytics: false,
    promptRegistry: false,
    webhooks: false,
    sso: false,
  },
  pro: {
    security: true,
    piiMasking: true,
    customDataRules: true,
    outputScanning: true,
    securityIncidents: true,
    auditTrails: true,
    failover: true,
    customProviders: false,
    semanticCache: true,
    requestLogs: true,
    analyticsDashboard: true,
    advancedAnalytics: true,
    costTracking: true,
    geoAnalytics: false,
    failoverAnalytics: true,
    promptRegistry: true,
    webhooks: false,
    sso: false,
  },
  team: {
    security: true,
    piiMasking: true,
    customDataRules: true,
    outputScanning: true,
    securityIncidents: true,
    auditTrails: true,
    failover: true,
    customProviders: true,
    semanticCache: true,
    requestLogs: true,
    analyticsDashboard: true,
    advancedAnalytics: true,
    costTracking: true,
    geoAnalytics: true,
    failoverAnalytics: true,
    promptRegistry: true,
    webhooks: true,
    sso: false,
  },
  enterprise: {
    security: true,
    piiMasking: true,
    customDataRules: true,
    outputScanning: true,
    securityIncidents: true,
    auditTrails: true,
    failover: true,
    customProviders: true,
    semanticCache: true,
    requestLogs: true,
    analyticsDashboard: true,
    advancedAnalytics: true,
    costTracking: true,
    geoAnalytics: true,
    failoverAnalytics: true,
    promptRegistry: true,
    webhooks: true,
    sso: true,
  },
};

export function getFeaturesForTier(tier: SubscriptionTier): TierFeatures {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

// ── Log/analytics retention ──
// Free users get logs and basic analytics; history depth is the upsell.
export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';

const TIME_RANGE_ORDER: TimeRange[] = ['1h', '24h', '7d', '30d', '90d', 'all'];

export const LOG_RETENTION_RANGE: Record<SubscriptionTier, TimeRange> = {
  free: '7d',
  pro: '30d',
  team: '90d',
  enterprise: 'all',
};

/**
 * Clamp a requested time range to the tier's retention window.
 * Unknown values fall back to the tier's maximum.
 */
export function clampTimeRange(tier: SubscriptionTier, requested: string): TimeRange {
  const max = LOG_RETENTION_RANGE[tier] || LOG_RETENTION_RANGE.free;
  const requestedIdx = TIME_RANGE_ORDER.indexOf(requested as TimeRange);
  const maxIdx = TIME_RANGE_ORDER.indexOf(max);
  if (requestedIdx === -1 || requestedIdx > maxIdx) {
    return max;
  }
  return TIME_RANGE_ORDER[requestedIdx];
}

export function hasFeature(tier: SubscriptionTier, feature: keyof TierFeatures): boolean {
  return getFeaturesForTier(tier)[feature];
}

// ── Memory quotas ──
// Memory is available on every tier (API opt-in); the quota is the gate.
// Metered by count of memories per project, 10KB content cap per memory.
export const MEMORY_QUOTA: Record<SubscriptionTier, number> = {
  free: 1_000,
  pro: 100_000,
  team: 500_000,
  enterprise: Number.POSITIVE_INFINITY,
};

export function getMemoryQuota(tier: SubscriptionTier): number {
  return MEMORY_QUOTA[tier] ?? MEMORY_QUOTA.free;
}

export function requireFeature(
  tier: SubscriptionTier,
  feature: keyof TierFeatures,
  errorCode: string = 'FEATURE_NOT_INCLUDED'
): void {
  if (!hasFeature(tier, feature)) {
    const featureNames: Record<keyof TierFeatures, string> = {
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
      advancedAnalytics: 'Advanced analytics',
      costTracking: 'Cost tracking',
      geoAnalytics: 'Geo analytics',
      failoverAnalytics: 'Failover analytics',
      promptRegistry: 'Prompt registry',
      webhooks: 'Webhooks',
      sso: 'SSO',
    };
    throw new Error(
      JSON.stringify({
        error: `${featureNames[feature]} requires a paid plan`,
        code: errorCode,
        upgrade_url: '/billing',
      })
    );
  }
}

export const DEFAULT_FEATURES: TierFeatures = TIER_FEATURES.free;