export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface TierFeatures {
  security: boolean;
  piiMasking: boolean;
  customDataRules: boolean;
  outputScanning: boolean;
  securityIncidents: boolean;
  auditTrails: boolean;
  auditLogs: boolean;
  auditLogIdentityEvents: boolean;
  auditLogExtendedHistory: boolean;
  auditLogAllTimeHistory: boolean;
  auditLogExports: boolean;
  auditLogApiAccess: boolean;
  auditLogSiemStreaming: boolean;
  auditLogComplianceArchives: boolean;
  governanceControls: boolean;
  governanceCustomFrameworks: boolean;
  governanceAdvancedEvidence: boolean;
  governanceBespokeControls: boolean;
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
  teams: boolean;
}

const ALL_FEATURES_ENABLED: TierFeatures = {
  security: true,
  piiMasking: true,
  customDataRules: true,
  outputScanning: true,
  securityIncidents: true,
  auditTrails: true,
  auditLogs: true,
  auditLogIdentityEvents: true,
  auditLogExtendedHistory: true,
  auditLogAllTimeHistory: true,
  auditLogExports: true,
  auditLogApiAccess: true,
  auditLogSiemStreaming: true,
  auditLogComplianceArchives: true,
  governanceControls: true,
  governanceCustomFrameworks: true,
  governanceAdvancedEvidence: true,
  governanceBespokeControls: true,
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
  teams: true,
};

// ─────────────────────────────────────────────────────────────────
// TEMPORARILY UNGATED (2026-07-12, founder decision): most capabilities
// remain available on every tier. The gating misfired repeatedly (request
// logs, analytics, provider keys/BYOK) and read as platform breakage.
//
// Re-gating plan: flip features back per-tier ONE AT A TIME, deliberately,
// with the FeatureUpgradeWall UX (components/billing/FeatureUpgradeWall.tsx)
// wired on every affected page first. The intended future matrix is
// preserved in git history (see this file before this commit).
//
// Explicit existence gates:
//   - teams — Pro, Team, and Enterprise
//   - auditLogs — Pro, Team, and Enterprise
//   - auditLogIdentityEvents, auditLogExtendedHistory, auditLogExports — Team and Enterprise
//   - auditLogAllTimeHistory, auditLogApiAccess, auditLogSiemStreaming,
//     auditLogComplianceArchives — Enterprise
//   - governanceControls — Team and Enterprise. Governance remains
//     readable on Free; organization-wide policy mutations are gated.
//   - governanceCustomFrameworks, governanceAdvancedEvidence,
//     governanceBespokeControls — Enterprise. These sit alongside the
//     Enterprise-only SIEM and compliance-archive infrastructure above.
//
// Still enforced (depth limits, not existence gates):
//   - MEMORY_QUOTA (below) — memory count per project
//   - LOG_RETENTION_RANGE / clampTimeRange (below) — history depth by tier
//   - monthly request limits + spend caps (gateway-middleware)
// ─────────────────────────────────────────────────────────────────
export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  free: {
    ...ALL_FEATURES_ENABLED,
    teams: false,
    auditLogs: false,
    auditLogIdentityEvents: false,
    auditLogExtendedHistory: false,
    auditLogAllTimeHistory: false,
    auditLogExports: false,
    auditLogApiAccess: false,
    auditLogSiemStreaming: false,
    auditLogComplianceArchives: false,
    governanceControls: false,
    governanceCustomFrameworks: false,
    governanceAdvancedEvidence: false,
    governanceBespokeControls: false,
  },
  pro: {
    ...ALL_FEATURES_ENABLED,
    auditLogIdentityEvents: false,
    auditLogExtendedHistory: false,
    auditLogAllTimeHistory: false,
    auditLogExports: false,
    auditLogApiAccess: false,
    auditLogSiemStreaming: false,
    auditLogComplianceArchives: false,
    governanceControls: false,
    governanceCustomFrameworks: false,
    governanceAdvancedEvidence: false,
    governanceBespokeControls: false,
  },
  team: {
    ...ALL_FEATURES_ENABLED,
    auditLogAllTimeHistory: false,
    auditLogApiAccess: false,
    auditLogSiemStreaming: false,
    auditLogComplianceArchives: false,
    governanceCustomFrameworks: false,
    governanceAdvancedEvidence: false,
    governanceBespokeControls: false,
  },
  enterprise: ALL_FEATURES_ENABLED,
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
    throw new Error(
      JSON.stringify({
        error: `${featureNames[feature]} requires ${feature === 'governanceControls'
          ? 'the Team or Enterprise plan'
          : feature === 'governanceCustomFrameworks'
            || feature === 'governanceAdvancedEvidence'
            || feature === 'governanceBespokeControls'
            ? 'the Enterprise plan'
            : 'a paid plan'}`,
        code: errorCode,
        upgrade_url: '/billing',
      })
    );
  }
}

export const DEFAULT_FEATURES: TierFeatures = TIER_FEATURES.free;
